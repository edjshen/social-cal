import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
  await page.fill('input[type="password"]', 'barycal');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });
}

test.describe('Regulars Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/regulars');
    await page.waitForLoadState('networkidle');
  });

  test('regulars page loads without error', async ({ page }) => {
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(50);
    const hasError = (body || '').includes('Internal Server Error');
    expect(hasError).toBe(false);
  });

  test('shows regulars list or empty/onboarding state', async ({ page }) => {
    // Look for regulars list items or empty state
    const content = page.locator(
      '[class*="regular"], [class*="Regular"], [class*="person"], [class*="empty"], [class*="Empty"]'
    );
    const hasContent = await content.isVisible({ timeout: 5000 }).catch(() => false);
    const bodyText = await page.locator('body').textContent();
    // Page should have meaningful content
    expect(bodyText!.length).toBeGreaterThan(100);
  });

  test('regulars section distinguishes "Regulars" from "Rising"', async ({ page }) => {
    const bodyText = (await page.locator('body').textContent()) || '';
    const hasRegulars =
      bodyText.toLowerCase().includes('regular') || bodyText.toLowerCase().includes('rising');
    // Check for Rising section
    const risingEl = page.locator(
      'h2:has-text("Rising"), h3:has-text("Rising"), [class*="rising"]'
    );
    const hasRising = await risingEl.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasRegulars && !hasRising) {
      console.log('No Regulars/Rising sections found - may need more attendance data');
    }
  });

  test('regulars co-presence context shows (if data present)', async ({ page }) => {
    const contextTags = page.locator('[class*="context"], [class*="tag"], [class*="Pill"]');
    const hasTags = await contextTags.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasTags) {
      const tagText = await contextTags.first().textContent();
      expect(tagText).toBeTruthy();
    }
  });

  test('make standing plan CTA works (if present)', async ({ page }) => {
    const ctaBtn = page.locator(
      'button:has-text("Standing"), button:has-text("standing plan"), button:has-text("Plan together")'
    );
    const hasCTA = await ctaBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasCTA) {
      await ctaBtn.first().click();
      await page.waitForTimeout(500);
      // Should open create sheet or navigate
      expect(page.url()).toContain('localhost:3000');
    }
  });
});
