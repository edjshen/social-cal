import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Runs the relay tests inside a real workerd isolate with the actual Durable
// Object + SQLite storage, using this worker's own wrangler.toml (so bindings,
// the RoomDO migration, and ALLOWED_ORIGINS match production).
export default defineWorkersConfig({
  test: {
    // Only the no-secret relay suite. admission.test.js runs under
    // vitest.admission.config.js (secret injected); its 403 cases would fail
    // here, where the gate is inactive.
    include: ['test/room-do.test.js'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
