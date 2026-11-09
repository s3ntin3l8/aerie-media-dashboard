// App hooks for visual-kit (see CONTRACT.md). They run inside the visual-kit image and reach the demo over HTTP,
// plus the host through visual/host-hooks.sh. What they do is what the capture script this replaced did besides
// taking the pictures: sign in as the demo admin, pick the theme, answer the icon CDN, and wait for the page.

/** The demo as the browser reaches it (the launcher aliases the host when it has no host network). */
function demoOrigin(cfg) {
  const url = new URL(cfg.demo.url);
  if (process.env.VISUAL_KIT_HOST_ALIAS) url.hostname = process.env.VISUAL_KIT_HOST_ALIAS;
  return url.origin;
}

const escapeXml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** A neutral rounded tile with the slug's initial: stands in for a dashboard-icons logo (the demo is offline). */
function iconTile(slug) {
  const initial = escapeXml(slug.trim().charAt(0).toUpperCase() || "?");
  const hue = [...slug].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 360, 7);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="14" fill="hsl(${hue} 38% 42%)"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="32" fill="#fff">${initial}</text></svg>`;
}

// A route's first load on a cold `next dev` compiles it, and the page behind it fills in over the next polls. Each
// route is loaded once, unshot, before its first shot, per demo (the base and the head of a check are different
// servers, each with its own session).
const warmed = new Set();

/** What is still pending on the page, as short reasons (empty when it is ready). Runs in the page. */
function pending() {
  const reasons = [];
  // Overseerr requests render as "Request 41" until their title is enriched on a later poll.
  const placeholder = /\bRequest \d+\b/.exec(document.body.innerText);
  if (placeholder) reasons.push(`unenriched "${placeholder[0]}" still shown`);
  const portal = document.querySelector("nextjs-portal")?.shadowRoot;
  if (/Compiling|Building/.test(portal?.textContent ?? "")) reasons.push("dev server compiling");
  // Only what is in view: lazy images below the fold never load until scrolled to.
  const inView = (img) => {
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const unloaded = [...document.images].filter((img) => inView(img) && (!img.complete || img.naturalWidth === 0));
  if (unloaded.length > 0)
    reasons.push(`${unloaded.length} image(s) not loaded, e.g. ${unloaded.slice(0, 3).map((img) => img.currentSrc || img.src).join(", ")}`);
  return reasons;
}

export async function beforeScene({ context, page, scene, variant, cfg, host }) {
  const origin = demoOrigin(cfg);

  // Not cached: the base and the head demo of a check have different secrets.
  const cookies = JSON.parse(await host("session"));
  await context.addCookies(
    cookies.map(({ name, value, httpOnly, sameSite }) => ({ name, value, url: origin, httpOnly, sameSite })),
  );

  // The theme script in app/layout.tsx reads this before hydration, so <html> has the right class from first paint.
  await context.addInitScript((theme) => {
    try {
      window.localStorage.setItem("aerie.theme", theme);
    } catch {
      // Opaque-origin frames (about:blank, sandboxed iframes) deny storage access.
    }
  }, variant.scheme);

  // The icon CDN is the app's own choice and unreachable offline: answer it locally.
  await context.route(/^https:\/\/cdn\.jsdelivr\.net\//, (route) => {
    const slug = new URL(route.request().url()).pathname.split("/").pop().replace(/\.[^.]+$/, "");
    return route.fulfill({ status: 200, contentType: "image/svg+xml", body: iconTile(slug) });
  });

  // Every scene states its upstream clock: stills are frozen at DEMO_NOW, the loop runs from it.
  await host("clock", scene.loop ? "live" : "frozen");

  // Not in a loop's recording context: a second page there would be recorded and shift the trim.
  const key = `${cookies.map((c) => c.value).join()}${scene.path}`;
  if (scene.loop || warmed.has(key)) return;
  warmed.add(key);
  const warm = await context.newPage();
  try {
    await warm.goto(new URL(scene.path, origin).toString(), { waitUntil: "load", timeout: 120_000 });
    await warm.waitForFunction(pending, null, { timeout: 90_000, polling: 250 }).catch(() => {});
  } finally {
    await warm.close();
  }
}

export async function settle({ page, scene }) {
  // Function form, not a string: a string predicate is eval()'d in the page, which the production CSP forbids.
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { timeout: 30_000 });
  await page.waitForFunction(pending, null, { timeout: 60_000, polling: 250 }).catch(async () => {
    const left = await page.evaluate(pending).catch(() => ["page unavailable"]);
    throw new Error(`${scene.name}: not ready after 60s (${left.join("; ")}); check that the fake upstream fills this screen`);
  });
  // Entrance animations (fadeIn/slideRight) and the first live tick: wait until every element has held its box
  // for 1.5 s.
  await page
    .evaluate(async () => {
      const boxes = () =>
        [...document.querySelectorAll("body *")]
          .map((e) => {
            const r = e.getBoundingClientRect();
            return [r.x, r.y, r.width, r.height].map((n) => n.toFixed(2)).join(",");
          })
          .join("|");
      let last = boxes();
      let steady = 0;
      for (let i = 0; i < 80; i++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const now = boxes();
        steady = now === last ? steady + 1 : 0;
        if (steady >= 6) return;
        last = now;
      }
      throw new Error("the page keeps moving");
    })
    .catch((err) => {
      throw new Error(`${scene.name}: ${err.message.split("\n")[0]}`);
    });
  // The Next dev badge is hidden only now: the check above reads its "Compiling" label.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
}
