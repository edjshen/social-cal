import { defineConfig } from 'drizzle-kit';

// Generate-only config (offline). `driver: 'd1-http'` + dbCredentials are
// intentionally omitted — migrations are applied via `wrangler d1 migrations
// apply`, not drizzle-kit. Add them only if adopting drizzle-kit push/studio.
export default defineConfig({
  dialect: 'sqlite',
  schema: ['./lib/db/schema.ts', './lib/mayfly/db/schema.ts'],
  out: './drizzle',
});
