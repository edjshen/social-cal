import { notFound } from 'next/navigation';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import AdminNav from '@/components/admin/AdminNav';

// Admin pages are auth-gated and read the session + D1 at request time, so they
// must never be statically prerendered (getCloudflareContext is unavailable at
// build). force-dynamic on the route-group layout covers every /admin page.
export const dynamic = 'force-dynamic';

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
