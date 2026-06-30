'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminToggleGhost, adminForceResetPassword, adminDeleteUser } from '@/lib/actions/admin';

type Row = {
  id: string;
  handle: string;
  email: string | null;
  ghost: boolean;
  events: number;
  connections: number;
};

export default function UsersView({ users, meId }: { users: Row[]; meId: string }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [temp, setTemp] = useState<{ id: string; pw: string } | null>(null);
  const shown = users.filter((u) =>
    (u.handle + (u.email ?? '')).toLowerCase().includes(q.toLowerCase())
  );

  // Server actions enforce all rules; Next.js redacts action error messages in
  // prod, so on any failure we show a single generic message (the data is safe).
  async function run(id: string, fn: () => Promise<void>) {
    setBusy(id);
    setErr('');
    try {
      await fn();
      router.refresh();
    } catch {
      setErr("Couldn't complete that action — it's enforced server-side; nothing changed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="search handle / email"
        aria-label="Search users"
      />
      {err && <p role="alert">{err}</p>}
      <table>
        <thead>
          <tr>
            <th scope="col">Handle</th>
            <th scope="col">Email</th>
            <th scope="col">Events</th>
            <th scope="col">Conns</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((u) => (
            <tr key={u.id}>
              <td>
                {u.handle}
                {u.ghost ? ' 👻' : ''}
                {u.id === meId ? ' (you)' : ''}
              </td>
              <td>{u.email ?? '—'}</td>
              <td>{u.events}</td>
              <td>{u.connections}</td>
              <td>
                <button
                  disabled={busy === u.id}
                  onClick={() => run(u.id, () => adminToggleGhost(u.id, !u.ghost))}
                >
                  {u.ghost ? 'Unghost' : 'Ghost'}
                </button>
                {u.id !== meId && (
                  <button
                    disabled={busy === u.id}
                    onClick={() =>
                      run(u.id, async () => {
                        const r = await adminForceResetPassword(u.id);
                        setTemp({ id: u.id, pw: r.tempPassword });
                      })
                    }
                  >
                    Reset PW
                  </button>
                )}
                {u.id !== meId && (
                  <button
                    disabled={busy === u.id}
                    onClick={() => {
                      if (confirm(`Delete @${u.handle} and ALL their data? This cannot be undone.`))
                        run(u.id, () => adminDeleteUser(u.id));
                    }}
                  >
                    Delete
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {temp && (
        <p role="alert">
          Temp password (shown once): <code>{temp.pw}</code>{' '}
          <button onClick={() => setTemp(null)}>Dismiss</button>
        </p>
      )}
    </div>
  );
}
