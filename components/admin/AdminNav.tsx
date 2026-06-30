import Link from 'next/link';
export default function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin">
      <Link href="/superadmin">Overview</Link>
      <Link href="/superadmin/users">Users</Link>
      <Link href="/superadmin/moderation">Moderation</Link>
      <Link href="/superadmin/audit">Audit</Link>
    </nav>
  );
}
