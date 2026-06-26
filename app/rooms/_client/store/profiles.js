/**
 * Profiles. A device holds MANY profiles — handle, avatar, color/vibe tag, plus
 * an Ed25519 keypair that is the profile's identity within any room it presents
 * in. No accounts, no signup: a profile is just local state + a keypair.
 */
import { nanoid } from 'nanoid';
import { getDb } from './db.js';
import { ready, generateProfileKeypair, toB64 } from '@/lib/mayfly/shared/crypto.js';

const VIBES = ['neon', 'bass', 'haze', 'glow', 'static', 'velvet', 'ember', 'frost'];
const AVATARS = ['🦋', '🌙', '⚡', '🔮', '🌿', '🪩', '🛸', '🦊', '🐝', '🦉', '🌀', '🍄'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function listProfiles() {
  const db = await getDb();
  const all = await db.getAll('profiles');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getProfile(id) {
  const db = await getDb();
  return db.get('profiles', id);
}

/**
 * Create a new profile with a fresh keypair.
 * @param {{ handle?: string, avatar?: string, vibe?: string }} input
 */
export async function createProfile(input = {}) {
  await ready();
  const db = await getDb();
  const kp = generateProfileKeypair();
  const profile = {
    id: nanoid(12),
    handle: (input.handle || '').trim() || randomHandle(),
    avatar: input.avatar || pick(AVATARS),
    vibe: input.vibe || pick(VIBES),
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
    createdAt: Date.now(),
  };
  await db.put('profiles', profile);
  return profile;
}

export async function updateProfile(id, patch) {
  const db = await getDb();
  const existing = await db.get('profiles', id);
  if (!existing) throw new Error(`mayfly: profile ${id} not found`);
  const next = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt };
  await db.put('profiles', next);
  return next;
}

export async function deleteProfile(id) {
  const db = await getDb();
  await db.delete('profiles', id);
}

/** Base64url public key — the profile's room identity / dedupe key. */
export function profilePub(profile) {
  return toB64(profile.publicKey);
}

/** Ensure at least one default profile exists; returns the list. */
export async function ensureDefaultProfile() {
  const profiles = await listProfiles();
  if (profiles.length > 0) return profiles;
  const created = await createProfile();
  return [created];
}

function randomHandle() {
  const adj = ['lush', 'wavy', 'lunar', 'hyper', 'astral', 'fuzzy', 'gilded', 'dusky'];
  const noun = ['raver', 'moth', 'echo', 'prism', 'comet', 'sprite', 'pixel', 'nomad'];
  return `${pick(adj)}-${pick(noun)}`;
}
