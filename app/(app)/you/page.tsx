import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'You · Barycal' };
import { getProfileData } from '@/lib/db/profile';
import { getOrbitsForUser, getAllOrbitMembers } from '@/lib/db/queries';
import { getWallet } from '@/lib/rewards/queries';
import ProfileView from '@/components/ProfileView';
import RewardsWallet from '@/components/RewardsWallet';
import type { OrbitRow } from '@/components/OrbitsPanel';

export default async function YouPage() {
  const s = await getSession();
  const [data, wallet, mine, allMembers] = await Promise.all([
    getProfileData(s.handle!, s.userId!),
    getWallet(s.userId!, new Date().toISOString()),
    getOrbitsForUser(s.userId!),
    getAllOrbitMembers(),
  ]);
  // The current user's orbits, with a member count for each.
  const counts = allMembers.reduce<Record<string, number>>((acc, m) => {
    acc[m.orbitId] = (acc[m.orbitId] || 0) + 1;
    return acc;
  }, {});
  const orbits: OrbitRow[] = mine.map(({ orbit, role }) => ({
    id: orbit.id,
    name: orbit.name,
    color: orbit.color ?? null,
    role,
    memberCount: counts[orbit.id] || 1,
  }));
  return (
    <>
      <ProfileView data={data!} orbits={orbits} />
      <RewardsWallet wallet={wallet} />
    </>
  );
}
