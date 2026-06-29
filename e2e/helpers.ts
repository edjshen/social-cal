import { Page } from '@playwright/test';

export const BASE_URL = 'http://localhost:3000';
export const DEMO_USER = { username: 'ed', password: 'barycal' };
export const DEMO_HANDLE = 'ed';

export async function login(
  page: Page,
  username = DEMO_USER.username,
  password = DEMO_USER.password
) {
  await page.goto('/login');
  await page.getByLabel(/username/i).fill(username);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
  // Wait for redirect to authenticated area
  await page.waitForURL(/\/(discover|calendar|plans|regulars|circles|you)/, { timeout: 8000 });
}

export async function logout(page: Page) {
  // Navigate to profile and look for logout option
  await page.goto('/you');
  const logoutBtn = page.getByRole('button', { name: /sign out|log out/i });
  if (await logoutBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await logoutBtn.click();
  }
}
