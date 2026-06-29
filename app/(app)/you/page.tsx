import type { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'You · Barycal' };
import { getProfileData } from '@/lib/db/profile';
import ProfileView from '@/components/ProfileView';
export default async function YouPage() {
  const s = await getSession();
  const data = await getProfileData(s.handle!, s.userId!);
  return <ProfileView data={data!} />;
}
