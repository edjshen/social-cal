import { listFulfillmentQueue } from '@/lib/rewards/admin-queries';
import VoidButton from '@/components/admin/VoidButton';
import styles from '../admin.module.css';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default async function AdminFulfillmentPage() {
  const queue = await listFulfillmentQueue(100);
  return (
    <>
      <h1 className={styles.title}>Fulfillment queue</h1>
      <p className={styles.muted}>
        Platform redemptions needing manual work: <code>partner-code</code> and <code>manual</code>{' '}
        perks. Mark fulfilled once handled.
      </p>

      <div className={styles.section}>
        {queue.length === 0 && <div className="empty">Nothing in the queue.</div>}
        {queue.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Perk</th>
                <th>Fulfillment</th>
                <th>Status</th>
                <th>Issued</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.displayName ?? r.userId}
                    {r.handle ? <div className={styles.muted}>@{r.handle}</div> : null}
                  </td>
                  <td className={styles.muted}>{r.perkId}</td>
                  <td>{r.fulfillment}</td>
                  <td>
                    <span className={styles.badge}>{r.status}</span>
                  </td>
                  <td className={styles.muted}>{fmt(r.issuedAt)}</td>
                  <td>
                    {r.status === 'issued' ? (
                      <VoidButton id={r.id} action="fulfill" />
                    ) : (
                      <span className="muted">{r.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
