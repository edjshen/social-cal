import { drizzle } from 'drizzle-orm/d1';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import * as mayflySchema from './schema';

export function getMayflyDb() {
  const { env } = getCloudflareContext();
  return drizzle(env.DB, { schema: mayflySchema });
}
export { mayflySchema };
