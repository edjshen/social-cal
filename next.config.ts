import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: { viewTransition: true },
};

export default nextConfig;

// Enable Cloudflare bindings (D1, etc.) during `next dev`.
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';
initOpenNextCloudflareForDev();
