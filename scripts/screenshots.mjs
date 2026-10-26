// Signs in and captures every page in the light and the dark theme, so the look can be reviewed without clicking
// through the app. Needs the local stack running and the samples loaded. Usage: npm run screenshots
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = process.env.WMS_APP ?? 'http://localhost:4200';
const USER = process.env.WMS_USER ?? 'alice';
const PASSWORD = process.env.WMS_PASSWORD ?? 'wms-dev-123';
const OUT = fileURLToPath(new URL('../screenshots/', import.meta.url));

/** [file name, path] */
const PAGES = [
  ['inbox', '/inbox'],
  ['requests', '/requests'],
  ['documents', '/documents'],
  ['document-search', '/documents/search'],
  ['dashboard', '/dashboard'],
  ['notifications', '/notifications'],
  ['profile', '/profile'],
  ['forms', '/admin/forms'],
  ['processes', '/admin/processes'],
  ['document-types', '/admin/document-types'],
  ['audit', '/admin/audit'],
  ['monitor', '/admin/monitor'],
  ['org-chart', '/admin/org-chart'],
  ['forbidden', '/forbidden'],
];

/** [file name, list page, selector of the first link to follow] : pages that need something to exist first. */
const DETAILS = [
  ['request-detail', '/requests', 'main a[href^="/requests/"]'],
  ['form-editor', '/admin/forms', 'main a[href^="/admin/forms/"]'],
  ['process-designer', '/admin/processes', 'main a[href^="/admin/processes/"]'],
  ['document', '/documents', 'main a[href^="/documents/"]:not([href^="/documents/folders"]):not([href="/documents/search"])'],
  ['documents-folder', '/documents', 'main [data-testid="tree-link"][href^="/documents/folders/"]'],
];

async function settle(page) {
  await page.waitForSelector('main');
  await page.waitForTimeout(1500); // lists load, fonts settle
}

async function signIn(page) {
  await page.goto(`${APP}/inbox`);
  await page.waitForSelector('#username', { timeout: 30000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login');
  await page.waitForSelector('app-shell', { timeout: 30000 });
}

async function capture(page, name, theme) {
  await page.screenshot({ path: `${OUT}${name}-${theme}.png`, fullPage: true });
  console.log(`  ${name}-${theme}.png`);
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const theme of ['light', 'dark']) {
    console.log(theme);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
    await context.addInitScript((chosen) => {
      try {
        localStorage.setItem('wms.theme', chosen);
      } catch {
        // not our origin
      }
    }, theme);
    const page = await context.newPage();
    await signIn(page);

    for (const [name, path] of PAGES) {
      await page.goto(APP + path);
      await settle(page);
      await capture(page, name, theme);
    }

    for (const [name, list, link] of DETAILS) {
      await page.goto(APP + list);
      await settle(page);
      const first = page.locator(link).first();
      if ((await first.count()) === 0) {
        console.log(`  (skipped ${name}: nothing to open on ${list})`);
        continue;
      }
      await first.click();
      await settle(page);
      await capture(page, name, theme);
    }

    // States that only appear after a click.
    await page.goto(`${APP}/inbox`);
    await settle(page);
    const task = page.locator('[data-testid="task-row"]').first();
    if ((await task.count()) > 0) {
      await task.click();
      await settle(page);
      await capture(page, 'inbox-task-open', theme);
    }
    await page.goto(`${APP}/admin/audit`);
    await settle(page);
    const details = page.locator('[data-testid="toggle-data"]').first();
    if ((await details.count()) > 0) {
      await details.click();
      await page.waitForTimeout(800);
      await capture(page, 'audit-details-open', theme);
    }
    await page.click('[data-testid="bell"]');
    await page.waitForTimeout(800);
    await capture(page, 'bell-open', theme);
    await page.keyboard.press('Escape');
    await page.click('[data-testid="user-menu"]');
    await page.waitForTimeout(300);
    await capture(page, 'user-menu-open', theme);

    // A phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${APP}/inbox`);
    await settle(page);
    await capture(page, 'inbox-mobile', theme);
    await page.click('[data-testid="menu-button"]');
    await page.waitForTimeout(300);
    await capture(page, 'menu-mobile', theme);
    await page.keyboard.press('Escape');
    await page.goto(`${APP}/documents`);
    await settle(page);
    await capture(page, 'documents-mobile', theme);
    await page.click('[data-testid="folders-toggle"]');
    await page.waitForTimeout(300);
    await capture(page, 'documents-tree-mobile', theme);

    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`Screenshots are in ${OUT}`);
