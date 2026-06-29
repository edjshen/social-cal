import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export interface SessionData {
  userId?: string;
  handle?: string;
  aal?: 'aal1' | 'aal2';
}

// The session secret lives on the Cloudflare env: from `.dev.vars` in dev and
// from a Worker secret in prod. It is NOT in Node's process.env under `next dev`
// (OpenNext exposes it via the env binding), so read it from there with a
// process.env fallback for any non-Workers runtime.
function sessionSecret(): string {
  const env = getCloudflareContext().env as unknown as { SESSION_SECRET?: string };
  const secret = env.SESSION_SECRET ?? process.env.SESSION_SECRET;
  if (!secret)
    throw new Error(
      'SESSION_SECRET is not set (add it to .dev.vars locally, or as a Worker secret in prod)'
    );
  return secret;
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    password: sessionSecret(),
    cookieName: 'barycal_session',
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
    },
  });
}
export async function requireUserId(): Promise<string> {
  const s = await getSession();
  if (!s.userId) throw new Error('UNAUTHORIZED');
  return s.userId;
}
