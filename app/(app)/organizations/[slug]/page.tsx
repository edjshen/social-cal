import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getOrgDetail } from '@/lib/rewards/queries';
import OrgDetailView from '@/components/OrgDetailView';

export default async function OrgDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const meId = (await getSession()).userId!;
  const detail = await getOrgDetail(slug, meId, new Date().toISOString());
  if (!detail) notFound();
  return <OrgDetailView detail={detail} />;
}
