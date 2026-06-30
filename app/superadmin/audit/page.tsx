import { adminListAudit } from '@/lib/db/admin';
import AuditView from '@/components/admin/AuditView';

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ page?: string; action?: string }> }) {
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0) | 0);
  const rows = await adminListAudit({ limit: 50, offset: page * 50, action: sp.action });
  return (<main><h1>Audit log</h1><AuditView rows={rows} page={page} action={sp.action ?? ''} /></main>);
}
