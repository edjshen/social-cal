import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import Landing from '@/components/Landing';

export default async function Home() {
  const s = await getSession();
  if (s.userId) redirect('/discover');
  return <Landing />;
}
