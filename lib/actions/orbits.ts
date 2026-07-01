'use server';
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { getDb } from '../db';
import { orbits, orbitMembers, eventOrbits } from '../db/schema';
import { requireUserId } from '../auth/session';
import { getOrbitById, getOrbitsForUser, getUserById, getAllConnections } from '../db/queries';
import { areConnected } from '../domain/visibility';
import { CAL_COLOR_KEYS } from '../domain/orbits';
import { clampStr, LIMITS } from '../validate';

const normName = (v: unknown) => clampStr(v, LIMITS.orbitName).trim();
const normColor = (v: unknown): string | null =>
  typeof v === 'string' && (CAL_COLOR_KEYS as readonly string[]).includes(v) ? v : null;

// A membership row for `uid` in `orbitId`, or null. Used to gate every mutation.
async function membershipOf(orbitId: string, uid: string) {
  return (
    (
      await getDb()
        .select()
        .from(orbitMembers)
        .where(and(eq(orbitMembers.orbitId, orbitId), eq(orbitMembers.userId, uid)))
        .limit(1)
    )[0] ?? null
  );
}

// Read the current user's orbits (id, name, color, role) for pickers/lists.
export async function myOrbits() {
  const uid = await requireUserId();
  return (await getOrbitsForUser(uid)).map(({ orbit, role }) => ({
    id: orbit.id,
    name: orbit.name,
    color: orbit.color ?? null,
    role,
  }));
}

export async function createOrbit(input: { name: string; color?: string | null }) {
  const uid = await requireUserId();
  const name = normName(input.name);
  if (!name) throw new Error('Name your orbit');
  const id = crypto.randomUUID();
  const nowISO = new Date().toISOString();
  await getDb()
    .insert(orbits)
    .values({ id, ownerId: uid, name, color: normColor(input.color), createdAt: nowISO });
  // The creator is the first member, with the owner role.
  await getDb().insert(orbitMembers).values({
    id: crypto.randomUUID(),
    orbitId: id,
    userId: uid,
    role: 'owner',
    createdAt: nowISO,
  });
  revalidatePath('/you');
  revalidatePath('/orbits/' + id);
  return { id };
}

export async function renameOrbit(orbitId: string, name: string) {
  const uid = await requireUserId();
  const o = await getOrbitById(orbitId);
  if (!o || o.ownerId !== uid) throw new Error('Not allowed');
  const nm = normName(name);
  if (!nm) throw new Error('Name your orbit');
  await getDb().update(orbits).set({ name: nm }).where(eq(orbits.id, orbitId));
  revalidatePath('/you');
  revalidatePath('/orbits/' + orbitId);
}

export async function setOrbitColor(orbitId: string, color: string | null) {
  const uid = await requireUserId();
  const o = await getOrbitById(orbitId);
  if (!o || o.ownerId !== uid) throw new Error('Not allowed');
  await getDb()
    .update(orbits)
    .set({ color: normColor(color) })
    .where(eq(orbits.id, orbitId));
  revalidatePath('/you');
  revalidatePath('/orbits/' + orbitId);
}

export async function deleteOrbit(orbitId: string) {
  const uid = await requireUserId();
  const o = await getOrbitById(orbitId);
  if (!o || o.ownerId !== uid) throw new Error('Not allowed');
  // Take the orbit's events off the shared calendar, then drop members + orbit.
  // The underlying events themselves are untouched (they stay on their creators'
  // personal calendars).
  await getDb().delete(eventOrbits).where(eq(eventOrbits.orbitId, orbitId));
  await getDb().delete(orbitMembers).where(eq(orbitMembers.orbitId, orbitId));
  await getDb().delete(orbits).where(eq(orbits.id, orbitId));
  revalidatePath('/you');
}

// Add someone you're connected to. Any member of the orbit can grow it — this is
// a collaborative group calendar, not an owner-only invite list.
export async function addOrbitMember(orbitId: string, userId: string) {
  const uid = await requireUserId();
  if (typeof userId !== 'string' || !userId) throw new Error('Invalid user');
  if (!(await membershipOf(orbitId, uid))) throw new Error('Not allowed');
  if (!(await getUserById(userId))) throw new Error('Invalid user');
  // You can only pull in people you're actually connected to (or yourself, a
  // no-op). This keeps orbits inside the social graph.
  if (userId !== uid) {
    const conns = await getAllConnections();
    if (!areConnected(conns, uid, userId)) throw new Error('Not connected');
  }
  if (await membershipOf(orbitId, userId)) return; // already in
  await getDb().insert(orbitMembers).values({
    id: crypto.randomUUID(),
    orbitId,
    userId,
    role: 'member',
    createdAt: new Date().toISOString(),
  });
  revalidatePath('/orbits/' + orbitId);
  revalidatePath('/you');
}

// Remove a member. The owner can remove anyone (but not themselves — they delete
// the orbit instead); a member can only remove themselves (i.e. leave).
export async function removeOrbitMember(orbitId: string, userId: string) {
  const uid = await requireUserId();
  const o = await getOrbitById(orbitId);
  if (!o) throw new Error('Not found');
  const isOwner = o.ownerId === uid;
  if (!isOwner && userId !== uid) throw new Error('Not allowed');
  if (userId === o.ownerId) throw new Error('The owner cannot be removed');
  await getDb()
    .delete(orbitMembers)
    .where(and(eq(orbitMembers.orbitId, orbitId), eq(orbitMembers.userId, userId)));
  revalidatePath('/orbits/' + orbitId);
  revalidatePath('/you');
}

// Leave an orbit you're a member of. Owners must delete the orbit instead.
export async function leaveOrbit(orbitId: string) {
  const uid = await requireUserId();
  const o = await getOrbitById(orbitId);
  if (!o) throw new Error('Not found');
  if (o.ownerId === uid) throw new Error('Owners delete the orbit instead of leaving');
  await getDb()
    .delete(orbitMembers)
    .where(and(eq(orbitMembers.orbitId, orbitId), eq(orbitMembers.userId, uid)));
  revalidatePath('/you');
}
