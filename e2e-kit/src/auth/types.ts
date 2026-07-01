import type { Page } from '@playwright/test';

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Produces a logged-in browser state for an app. Apps seed sessions
 * differently — a sealed cookie (barycal, plur-nyc) vs a Supabase JWT in
 * localStorage (poisys) — but Playwright `storageState` carries BOTH cookies
 * and per-origin localStorage, so every adapter reduces to "produce a
 * storageState". Specs and the setup project stay identical across apps.
 */
export interface CreateStorageStateOptions {
  /** Destination file for the Playwright storageState JSON. */
  path: string;
  /** Present for adapters that drive a real login (e.g. a form). */
  page?: Page;
  credentials?: Credentials;
}

export interface AuthAdapter {
  /** Establish a session and persist it to `opts.path` as Playwright storageState. */
  createStorageState(opts: CreateStorageStateOptions): Promise<void>;
  /** Optional: log in on an existing page without persisting — for specs that
   *  exercise the auth flow itself rather than a pre-authenticated actor. */
  login?(page: Page, credentials: Credentials): Promise<void>;
}
