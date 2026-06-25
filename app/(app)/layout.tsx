import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import TabBar from '@/components/TabBar';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (!s.userId) redirect('/login');
  return (<><div className="shell"><div className="main">{children}</div></div><TabBar /></>);
}
