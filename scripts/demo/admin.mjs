import { chmod } from "node:fs/promises";
import { chromium } from "playwright";
import { playwrightBrowsersPath } from "./env.mjs";

/**
 * Creates the demo's throwaway admin through the app's own first-run setup form on /login
 * (`createInitialAdmin` creates the account and signs in), so nothing writes the database
 * directly. Returns the signed-in Playwright storage state; with `storageStatePath` it is also
 * written there (mode 0600), for a caller that drives its own browser (the audit capture).
 *
 * The browser runs in this process with the real HOME, where Playwright keeps its browsers;
 * only the demo's server processes get the scratch one.
 *
 * `onSessionWritten` fires right after the file is written, before anything that can still fail
 * (the chmod, closing the browser), so a caller that owns cleanup of that file knows when it exists.
 *
 * @param {{ webUrl: string, login: { name: string, email: string, password: string }, storageStatePath?: string, onSessionWritten?: () => void }} options
 */
export async function createDemoAdmin({ webUrl, login, storageStatePath, onSessionWritten }) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= playwrightBrowsersPath();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    // The first visit waits on `next dev` compiling the route.
    context.setDefaultNavigationTimeout(120_000);
    const page = await context.newPage();
    // A submit before the page has hydrated (a cold `next dev` compiles the route, and the first load can also
    // reload itself) is a plain form post that lands on /login again and creates nothing, so a try that does not
    // leave /login is repeated on a fresh load. Safe because the admin only exists once a try has left /login.
    const attempts = 4;
    for (let attempt = 1; ; attempt++) {
      await page.goto(`${webUrl}/login`, { waitUntil: "networkidle" });
      // The setup form has a confirm field; the plain login form (an admin already exists) does not.
      if ((await page.locator('input[name="confirm"]').count()) === 0)
        throw new Error("the first-run setup form is not shown: the demo database already has an admin");
      if (attempt > 1) console.warn(`[demo] sign-in attempt ${attempt} of ${attempts} (the form posted before the page hydrated)`);
      await page.fill('input[name="name"]', login.name);
      await page.fill('input[name="email"]', login.email);
      await page.fill('input[name="password"]', login.password);
      await page.fill('input[name="confirm"]', login.password);
      await page.click('button[type="submit"]', { noWaitAfter: true });
      try {
        await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });
        break;
      } catch (err) {
        if (attempt === attempts) throw err;
      }
    }
    const state = await context.storageState(storageStatePath ? { path: storageStatePath } : undefined);
    if (storageStatePath) onSessionWritten?.();
    if (storageStatePath) await chmod(storageStatePath, 0o600);
    return state;
  } finally {
    await browser.close();
  }
}

/**
 * Overseerr request titles and posters are looked up in the background and only appear on a
 * later poll of /api/snapshot (a request shows as "Request 41" until then). The lookup is cached
 * in the server, so polling the snapshot as the demo admin until no placeholder is left means the
 * first page any caller loads already has its titles, instead of the ready line being a promise
 * the page keeps only after a further poll or two.
 *
 * @param {{ webUrl: string, state: { cookies: { name: string, value: string }[] }, timeoutMs?: number, intervalMs?: number }} options
 */
export async function warmEnrichment({ webUrl, state, timeoutMs = 90_000, intervalMs = 1_000 }) {
  const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${webUrl}/api/snapshot`, { headers: { cookie }, signal: AbortSignal.timeout(30_000) });
      const body = await res.text();
      if (res.ok && !/"title":"Request \d+"/.test(body)) return;
      last = res.ok ? "request titles still placeholders" : `HTTP ${res.status}`;
    } catch (err) {
      last = String(err?.message ?? err);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`the demo's request titles were not enriched within ${timeoutMs / 1000}s (${last})`);
}
