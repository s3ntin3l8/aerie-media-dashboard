#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { SETTLE_TITLES } from "./catalog.mjs";
import { playwrightBrowsersPath, isLoopbackUrl } from "./env.mjs";
import { startDemo } from "./instance.mjs";
import { iconTile, posterForRef } from "./posters.mjs";

/**
 * Reproducible screenshot pipeline: boot an isolated demo instance (fake upstream +
 * scratch database + next dev, see ./instance.mjs), capture, tear down.
 *
 *   npm run screenshots                                   # README set
 *   npm run screenshots -- --profile landing --out DIR    # landing-page stills + loop
 *
 * Profiles:
 *  - `readme` (default): Home and Streams × {dark, light} into `docs/screenshots/`.
 *  - `landing`: dark-only 2x stills sized for the s3ntin3l8.de landing page, plus a short
 *    silent loop of the live Home dashboard (webm + mp4 + poster, needs ffmpeg on PATH).
 *    Written to --out.
 *
 * Auth: the first-run setup form on /login creates a throwaway local admin through the
 * app's own `createInitialAdmin` action; nothing writes the database directly.
 *
 * Clean: besides one known dev-mode CSP message, a console error or uncaught exception fails
 * the run, so a half-rendered page can't ship as a screenshot.
 *
 * Offline: the browser may only talk to loopback. The two hosts the app would otherwise
 * reach (the TMDB poster CDN, fetched server-side by /api/artwork, and the dashboard-icons
 * CDN) are answered from ./posters.mjs, and any other request fails the run.
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const README_DIR = path.join(REPO_ROOT, "docs/screenshots");
const ICON_CDN = "cdn.jsdelivr.net";

const { values } = parseArgs({
  options: {
    profile: { type: "string", default: "readme" },
    out: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});
if (!["readme", "landing"].includes(values.profile))
  throw new Error(`unknown --profile "${values.profile}" (readme | landing)`);
if (values.profile === "landing" && !values.out)
  throw new Error("--profile landing needs --out <dir>");

// `text`: a catalogue title the screen must be showing before it is captured, because
// Overseerr titles and posters are enriched on later polls than the first snapshot.
const SCREENS = [
  { slug: "home", path: "/", text: SETTLE_TITLES[0] },
  { slug: "streams", path: "/streams" },
  { slug: "requests", path: "/requests", text: SETTLE_TITLES[0] },
  { slug: "status", path: "/status" },
];
const README_SLUGS = ["home", "streams"];
const THEMES = ["dark", "light"];

// Landing profile: one desktop size at 2x (crisp when the page zooms into crops) and one
// phone size at 3x, dark only. Matches the shared spec in personal-landing.
const LANDING_FACTORS = [
  { name: "desktop", width: 1600, height: 1000, deviceScaleFactor: 2 },
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 3 },
];
// The phone layout only needs the screens that read well in one column.
const MOBILE_SLUGS = ["home"];
const LOOP_SECONDS = 8;

/**
 * Headless Chromium on Linux hints glyphs by default, snapping their advances to the pixel
 * grid, which reads as gaps inside words at small text sizes. Unhinted glyphs keep the
 * font's own spacing. The switch is FreeType's, so Linux-only.
 */
const CHROMIUM_ARGS = ["--font-render-hinting=none"];

/** Hide the Next.js dev-tools indicator (the round "N" badge); `next dev` is what runs. */
const DEV_INDICATOR_HIDE_CSS = "nextjs-portal { display: none !important; }";

/**
 * The console errors the run tolerates; anything else fails it (see newContext).
 *  - `next dev` under Aerie's own CSP (no 'unsafe-eval') makes React log the eval() message once
 *    per page. It is a dev-mode artifact, not a defect in what is captured.
 *  - Status' metric cards render `<Sparkline data={[]}>` until the first snapshot arrives, and
 *    Sparkline turns empty data into an invalid path ("L260 40 L0 40 Z" with no moveto). It is
 *    transient, and the settled page is unaffected.
 */
const KNOWN_ERRORS = [
  /eval\(\) is not supported in this environment/,
  /<path> attribute d: Expected moveto path command/,
];

/**
 * Evaluated in the page, so it must be self-contained. Returns whether the screen is ready,
 * or with `describe` the readiness conditions still unmet.
 */
function pendingConditions({ text, describe }) {
  // Overseerr requests render as "Request 41" until their title is enriched.
  const placeholder = /\bRequest \d+\b/.exec(document.body.innerText);
  const pending = [];
  if (placeholder) pending.push(`unenriched "${placeholder[0]}" still shown`);
  const portal = document.querySelector("nextjs-portal")?.shadowRoot;
  if (/Compiling|Building/.test(portal?.textContent ?? "")) pending.push("dev server compiling");
  // Only what is in view: lazy images below the fold or in an overflowing row never load
  // (and never appear in the capture) until scrolled to.
  const inView = (img) => {
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const unloaded = [...document.images].filter(
    (img) => inView(img) && (!img.complete || img.naturalWidth === 0),
  );
  if (unloaded.length > 0)
    pending.push(`${unloaded.length} image(s) not loaded, e.g. ${unloaded.slice(0, 3).map((img) => img.currentSrc || img.src).join(", ")}`);
  if (text && !document.body.innerText.includes(text)) pending.push(`"${text}" not shown yet`);
  return describe ? pending : pending.length === 0;
}

async function settle(page, { slug, text = "" }) {
  await page.evaluate(() => document.fonts.ready);
  // Function form, not a string: the app's CSP has no 'unsafe-eval'.
  try {
    await page.waitForFunction(pendingConditions, { text }, { timeout: 60_000, polling: 250 });
  } catch (err) {
    const pending = await page.evaluate(pendingConditions, { text, describe: true }).catch(() => ["page unavailable"]);
    throw new Error(
      `${slug}: page did not settle within 60 s (${pending.join("; ")}); ` +
        `check that the fake upstream populates this screen`,
      { cause: err },
    );
  }
  // Let entrance animations (fadeIn/slideRight) and the first live tick finish.
  await page.waitForTimeout(800);
  // The dev badge is hidden only now: the checks above still read its "Compiling" label.
  await page.addStyleTag({ content: DEV_INDICATOR_HIDE_CSS });
}

/**
 * A browser context that can only reach loopback. Everything the app would fetch from the
 * internet is answered locally; anything else is recorded in `violations` and blocked, as is
 * any console error or uncaught exception (see KNOWN_ERRORS).
 */
async function newContext(browser, theme, options, violations) {
  const context = await browser.newContext({ colorScheme: theme, ...options });
  // The first visit to each route waits on `next dev` compiling it.
  context.setDefaultNavigationTimeout(120_000);
  // Anything the page logs as an error would otherwise be invisible once the dev badge is
  // hidden, so it fails the run (a 502 poster, a hydration error, an uncaught exception).
  context.on("console", (msg) => {
    if (msg.type() === "error" && !KNOWN_ERRORS.some((known) => known.test(msg.text())))
      violations.push(`console error: ${msg.text().slice(0, 300)}`);
  });
  context.on("weberror", (err) => violations.push(`uncaught: ${err.error().message.slice(0, 300)}`));
  // The theme script in app/layout.tsx reads this before hydration, so <html> has the
  // right class from first paint.
  await context.addInitScript((t) => {
    try {
      window.localStorage.setItem("aerie.theme", t);
    } catch {
      // Opaque-origin frames (about:blank, sandboxed iframes) deny storage access.
    }
  }, theme);
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/artwork" && url.searchParams.get("svc") === "overseerr") {
      // The app server fetches these from image.tmdb.org itself, out of reach of a
      // browser route, so the browser request is answered with the local poster instead.
      const { contentType, body } = posterForRef(url.searchParams.get("ref") ?? "");
      return route.fulfill({ status: 200, contentType, body });
    }
    if (url.hostname === ICON_CDN) {
      const slug = path.basename(url.pathname).replace(/\.[^.]+$/, "");
      const { contentType, body } = iconTile(slug);
      return route.fulfill({ status: 200, contentType, body });
    }
    if (isLoopbackUrl(url.href) || url.protocol === "data:" || url.protocol === "blob:")
      return route.continue();
    violations.push(`blocked request: ${url.href}`);
    return route.abort();
  });
  return context;
}

/** Creates the throwaway admin through the first-run setup form; returns the signed-in state. */
async function signIn(browser, demo, violations) {
  const context = await newContext(browser, "dark", { viewport: { width: 1280, height: 800 } }, violations);
  const page = await context.newPage();
  await page.goto(`${demo.webUrl}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="name"]', demo.login.name);
  await page.fill('input[name="email"]', demo.login.email);
  await page.fill('input[name="password"]', demo.login.password);
  await page.fill('input[name="confirm"]', demo.login.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  const state = await context.storageState();
  await context.close();
  return state;
}

// Not `networkidle`: the portal polls /api/snapshot every few seconds, so the network is never
// idle. `settle` waits for the content itself instead.
async function shoot(page, demo, screen, file) {
  await page.goto(`${demo.webUrl}${screen.path}`, { waitUntil: "load" });
  await settle(page, screen);
  // Write-then-rename so a crashed run never leaves a half-written file.
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}`);
  await page.screenshot({ path: tmp, fullPage: false });
  await rename(tmp, file);
  console.log(`captured ${path.basename(file)}`);
}

function ffmpeg(args) {
  const res = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
  if (res.error || res.status !== 0) throw new Error(`ffmpeg ${args.join(" ")} failed`);
}

/** Records the live Home dashboard (streams advancing, queue filling); returns written files. */
async function recordLoop(browser, demo, state, outDir, violations) {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
    console.warn("ffmpeg not found; skipping the landing loop");
    return [];
  }
  // Playwright records video in viewport (CSS) pixels regardless of deviceScaleFactor, so
  // the loop is 1x while the stills are 2x. Fine for a muted background loop.
  const size = { width: 1600, height: 1000 };
  const videoDir = await mkdtemp(path.join(tmpdir(), "aerie-loop-"));
  const context = await newContext(
    browser,
    "dark",
    { viewport: size, deviceScaleFactor: 1, storageState: state, recordVideo: { dir: videoDir, size } },
    violations,
  );
  const started = Date.now();
  const page = await context.newPage();
  await page.goto(`${demo.webUrl}/`, { waitUntil: "load" });
  await settle(page, { slug: "home-loop", text: SETTLE_TITLES[0] });
  const offset = (Date.now() - started) / 1000;
  await page.waitForTimeout(LOOP_SECONDS * 1000);
  await context.close();

  const videos = (await readdir(videoDir)).filter((f) => f.endsWith(".webm"));
  if (videos.length !== 1) throw new Error(`expected one recording in ${videoDir}, found ${videos.length}`);
  const src = path.join(videoDir, videos[0]);
  const base = path.join(outDir, "home-live");
  const trim = ["-ss", offset.toFixed(2), "-i", src, "-an"];
  // Bitrate-capped so the loop stays small enough to ship on the landing page.
  ffmpeg([...trim, "-c:v", "libvpx-vp9", "-b:v", "300k", "-crf", "36", "-row-mt", "1", `${base}.webm`]);
  ffmpeg([
    ...trim,
    ...["-c:v", "libx264", "-crf", "26", "-maxrate", "300k", "-bufsize", "1200k"],
    ...["-pix_fmt", "yuv420p", "-movflags", "+faststart", `${base}.mp4`],
  ]);
  ffmpeg(["-sseof", "-0.5", "-i", src, "-frames:v", "1", "-q:v", "3", `${base}.jpg`]);
  await rm(videoDir, { recursive: true, force: true });
  return ["home-live.webm", "home-live.mp4", "home-live.jpg"];
}

async function captureLanding(browser, demo, state, violations) {
  const outDir = path.resolve(values.out);
  await mkdir(outDir, { recursive: true });
  const written = [];
  for (const factor of LANDING_FACTORS) {
    const context = await newContext(
      browser,
      "dark",
      {
        viewport: { width: factor.width, height: factor.height },
        deviceScaleFactor: factor.deviceScaleFactor,
        isMobile: factor.name === "mobile",
        hasTouch: factor.name === "mobile",
        storageState: state,
      },
      violations,
    );
    const page = await context.newPage();
    for (const screen of SCREENS) {
      if (factor.name === "mobile" && !MOBILE_SLUGS.includes(screen.slug)) continue;
      const filename = `${screen.slug}-${factor.name}.png`;
      await shoot(page, demo, screen, path.join(outDir, filename));
      written.push(filename);
    }
    await context.close();
  }
  written.push(...(await recordLoop(browser, demo, state, outDir, violations)));
  return written;
}

async function captureReadme(browser, demo, state, violations) {
  await mkdir(README_DIR, { recursive: true });
  // Capture into a staging dir outside the repo and copy in only once every shot
  // succeeded, so an aborted run can't leave a mix of refreshed and stale screenshots.
  const staging = await mkdtemp(path.join(tmpdir(), "aerie-readme-shots-"));
  const written = [];
  try {
    for (const theme of THEMES) {
      const context = await newContext(
        browser,
        theme,
        { viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, storageState: state },
        violations,
      );
      const page = await context.newPage();
      for (const screen of SCREENS.filter((s) => README_SLUGS.includes(s.slug))) {
        const filename = `${screen.slug}-${theme}.png`;
        await shoot(page, demo, screen, path.join(staging, filename));
        written.push(filename);
      }
      await context.close();
    }
    for (const filename of written) {
      const tmp = path.join(README_DIR, `.${filename}.tmp`);
      try {
        await copyFile(path.join(staging, filename), tmp);
        await rename(tmp, path.join(README_DIR, filename));
      } finally {
        await rm(tmp, { force: true });
      }
    }
    return written;
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== "linux")
    console.warn(
      `--font-render-hinting=none only applies on Linux (this is ${process.platform}); ` +
        `text spacing here may differ from the committed captures`,
    );
  // Browsers live under the real HOME; only the demo's server processes get a scratch one.
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= playwrightBrowsersPath();
  const demo = await startDemo({ quiet: true, keep: values.keep });
  try {
    const browser = await chromium.launch({ args: CHROMIUM_ARGS });
    const violations = [];
    try {
      console.log(`[screenshots] capturing (${values.profile} profile)...`);
      const state = await signIn(browser, demo, violations);
      const written =
        values.profile === "landing"
          ? await captureLanding(browser, demo, state, violations)
          : await captureReadme(browser, demo, state, violations);
      if (violations.length > 0)
        throw new Error(`the capture was not clean:\n  - ${[...new Set(violations)].join("\n  - ")}`);
      console.log(`[screenshots] done: ${written.length} files (${values.profile} profile)`);
    } finally {
      await browser.close();
    }
  } finally {
    console.log("[screenshots] tearing down the demo...");
    await demo.stop();
  }
}

main().catch((err) => {
  console.error("[screenshots] failed:", err);
  process.exitCode = 1;
});
