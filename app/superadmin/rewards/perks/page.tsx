import { listPlatformPerks } from '@/lib/rewards/admin-queries';
import PerkEditor from '@/components/admin/PerkEditor';
import styles from '../admin.module.css';

export default async function AdminPerksPage() {
  const perks = await listPlatformPerks();
  return (
    <>
      <h1 className={styles.title}>Platform perks</h1>
      <p className={styles.muted}>
        First-party catalog spendable with global points. Schema is sponsorship-ready (source /
        sponsor / placement) but unbilled in v1.
      </p>

      <div className={styles.section}>
        <div className={styles.sectionH}>New perk</div>
        <PerkEditor />
      </div>

      <div className={styles.section}>
        <div className={styles.sectionH}>Catalog ({perks.length})</div>
        {perks.length === 0 && <div className="empty">No perks yet. Create one above.</div>}
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Cost</th>
              <th>Fulfillment</th>
              <th>Source</th>
              <th>Inventory</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {perks.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.title}</strong>
                  {p.description ? <div className={styles.muted}>{p.description}</div> : null}
                  <PerkEditor perk={p} />
                </td>
                <td>{p.pointCost.toLocaleString()}</td>
                <td>{p.fulfillment}</td>
                <td>{p.source}</td>
                <td>{p.totalInventory != null ? p.totalInventory : '∞'}</td>
                <td>
                  <span className={`${styles.badge} ${p.active ? styles.badgeOn : ''}`}>
                    {p.active ? 'active' : 'inactive'}
                  </span>
                </td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
