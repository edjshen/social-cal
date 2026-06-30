import { notFound } from 'next/navigation';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import AdminNav from '@/components/admin/AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireSuperadmin();
  } catch {
    notFound(); // don't reveal /admin exists to non-admins or aal1 (no-MFA-step-up) sessions
  }
  return (
    <div className="shell admin-shell">
      <AdminNav />
      <div className="main">{children}</div>
    </div>
  );
}
