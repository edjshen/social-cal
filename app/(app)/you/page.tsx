import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'You · Barycal' };
import { getProfileData } from '@/lib/db/profile';
import { getWallet } from '@/lib/rewards/queries';
import ProfileView from '@/components/ProfileView';
import RewardsWallet from '@/components/RewardsWallet';
export default async function YouPage() {
  const s = await getSession();
  const [data, wallet] = await Promise.all([
    getProfileData(s.handle!, s.userId!),
    getWallet(s.userId!, new Date().toISOString()),
  ]);
  return (
    <>
      <ProfileView data={data!} />
      <RewardsWallet wallet={wallet} />
    </>
  );
}
