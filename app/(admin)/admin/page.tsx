import { adminStats } from '@/lib/db/admin';
import StatCards from '@/components/admin/StatCards';
export default async function AdminOverview() {
  const stats = await adminStats();
  return (
    <main>
      <h1>Overview</h1>
      <StatCards stats={stats} />
    </main>
  );
}
