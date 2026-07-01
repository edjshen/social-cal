import Link from 'next/link';
import styles from './admin.module.css';

// Rewards admin sub-section of the hardened /superadmin console. Authorization is
// enforced by the parent app/superadmin/layout.tsx (requireSuperadmin → platform_admins
// + MFA step-up), and every rewards server action re-checks via requireSuperadmin —
// this layout is only the sub-navigation, not a gate.
export default function RewardsAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.kick}>Rewards admin</div>
      <nav className={styles.nav}>
        <Link href="/superadmin/rewards">Overview</Link>
        <Link href="/superadmin/rewards/perks">Perks</Link>
        <Link href="/superadmin/rewards/rules">Global rules</Link>
        <Link href="/superadmin/rewards/analytics">Analytics</Link>
        <Link href="/superadmin/rewards/moderation">Moderation</Link>
        <Link href="/superadmin/rewards/fulfillment">Fulfillment</Link>
      </nav>
      {children}
    </div>
  );
}
