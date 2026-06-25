import { getSession } from '@/lib/auth/session';
import { getProfileData } from '@/lib/db/profile';
import ProfileView from '@/components/ProfileView';
export default async function YouPage() {
  const s = await getSession();
  const data = await getProfileData(s.handle!, s.userId!);
  return <ProfileView data={data!} />;
}
