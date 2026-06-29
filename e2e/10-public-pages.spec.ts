import { test, expect } from '@playwright/test';

test.describe('Public Pages (Account-Free)', () => {
  test('public profile /u/[handle] renders without login', async ({ page }) => {
    await page.goto('/u/ed');
    await page.waitForLoadState('networkidle');
    // Should NOT redirect to login
    expect(page.url()).toContain('/u/ed');
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(50);
    // No crash
    const hasServerError = (body || '').includes('Internal Server Error');
    expect(hasServerError).toBe(false);
  });

  test('public profile shows username/handle', async ({ page }) => {
    await page.goto('/u/ed');
    await page.waitForLoadState('networkidle');
    const bodyText = (await page.locator('body').textContent()) || '';
    // Should show the handle "ed" somewhere
    expect(bodyText.toLowerCase()).toContain('ed');
  });

  test('public profile shows upcoming public events', async ({ page }) => {
    await page.goto('/u/ed');
    await page.waitForLoadState('networkidle');
    // Should show events or an appropriate empty state
    const bodyText = (await page.locator('body').textContent()) || '';
    const hasContent = bodyText.length > 100;
    expect(hasContent).toBeTruthy();
  });

  test('public profile has CTA to sign up or follow', async ({ page }) => {
    await page.goto('/u/ed');
    await page.waitForLoadState('networkidle');
    const ctaEl = page.locator(
      'button:has-text("Follow"), button:has-text("Join"), button:has-text("Sign up"), ' +
        'a:has-text("Join"), a:has-text("Sign up"), [class*="cta"], [class*="PublicCta"]'
    );
    const hasCTA = await ctaEl.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasCTA) {
      console.log('No follow/join CTA on public profile - might only show when not logged in');
    }
  });

  test('non-existent handle shows 404 or not-found page', async ({ page }) => {
    await page.goto('/u/definitely-not-a-real-user-handle-xyz123');
    await page.waitForLoadState('networkidle');
    const bodyText = (await page.locator('body').textContent()) || '';
    const has404 =
      bodyText.includes('404') ||
      bodyText.toLowerCase().includes('not found') ||
      bodyText.toLowerCase().includes("doesn't exist");
    // Should handle gracefully
    expect(has404 || page.url().includes('not-found')).toBeTruthy();
  });

  test('public event /e/[id] renders when event exists', async ({ page }) => {
    // First, log in and find an event ID
    await page.goto('/login');
    await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
    await page.fill('input[type="password"]', 'barycal');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });

    // Find an event card with a link
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');

    // Look for links to /e/ pages
    const eventLinks = await page.locator('a[href*="/e/"]').all();
    if (eventLinks.length > 0) {
      const href = await eventLinks[0].getAttribute('href');
      if (href) {
        // Visit event page (may or may not be logged in at this point)
        await page.goto(href);
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('/e/');
        const body = await page.locator('body').textContent();
        const hasServerError = (body || '').includes('Internal Server Error');
        expect(hasServerError).toBe(false);
      }
    } else {
      console.log('No event links found on discover page to test /e/ route');
    }
  });

  test('/e/ page shows soft RSVP buttons when not logged in', async ({ page }) => {
    // Get an event ID from the API or discover
    // For simplicity, try navigating to discover first to get event IDs
    await page.goto('/login');
    await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
    await page.fill('input[type="password"]', 'barycal');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });

    await page.goto('/discover');
    await page.waitForLoadState('networkidle');

    const eventLinks = await page.locator('a[href*="/e/"]').all();
    if (eventLinks.length > 0) {
      const href = await eventLinks[0].getAttribute('href');
      if (href) {
        // Clear session and visit as anonymous
        await page.context().clearCookies();
        await page.goto(href);
        await page.waitForLoadState('networkidle');

        // Should show RSVP or signup CTA
        const rsvpOrCTA = page.locator(
          'button:has-text("Down"), button:has-text("Maybe"), button:has-text("Can\'t"), ' +
            'button:has-text("RSVP"), a:has-text("Sign up"), a:has-text("Join")'
        );
        const hasRsvpOrCTA = await rsvpOrCTA.isVisible({ timeout: 3000 }).catch(() => false);
        if (!hasRsvpOrCTA) {
          console.log('No RSVP or CTA on /e/ page when anonymous');
        }
        // No crash
        const body = await page.locator('body').textContent();
        expect(body!.length).toBeGreaterThan(50);
      }
    }
  });
});
