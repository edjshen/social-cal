/**
 * Device bootstrap. On first run we mint one device record holding a stable
 * `nodeId` — a short random per-device id (NOT a profile id) used by the HLC.
 * Stable for the device/browser-profile lifetime.
 */
import { nanoid } from 'nanoid';
import { getDb } from './db.js';

const DEVICE_KEY = 'self';

export async function getOrCreateDevice() {
  const db = await getDb();
  const existing = await db.get('device', DEVICE_KEY);
  if (existing) return existing;
  const device = {
    id: DEVICE_KEY,
    nodeId: nanoid(10),
    createdAt: Date.now(),
  };
  await db.put('device', device);
  return device;
}

export async function getNodeId() {
  const device = await getOrCreateDevice();
  return device.nodeId;
}
