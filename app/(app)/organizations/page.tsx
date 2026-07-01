import { getSession } from '@/lib/auth/session';
import { getOrgsForIndex } from '@/lib/rewards/queries';
import OrganizationsView from '@/components/OrganizationsView';

export default async function OrganizationsPage() {
  const meId = (await getSession()).userId!;
  const orgs = await getOrgsForIndex(meId, new Date().toISOString());
  return <OrganizationsView orgs={orgs} />;
}
