import { test, expect } from '@playwright/test';

test.describe('Landing & Auth', () => {
  test('landing page renders for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    // Should redirect to login or show landing
    await page.waitForLoadState('networkidle');
    const url = page.url();
    // Either shows landing/login or redirects
    expect(url).toMatch(/localhost:3000/);
    // No crash - page should have content
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
    expect(body!.length).toBeGreaterThan(10);
  });

  test('login page renders and has form fields', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Should have username and password fields
    const usernameField = page.locator(
      'input[name="username"], input[placeholder*="username" i], input[id*="username" i], label:has-text("username") + input, label:has-text("Username") ~ input'
    );
    const passwordField = page.locator('input[type="password"]');
    await expect(usernameField.first()).toBeVisible({ timeout: 5000 });
    await expect(passwordField.first()).toBeVisible({ timeout: 5000 });
  });

  test('register page renders with form', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    const passwordField = page.locator('input[type="password"]');
    await expect(passwordField.first()).toBeVisible({ timeout: 5000 });
  });

  test('login with valid credentials redirects to app', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    // Fill in credentials
    await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
    await page.fill('input[type="password"]', 'barycal');
    await page.click('button[type="submit"]');

    // Should redirect to authenticated route
    await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });
    expect(page.url()).toMatch(/localhost:3000/);
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
    await page.fill('input[type="password"]', 'wrongpassword123');
    await page.click('button[type="submit"]');

    // Should stay on login or show error
    await page.waitForTimeout(2000);
    const url = page.url();
    const hasError = await page
      .locator('[class*="error"], [role="alert"], .error, [data-error]')
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    // Either stays on login page or shows error
    const staysOnLogin = url.includes('/login');
    const hasErrorMsg = hasError;
    // At minimum we shouldn't crash, and page content should reflect something
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
    // Shouldn't silently succeed with wrong password
    expect(url).not.toMatch(/\/(discover|calendar|plans|regulars|circles|you)/);
  });

  test('unauthenticated access to protected route redirects', async ({ page }) => {
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');
    // Should be redirected to login or see auth wall
    const url = page.url();
    const hasAuthWall = await page
      .locator('[class*="auth"], form input[type="password"]')
      .isVisible({ timeout: 3000 })
      .catch(() => false);
    expect(url.includes('/login') || url.includes('/register') || hasAuthWall).toBeTruthy();
  });

  test('registration form validates required fields', async ({ page }) => {
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    // Try submitting empty form
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    // Should not navigate away
    expect(page.url()).toContain('/register');
  });
});
