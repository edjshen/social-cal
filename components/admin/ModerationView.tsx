'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { adminDeleteEvent, adminRemoveConnection } from '@/lib/actions/admin';

type Ev = {
  id: string;
  title: string;
  type: string;
  visibility: string;
  creatorHandle: string | null;
};
type Conn = { id: string; a: string; b: string; status: string };

export default function ModerationView({
  events,
  connections,
}: {
  events: Ev[];
  connections: Conn[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  // Server actions enforce the rules; Next.js redacts action errors in prod, so
  // show ONE generic message on any failure (never read err.message).
  async function run(id: string, fn: () => Promise<void>, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
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
      {err && <p role="alert">{err}</p>}
      <h2>Events ({events.length})</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Title</th>
            <th scope="col">Type</th>
            <th scope="col">Vis</th>
            <th scope="col">Creator</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{e.title}</td>
              <td>{e.type}</td>
              <td>{e.visibility}</td>
              <td>{e.creatorHandle ?? '—'}</td>
              <td>
                <button
                  disabled={busy === e.id}
                  onClick={() =>
                    run(
                      e.id,
                      () => adminDeleteEvent(e.id),
                      `Delete "${e.title}"? This cannot be undone.`
                    )
                  }
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Connections ({connections.length})</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">A</th>
            <th scope="col">B</th>
            <th scope="col">Status</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {connections.map((c) => (
            <tr key={c.id}>
              <td>{c.a}</td>
              <td>{c.b}</td>
              <td>{c.status}</td>
              <td>
                <button
                  disabled={busy === c.id}
                  onClick={() =>
                    run(c.id, () => adminRemoveConnection(c.id), `Remove ${c.a} ↔ ${c.b}?`)
                  }
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
