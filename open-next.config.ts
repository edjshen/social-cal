import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({
  // Incremental cache disabled until an R2 bucket is wired (mirrors plur-nyc).
});
