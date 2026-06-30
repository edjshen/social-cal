import type { AdminStats } from '@/lib/db/admin';
export default function StatCards({ stats }: { stats: AdminStats }) {
  const cards = [
    ['Users', stats.users],
    ['Ghosted', stats.ghosted],
    ['Connections', stats.connections],
    ['RSVPs', stats.rsvps],
    ['Signups · 7d', stats.signups7d],
    ['Signups · 30d', stats.signups30d],
  ] as const;
  return (
    <div className="stat-cards">
      {cards.map(([label, n]) => (
        <div key={label} className="stat-card">
          <div className="stat-n">{n}</div>
          <div className="stat-label">{label}</div>
        </div>
      ))}
      <div className="stat-card">
        <div className="stat-label">Events by type</div>
        <ul>
          {stats.eventsByType.map((e) => (
            <li key={e.type}>
              {e.type}: {e.n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
