import { getSession } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { events as E, attendance as A, users as U } from '@/lib/db/schema';
import { computeRegulars } from '@/lib/domain/regulars';
import RegularsView from '@/components/RegularsView';
export default async function RegularsPage() {
  const meId = (await getSession()).userId!;
  const db = getDb();
  const [events, attendance, users] = await Promise.all([db.select().from(E), db.select().from(A), db.select().from(U)]);
  const { regulars, rising } = computeRegulars(meId, events, attendance, users);
  return <RegularsView regulars={regulars} rising={rising} />;
}
