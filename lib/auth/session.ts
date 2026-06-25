import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

export interface SessionData { userId?: string; handle?: string; }

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: 'orbit_session',
    cookieOptions: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax' },
  });
}
export async function requireUserId(): Promise<string> {
  const s = await getSession();
  if (!s.userId) throw new Error('UNAUTHORIZED');
  return s.userId;
}
