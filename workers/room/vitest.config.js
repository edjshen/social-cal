import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

// Runs the relay tests inside a real workerd isolate with the actual Durable
// Object + SQLite storage, using this worker's own wrangler.toml (so bindings,
// the RoomDO migration, and ALLOWED_ORIGINS match production).
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
