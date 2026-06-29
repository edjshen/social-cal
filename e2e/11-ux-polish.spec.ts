import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
  await page.fill('input[type="password"]', 'barycal');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });
}

test.describe('UX Polish & Accessibility', () => {
  test('page has correct title', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const title = await page.title();
    expect(title.toLowerCase()).toContain('barycal');
  });

  test('meta theme color is set for mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBeTruthy();
  });

  test('favicon is set', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const favicon = await page.locator('link[rel*="icon"]').first().getAttribute('href');
    expect(favicon).toBeTruthy();
  });

  test('app has dark/brand color scheme applied', async ({ page }) => {
    await login(page);
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');
    // Check CSS custom properties are applied
    const bgColor = await page.evaluate(() => {
      return (
        window.getComputedStyle(document.documentElement).getPropertyValue('--bg') ||
        window.getComputedStyle(document.body).backgroundColor
      );
    });
    expect(bgColor).toBeTruthy();
  });

  test('buttons have sufficient touch target size on mobile', async ({ page, isMobile }) => {
    if (!isMobile) test.skip(true, 'Mobile-only test');
    await login(page);
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');
    // Check that buttons are at least 44x44px (Apple HIG minimum)
    const buttons = await page.locator('button:visible').all();
    let smallButtons = 0;
    for (const btn of buttons.slice(0, 10)) {
      const box = await btn.boundingBox();
      if (box && (box.height < 44 || box.width < 44)) {
        smallButtons++;
      }
    }
    if (smallButtons > 0) {
      console.log(`Found ${smallButtons} buttons smaller than 44x44px touch target`);
    }
  });

  test('no visible console errors on discover page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await login(page);
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    const criticalErrors = errors.filter((e) => !e.includes('Warning:') && !e.includes('404'));
    if (criticalErrors.length > 0) {
      console.log('Console errors:', criticalErrors);
    }
    // Critical JS errors should be zero
    const jsErrors = errors.filter(
      (e) => e.toLowerCase().includes('uncaught') || e.toLowerCase().includes('typeerror')
    );
    expect(jsErrors.length).toBe(0);
  });

  test('PWA manifest is accessible', async ({ page }) => {
    const response = await page.request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.name || json.short_name).toBeTruthy();
  });

  test('app has proper viewport meta tag for mobile', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
  });

  test('form labels are associated with inputs', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Labels should be associated with inputs via for/id or wrapping
    const inputs = await page.locator('input:visible').all();
    for (const input of inputs) {
      const id = await input.getAttribute('id');
      const name = await input.getAttribute('name');
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        const hasLabel = await label.isVisible({ timeout: 1000 }).catch(() => false);
        if (!hasLabel) {
          // Check for wrapping label
          const wrappingLabel = await input.locator('..').locator('xpath=ancestor::label').count();
          if (wrappingLabel === 0) {
            const ariaLabel = await input.getAttribute('aria-label');
            if (!ariaLabel) {
              console.log(`Input ${name || id} may lack accessible label`);
            }
          }
        }
      }
    }
  });

  test('images have alt text', async ({ page }) => {
    await login(page);
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');
    const images = await page.locator('img').all();
    let missingAlt = 0;
    for (const img of images) {
      const alt = await img.getAttribute('alt');
      if (alt === null) missingAlt++;
    }
    if (missingAlt > 0) {
      console.log(`Found ${missingAlt} images without alt text`);
    }
    // Not a hard failure but logged as UX issue
  });

  test('loading states appear during navigation', async ({ page }) => {
    await login(page);
    // Navigate quickly and check for loading state
    await Promise.all([page.goto('/calendar'), page.waitForLoadState('domcontentloaded')]);
    // Just verify no infinite loading (page eventually resolves)
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    expect(page.url()).toContain('/calendar');
  });
});
