import { getCatalogAnalytics } from '@/lib/rewards/admin-queries';
import styles from '../admin.module.css';

export default async function AdminAnalyticsPage() {
  const a = await getCatalogAnalytics();
  return (
    <>
      <h1 className={styles.title}>Catalog analytics</h1>
      <p className={styles.muted}>
        Redemptions and point-sink volume across the platform perks catalog. Read-only.
      </p>

      <div className={styles.cards}>
        <div className={styles.stat}>
          <div className={styles.statNum}>{a.totalPlatformSink.toLocaleString()}</div>
          <div className={styles.statLabel}>Global point-sink (spend)</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statNum}>
            {a.rows.reduce((n, r) => n + r.redemptionCount, 0).toLocaleString()}
          </div>
          <div className={styles.statLabel}>Platform redemptions</div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionH}>Top perks</div>
        {a.topPerks.length === 0 && <div className="empty">No redemptions yet.</div>}
        {a.topPerks.some((r) => r.redemptionCount > 0) && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Perk</th>
                <th>Redemptions</th>
                <th>Point sink</th>
              </tr>
            </thead>
            <tbody>
              {a.topPerks
                .filter((r) => r.redemptionCount > 0)
                .map((r) => (
                  <tr key={r.perk.id}>
                    <td>{r.perk.title}</td>
                    <td>{r.redemptionCount.toLocaleString()}</td>
                    <td>{r.pointSink.toLocaleString()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionH}>All perks ({a.rows.length})</div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Perk</th>
              <th>Cost</th>
              <th>Redemptions</th>
              <th>Point sink</th>
            </tr>
          </thead>
          <tbody>
            {a.rows.map((r) => (
              <tr key={r.perk.id}>
                <td>{r.perk.title}</td>
                <td>{r.perk.pointCost.toLocaleString()}</td>
                <td>{r.redemptionCount.toLocaleString()}</td>
                <td>{r.pointSink.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
