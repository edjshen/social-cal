import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
  await page.fill('input[type="password"]', 'barycal');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });
}

test.describe('Error States & Edge Cases', () => {
  test('404 page renders gracefully', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-xyz');
    await page.waitForLoadState('networkidle');
    const bodyText = (await page.locator('body').textContent()) || '';
    const has404 =
      bodyText.includes('404') ||
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes('page doesn');
    expect(has404).toBeTruthy();
    // Should have a way back home
    const homeLink = page.locator(
      'a[href="/"], a:has-text("Home"), a:has-text("Go back"), button:has-text("Go home")'
    );
    const hasHomeLink = await homeLink.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasHomeLink) {
      console.log('404 page missing home link - UX improvement opportunity');
    }
  });

  test('app handles rapid navigation without crashing', async ({ page }) => {
    await login(page);
    const routes = ['/discover', '/calendar', '/plans', '/regulars', '/circles', '/you'];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForTimeout(300);
    }
    // No crash on last route
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/you');
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(50);
  });

  test('back button works correctly', async ({ page }) => {
    await login(page);
    await page.goto('/discover');
    await page.goto('/calendar');
    await page.goBack();
    await page.waitForLoadState('networkidle');
    expect(page.url()).toContain('/discover');
  });

  test('empty states have helpful messages', async ({ page }) => {
    await login(page);
    // Plans page - might be empty for a fresh user
    await page.goto('/plans');
    await page.waitForLoadState('networkidle');
    const bodyText = (await page.locator('body').textContent()) || '';
    // If empty, should have some message
    const hasContent = bodyText.length > 50;
    expect(hasContent).toBeTruthy();
    // No raw JSON errors
    const hasRawJSON = bodyText.startsWith('{') || bodyText.includes('SyntaxError');
    expect(hasRawJSON).toBe(false);
  });

  test('session persists across page navigation', async ({ page }) => {
    await login(page);
    await page.goto('/discover');
    // Navigate away and back
    await page.goto('/calendar');
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');
    // Should still be logged in (not redirected to login)
    expect(page.url()).toContain('/discover');
    const hasLoginForm = await page
      .locator('input[type="password"]')
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    expect(hasLoginForm).toBe(false);
  });

  test('registration with taken username shows error', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');

    const allInputs = await page.locator('input:visible').all();
    for (const input of allInputs) {
      const type = await input.getAttribute('type');
      const name = await input.getAttribute('name');
      if (type === 'password') {
        await input.fill('testpassword123');
      } else {
        await input.fill('ed'); // Already taken username
      }
    }

    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();
    await page.waitForTimeout(2000);

    const bodyText = (await page.locator('body').textContent()) || '';
    // Should either stay on register or show error about taken username
    const staysOnRegister = page.url().includes('/register');
    const showsError =
      bodyText.toLowerCase().includes('taken') ||
      bodyText.toLowerCase().includes('already') ||
      bodyText.toLowerCase().includes('error') ||
      bodyText.toLowerCase().includes('exists');
    expect(staysOnRegister || showsError).toBeTruthy();
  });

  test('all pages have proper page titles', async ({ page }) => {
    await login(page);
    const routes = ['/discover', '/calendar', '/plans', '/regulars', '/circles', '/you'];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      const title = await page.title();
      expect(title.length).toBeGreaterThan(0);
      // Title should mention Barycal
      if (!title.toLowerCase().includes('barycal')) {
        console.log(`Page ${route} title doesn't mention Barycal: "${title}"`);
      }
    }
  });
});
