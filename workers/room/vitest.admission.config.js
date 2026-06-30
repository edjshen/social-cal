import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Same worker, but with ROOM_RELAY_SECRET injected, so the admission gate is
// ACTIVE — exercises the enforce path (valid token accepted, missing/garbage
// rejected). The default vitest.config.js leaves the secret unset (gate
// inactive), so room-do.test.js keeps passing without tokens.
export default defineWorkersConfig({
  test: {
    include: ['test/admission.test.js'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: { ROOM_RELAY_SECRET: 'test-admission-secret-aaaaaaaaaaaaaaaaaaaa' },
        },
      },
    },
  },
});
