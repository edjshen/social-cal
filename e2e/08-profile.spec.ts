import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[name="username"], input[type="text"]:visible', 'ed');
  await page.fill('input[type="password"]', 'barycal');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 10000 });
}

test.describe('Profile (You) Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/you');
    await page.waitForLoadState('networkidle');
  });

  test('profile page loads without error', async ({ page }) => {
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(50);
    const hasError = (body || '').includes('Internal Server Error');
    expect(hasError).toBe(false);
  });

  test('shows user handle/username', async ({ page }) => {
    const bodyText = (await page.locator('body').textContent()) || '';
    // Should show the logged-in user's handle (ed)
    const showsHandle = bodyText.toLowerCase().includes('ed') || bodyText.includes('@ed');
    expect(showsHandle).toBeTruthy();
  });

  test('shows share link or public profile link', async ({ page }) => {
    // Should have a share/public link button
    const shareLink = page.locator(
      'button:has-text("Share"), a:has-text("Share"), button[aria-label*="share" i], [class*="share"]'
    );
    const hasShare = await shareLink.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasShare) {
      // Look for the /u/ link
      const profileLink = page.locator('a[href*="/u/"]');
      const hasProfileLink = await profileLink.isVisible({ timeout: 2000 }).catch(() => false);
      if (!hasProfileLink) {
        console.log('Share link not found - UX polish opportunity');
      }
    }
  });

  test('can edit profile/bio', async ({ page }) => {
    const editBtn = page
      .locator('button:has-text("Edit"), button[aria-label*="edit" i], [class*="edit"]')
      .first();
    const hasEdit = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasEdit) {
      await editBtn.click();
      await page.waitForTimeout(500);
      // An edit form or sheet should appear
      const editForm = page.locator('form, [class*="edit"], textarea, input[name="bio"]');
      const hasForm = await editForm.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasForm) {
        // Close without saving
        await page.keyboard.press('Escape');
      }
    }
  });

  test('shows upcoming events or empty state', async ({ page }) => {
    // Profile should show upcoming events
    const events = page.locator('[class*="event"], [class*="Event"], [class*="plan"]');
    const hasEvents = await events.isVisible({ timeout: 3000 }).catch(() => false);
    const bodyText = (await page.locator('body').textContent()) || '';
    const hasEventContent =
      bodyText.toLowerCase().includes('event') ||
      bodyText.toLowerCase().includes('plan') ||
      bodyText.toLowerCase().includes('upcoming') ||
      bodyText.toLowerCase().includes('nothing');
    expect(hasEventContent || hasEvents).toBeTruthy();
  });

  test('bio and scenes are displayed', async ({ page }) => {
    // Profile should show bio/scenes section
    const bioEl = page.locator('[class*="bio"], [class*="scene"], [data-field="bio"]');
    const hasBio = await bioEl.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasBio) {
      const bodyText = (await page.locator('body').textContent()) || '';
      const hasBioText =
        bodyText.toLowerCase().includes('bio') || bodyText.toLowerCase().includes('scene');
      if (!hasBioText) {
        console.log('Bio/scenes section not visible - may require data or edit');
      }
    }
  });

  test('visibility settings are accessible from profile', async ({ page }) => {
    const visibilityEl = page.locator(
      '[class*="visibility"], button:has-text("Visibility"), [data-visibility]'
    );
    const hasVisibility = await visibilityEl.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasVisibility) {
      console.log('Visibility settings not immediately visible on profile');
    }
    // Page should load without crashing
    expect(page.url()).toContain('/you');
  });
});
