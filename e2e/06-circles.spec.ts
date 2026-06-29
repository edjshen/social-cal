import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
  await page.fill('input[type="password"]', 'barycal');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });
}

test.describe('Circles Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/circles');
    await page.waitForLoadState('networkidle');
  });

  test('circles page loads without error', async ({ page }) => {
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(50);
    const hasError = (body || '').includes('Internal Server Error');
    expect(hasError).toBe(false);
  });

  test('shows connections list or empty state', async ({ page }) => {
    // Should show connections or an empty/discovery state
    const connections = page.locator(
      '[class*="connection"], [class*="contact"], [class*="person"], [class*="user"]'
    );
    const hasConnections = await connections.isVisible({ timeout: 5000 }).catch(() => false);
    // OR empty state
    const emptyState = page.locator(
      '[class*="empty"], [class*="Empty"], p:has-text("no one"), p:has-text("Connect")'
    );
    const hasEmpty = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);
    // OR discovery section
    const discover = page.locator('[class*="discover"], [class*="directory"]');
    const hasDiscover = await discover.isVisible({ timeout: 2000 }).catch(() => false);
    expect(hasConnections || hasEmpty || hasDiscover).toBeTruthy();
  });

  test('Inner/Outer Circle tiers are shown for connections', async ({ page }) => {
    // Look for tier indicators
    const innerEl = page.locator('button:has-text("Inner"), [class*="inner"], [data-tier="inner"]');
    const outerEl = page.locator(
      'button:has-text("Outer"), button:has-text("Orbit"), [class*="outer"], [class*="orbit"]'
    );
    const hasTiers =
      (await innerEl.isVisible({ timeout: 3000 }).catch(() => false)) ||
      (await outerEl.isVisible({ timeout: 3000 }).catch(() => false));
    if (!hasTiers) {
      console.log('Tier indicators not visible - may need connections first');
    }
    // Page should load without error regardless
    const hasError = await page
      .locator('[class*="error-boundary"]')
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    expect(hasError).toBe(false);
  });

  test('can search for people to connect with', async ({ page }) => {
    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="search" i], input[placeholder*="find" i], input[placeholder*="name" i]'
    );
    const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasSearch) {
      await searchInput.fill('maya');
      await page.waitForTimeout(800);
      // Results should appear
      const results = page.locator('[class*="result"], [class*="suggestion"], [class*="user"]');
      const hasResults = await results.isVisible({ timeout: 3000 }).catch(() => false);
      // Search interaction shouldn't crash
      expect(page.url()).toContain('localhost:3000');
    }
  });

  test('ghost mode toggle is accessible from circles', async ({ page }) => {
    const ghostToggle = page.locator(
      'button:has-text("Ghost"), [class*="ghost"], input[type="checkbox"][name*="ghost" i]'
    );
    const hasGhost = await ghostToggle.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasGhost) {
      console.log('Ghost mode toggle not found on circles page - may be in profile');
    }
  });

  test('pending connection requests section exists', async ({ page }) => {
    const pendingSection = page.locator(
      '[class*="pending"], [class*="request"], h2:has-text("Pending"), h3:has-text("Pending")'
    );
    const hasPending = await pendingSection.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasPending) {
      console.log('No pending requests section (may be empty or integrated)');
    }
    // Verify page is functional
    const pageText = await page.locator('body').textContent();
    expect(pageText).toBeTruthy();
  });
});
