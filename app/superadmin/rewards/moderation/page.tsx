import { listRecentCheckIns, listRecentRedemptions } from '@/lib/rewards/admin-queries';
import VoidButton from '@/components/admin/VoidButton';
import styles from '../admin.module.css';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default async function AdminModerationPage() {
  const [checkins, reds] = await Promise.all([listRecentCheckIns(50), listRecentRedemptions(50)]);
  return (
    <>
      <h1 className={styles.title}>Moderation</h1>
      <p className={styles.muted}>
        Void fraudulent check-ins (reverses awarded points via a compensating ledger entry) or
        redemptions (marks voided + refunds the cost). Both are append-only and non-destructive.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionH}>Recent check-ins ({checkins.length})</div>
        {checkins.length === 0 && <div className="empty">No check-ins yet.</div>}
        {checkins.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Event</th>
                <th>Global</th>
                <th>Org</th>
                <th>When</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {checkins.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.displayName ?? c.userId}
                    {c.handle ? <div className={styles.muted}>@{c.handle}</div> : null}
                  </td>
                  <td className={styles.muted}>{c.eventId}</td>
                  <td>{c.globalAwarded}</td>
                  <td>{c.orgAwarded}</td>
                  <td className={styles.muted}>{fmt(c.createdAt)}</td>
                  <td>
                    <VoidButton id={c.id} action="checkin" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionH}>Recent redemptions ({reds.length})</div>
        {reds.length === 0 && <div className="empty">No redemptions yet.</div>}
        {reds.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>User</th>
                <th>Scope</th>
                <th>Perk</th>
                <th>Status</th>
                <th>Issued</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reds.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.displayName ?? r.userId}
                    {r.handle ? <div className={styles.muted}>@{r.handle}</div> : null}
                  </td>
                  <td className={styles.muted}>{r.scope}</td>
                  <td className={styles.muted}>{r.perkId}</td>
                  <td>
                    <span className={styles.badge}>{r.status}</span>
                  </td>
                  <td className={styles.muted}>{fmt(r.issuedAt)}</td>
                  <td>
                    {r.status !== 'voided' ? (
                      <VoidButton id={r.id} action="redemption" />
                    ) : (
                      <span className="muted">voided</span>
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
