import { getAdminCounts } from '@/lib/rewards/admin-queries';
import styles from './admin.module.css';

export default async function AdminDashboardPage() {
  const c = await getAdminCounts();
  const cards: { num: number; label: string }[] = [
    { num: c.activePerks, label: 'Active platform perks' },
    { num: c.pointsIssued, label: 'Global points issued' },
    { num: c.redemptions, label: 'Redemptions' },
    { num: c.checkIns, label: 'Check-ins' },
  ];
  return (
    <>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.muted}>
        Platform-wide rewards at a glance. Manage the global currency, the first-party perks
        catalog, and moderation from the nav above.
      </p>
      <div className={styles.cards}>
        {cards.map((card) => (
          <div className={styles.stat} key={card.label}>
            <div className={styles.statNum}>{card.num.toLocaleString()}</div>
            <div className={styles.statLabel}>{card.label}</div>
          </div>
        ))}
      </div>
    </>
  );
}
