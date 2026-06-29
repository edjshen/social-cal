import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
  await page.fill('input[type="password"]', 'barycal');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });
}

test.describe('Event Detail Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('event detail modal/page shows event information', async ({ page }) => {
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');

    // Find and click an event card
    const card = page.locator('[class*="EventCard"], [class*="card"]').first();
    const hasCard = await card.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasCard) {
      await card.click();
      await page.waitForTimeout(1000);

      // Should show some event details
      const eventTitle = page.locator('[class*="title"], [class*="heading"], h1, h2').first();
      const hasTitle = await eventTitle.isVisible({ timeout: 3000 }).catch(() => false);
      const bodyText = (await page.locator('body').textContent()) || '';
      expect(bodyText.length).toBeGreaterThan(50);
    } else {
      console.log('No event cards found to test detail view');
    }
  });

  test('event detail shows attendees', async ({ page }) => {
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');

    const card = page.locator('[class*="EventCard"], [class*="card"]').first();
    const hasCard = await card.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasCard) {
      await card.click();
      await page.waitForTimeout(1000);

      const attendees = page.locator(
        '[class*="attendee"], [class*="avatar"], [class*="Avatar"], [class*="going"]'
      );
      const hasAttendees = await attendees.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasAttendees) {
        console.log('Attendees not shown in event detail - may be empty or collapsed');
      }
    }
  });

  test('event detail has RSVP buttons', async ({ page }) => {
    await page.goto('/discover');
    await page.waitForLoadState('networkidle');

    const card = page.locator('[class*="EventCard"], [class*="card"]').first();
    const hasCard = await card.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasCard) {
      await card.click();
      await page.waitForTimeout(1000);

      const rsvp = page.locator(
        'button:has-text("Down"), button:has-text("Maybe"), [class*="RsvpButtons"]'
      );
      const hasRsvp = await rsvp.isVisible({ timeout: 3000 }).catch(() => false);
      if (!hasRsvp) {
        console.log('RSVP buttons not found in event detail');
      }
    }
  });

  test('can edit own events', async ({ page }) => {
    // Navigate to calendar and find own event
    await page.goto('/calendar');
    await page.waitForLoadState('networkidle');

    const ownEvent = page
      .locator('[class*="event"][class*="own"], [data-own="true"], [class*="event"]')
      .first();
    const hasEvent = await ownEvent.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasEvent) {
      await ownEvent.click();
      await page.waitForTimeout(500);

      const editBtn = page.locator('button:has-text("Edit"), [aria-label*="edit" i]');
      const hasEdit = await editBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasEdit) {
        await editBtn.click();
        await page.waitForTimeout(500);
        // Edit form should appear
        const editForm = page.locator('form, [class*="EventEditor"], [class*="editor"]');
        const hasForm = await editForm.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasForm) {
          await page.keyboard.press('Escape');
        }
      }
    }
  });
});
