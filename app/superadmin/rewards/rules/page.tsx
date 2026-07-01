import { getActiveGlobalRules } from '@/lib/rewards/admin-queries';
import RulesEditor from '@/components/admin/RulesEditor';
import styles from '../admin.module.css';

export default async function AdminRulesPage() {
  const rules = await getActiveGlobalRules();
  return (
    <>
      <h1 className={styles.title}>Global reward rules</h1>
      <p className={styles.muted}>
        The platform-governed global currency. Every valid check-in to any rewards event earns this
        base plus the platform bonuses below — organizers cannot change it. Saving edits the single
        active rules row (or creates it if none exists).
      </p>
      <RulesEditor rules={rules} />
    </>
  );
}
