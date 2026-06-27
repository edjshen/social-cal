// Cloudflare Worker bindings — augments CloudflareEnv from @opennextjs/cloudflare
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    SESSION_SECRET: string;
  }
}
export {};
