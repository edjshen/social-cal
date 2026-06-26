'use server';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { users } from '../db/schema';
import { hashPassword, verifyPassword } from '../auth/password';
import { getSession } from '../auth/session';
import { avatarFor } from '../domain/helpers';

function toHandle(s: string) { return String(s || '').toLowerCase().replace(/[^a-z0-9_]/g, ''); }

export type AuthState = { error?: string } | null;

export async function login(_prev: AuthState, form: FormData): Promise<AuthState> {
  const handle = toHandle(String(form.get('username')));
  const password = String(form.get('password') || '');
  const u = (await getDb().select().from(users).where(eq(users.handle, handle)).limit(1))[0];
  if (!u || !(await verifyPassword(password, u.passwordHash))) return { error: 'Invalid credentials' };
  const s = await getSession(); s.userId = u.id; s.handle = u.handle; await s.save();
  redirect('/discover');
}

export async function register(_prev: AuthState, form: FormData): Promise<AuthState> {
  const handle = toHandle(String(form.get('username')));
  const password = String(form.get('password') || '');
  const displayName = String(form.get('displayName') || '') || handle;
  if (!handle || !password) return { error: 'Username and password required' };
  const exists = (await getDb().select().from(users).where(eq(users.handle, handle)).limit(1))[0];
  if (exists) return { error: 'Username taken' };
  const id = crypto.randomUUID();
  await getDb().insert(users).values({
    id, handle, displayName, passwordHash: await hashPassword(password), bio: '', scenes: [],
    avatar: avatarFor(handle), shareId: crypto.randomUUID().slice(0, 8), ghost: false, createdAt: new Date().toISOString(),
  });
  const s = await getSession(); s.userId = id; s.handle = handle; await s.save();
  redirect('/discover');
}

export async function logout() {
  const s = await getSession(); s.destroy();
  redirect('/login');
}
