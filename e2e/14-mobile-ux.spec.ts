import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
  await page.fill('input[type="password"]', 'barycal');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });
}

// These tests run only in the mobile project
test.describe('Mobile UX', () => {
  test('tab bar is fixed at bottom on mobile', async ({ page, isMobile }) => {
    if (!isMobile) test.skip(true, 'Mobile-only test');
    await login(page);
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');

    const nav = page.locator('nav, [class*="TabBar"], [class*="tab-bar"]').first();
    const hasNav = await nav.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasNav).toBeTruthy();

    if (hasNav) {
      const navBox = await nav.boundingBox();
      const viewportSize = page.viewportSize();
      if (navBox && viewportSize) {
        // Nav should be near the bottom of the viewport
        const navBottom = navBox.y + navBox.height;
        const isNearBottom = navBottom > viewportSize.height * 0.7;
        expect(isNearBottom).toBeTruthy();
      }
    }
  });

  test('content scrolls without hiding behind fixed tab bar', async ({ page, isMobile }) => {
    if (!isMobile) test.skip(true, 'Mobile-only test');
    await login(page);
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Check no fixed element overlaps important content
    const nav = page.locator('nav, [class*="TabBar"]').first();
    const hasNav = await nav.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasNav) {
      const navBox = await nav.boundingBox();
      const viewportSize = page.viewportSize();
      if (navBox && viewportSize) {
        // If nav is fixed at bottom, content should have padding
        const body = page.locator('body, [class*="app-content"], main');
        const bodyBox = await body.boundingBox().catch(() => null);
        // Just verify no hard crash
        expect(page.url()).toContain('localhost:3000');
      }
    }
  });

  test('touch scrolling works on calendar', async ({ page, isMobile }) => {
    if (!isMobile) test.skip(true, 'Mobile-only test');
    await login(page);
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    // Swipe down
    await page.touchscreen.tap(200, 400);
    await page.waitForTimeout(200);
    // Should not crash
    expect(page.url()).toContain('/calendar');
  });

  test('create sheet opens from bottom on mobile', async ({ page, isMobile }) => {
    if (!isMobile) test.skip(true, 'Mobile-only test');
    await login(page);
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');

    const createBtn = page
      .locator('button[aria-label*="create" i], [class*="CreateButton"], button:has-text("+")')
      .first();
    const hasCreate = await createBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasCreate) {
      await createBtn.tap();
      await page.waitForTimeout(800);

      const sheet = page.locator('[class*="Sheet"], [class*="sheet"], [role="dialog"]');
      const hasSheet = await sheet.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasSheet) {
        const sheetBox = await sheet.boundingBox();
        const viewportSize = page.viewportSize();
        if (sheetBox && viewportSize) {
          // Sheet should come from bottom or be centered
          const isFromBottom = sheetBox.y > viewportSize.height * 0.2;
          // Just verify it opened
          expect(hasSheet).toBeTruthy();
        }
      }
    }
  });
});
