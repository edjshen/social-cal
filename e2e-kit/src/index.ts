// @edjshen/e2e-kit — shared, adapter-based Playwright toolkit.
// Stable core (config factory, fixtures, unique data, network, a11y) +
// pluggable adapters (auth, data) for the axes on which apps actually differ.
export { test, expect } from './fixtures';

export { createE2EConfig } from './config';
export type { E2EConfigOptions, DeviceKey } from './config';

export { checkA11y, DEFAULT_WCAG_TAGS } from './a11y';
export type { CheckA11yOptions } from './a11y';

export { stubThirdParty, THIRD_PARTY_PATTERNS } from './net';
export * from './unique';

// Auth adapters (produce a Playwright storageState).
export { FormLoginAdapter } from './auth/form-login';
export type { FormLoginOptions } from './auth/form-login';
export { LocalStorageJwtAdapter } from './auth/localstorage-jwt';
export type { LocalStorageJwtOptions } from './auth/localstorage-jwt';
export type { AuthAdapter, Credentials, CreateStorageStateOptions } from './auth/types';

// Data adapters (provision the backing store before the server boots).
export { D1LocalAdapter } from './data/d1-local';
export type { D1LocalOptions } from './data/d1-local';
export type { DataAdapter } from './data/types';
