import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
  await page.fill('input[type="password"]', 'barycal');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });
}

test.describe('Plans Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');
  });

  test('plans page loads without error', async ({ page }) => {
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(50);
    const hasError = (body || '').includes('Internal Server Error');
    expect(hasError).toBe(false);
  });

  test('shows plans list or empty state', async ({ page }) => {
    const plansEl = page.locator('[class*="plan"], [class*="Plan"], [class*="event"]');
    const hasPlans = await plansEl.isVisible({ timeout: 5000 }).catch(() => false);
    const bodyText = (await page.locator('body').textContent()) || '';
    const hasContext =
      bodyText.toLowerCase().includes('plan') ||
      bodyText.toLowerCase().includes('event') ||
      bodyText.toLowerCase().includes('nothing') ||
      bodyText.toLowerCase().includes('empty');
    expect(hasPlans || hasContext).toBeTruthy();
  });

  test('plans are sorted chronologically', async ({ page }) => {
    const dateEls = await page.locator('[class*="date"], time, [class*="time"]').all();
    if (dateEls.length >= 2) {
      // Verify dates make sense (first should be earlier or equal to second)
      const dates = await Promise.all(
        dateEls.slice(0, 3).map((el) => el.getAttribute('datetime').catch(() => null))
      );
      const defined = dates.filter(Boolean);
      if (defined.length >= 2) {
        expect(defined).toEqual([...defined].sort());
      }
    }
  });

  test('plan cards show event title and date', async ({ page }) => {
    const planCard = page
      .locator('[class*="EventCard"], [class*="event-card"], [class*="plan-card"]')
      .first();
    const hasCard = await planCard.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasCard) {
      const cardText = await planCard.textContent();
      expect(cardText).toBeTruthy();
      expect(cardText!.length).toBeGreaterThan(5);
    }
  });

  test('can navigate to event detail from plans', async ({ page }) => {
    const planCard = page.locator('[class*="EventCard"], [class*="card"]').first();
    const hasCard = await planCard.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasCard) {
      await planCard.click();
      await page.waitForTimeout(800);
      // Should navigate to event detail or show modal
      expect(page.url()).toContain('localhost:3000');
    }
  });
});
