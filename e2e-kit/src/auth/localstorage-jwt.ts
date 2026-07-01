import { writeFileSync } from 'node:fs';
import type { AuthAdapter, CreateStorageStateOptions } from './types';

export interface LocalStorageJwtOptions {
  /** App origin the session belongs to, e.g. 'http://localhost:5173'. */
  origin: string;
  /** localStorage key the app reads the session from (e.g. 'flow-auth'). */
  storageKey: string;
  /**
   * Returns the serialized session value to store (e.g. a Supabase session
   * JSON). Injected so the kit stays free of any specific auth SDK — the host
   * app mints the session with its own client, the kit just seeds it.
   */
  getSession: () => Promise<string> | string;
}

/**
 * Seeds a token-in-localStorage session (poisys-style Supabase JWT) as a
 * Playwright storageState. Writes the state file directly: storageState carries
 * per-origin localStorage, so no browser is needed to establish it. The other
 * end of the same seam as FormLoginAdapter — cookie apps and JWT apps both
 * reduce to "produce a storageState".
 */
export class LocalStorageJwtAdapter implements AuthAdapter {
  constructor(private readonly opts: LocalStorageJwtOptions) {}

  async createStorageState(opts: CreateStorageStateOptions): Promise<void> {
    const value = await this.opts.getSession();
    const state = {
      cookies: [],
      origins: [
        {
          origin: this.opts.origin,
          localStorage: [{ name: this.opts.storageKey, value }],
        },
      ],
    };
    writeFileSync(opts.path, JSON.stringify(state));
  }
}
