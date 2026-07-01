import type { Page } from '@playwright/test';
import type { AuthAdapter, CreateStorageStateOptions, Credentials } from './types';

export interface FormLoginOptions {
  loginPath?: string;
  usernameLabel?: RegExp | string;
  passwordLabel?: RegExp | string;
  submitName?: RegExp | string;
  /** A URL the page must reach for login to count as succeeded. */
  expectUrl?: RegExp;
}

/**
 * Cookie-session login through a username/password form (barycal, plur-nyc
 * validator). Drives the real form with user-facing locators, then snapshots
 * the sealed session cookie into storageState via `createStorageState`.
 */
export class FormLoginAdapter implements AuthAdapter {
  private readonly opts: Required<FormLoginOptions>;

  constructor(opts: FormLoginOptions = {}) {
    this.opts = {
      loginPath: opts.loginPath ?? '/login',
      usernameLabel: opts.usernameLabel ?? /username/i,
      passwordLabel: opts.passwordLabel ?? /password/i,
      submitName: opts.submitName ?? /log ?in|sign ?in|continue/i,
      expectUrl: opts.expectUrl ?? /.*/,
    };
  }

  async login(page: Page, credentials: Credentials): Promise<void> {
    await page.goto(this.opts.loginPath);
    await page.getByLabel(this.opts.usernameLabel).fill(credentials.username);
    await page.getByLabel(this.opts.passwordLabel).fill(credentials.password);
    await page.getByRole('button', { name: this.opts.submitName }).click();
    await page.waitForURL(this.opts.expectUrl);
  }

  async createStorageState(opts: CreateStorageStateOptions): Promise<void> {
    if (!opts.page || !opts.credentials) {
      throw new Error('FormLoginAdapter.createStorageState requires { page, credentials }.');
    }
    await this.login(opts.page, opts.credentials);
    await opts.page.context().storageState({ path: opts.path });
  }
}
