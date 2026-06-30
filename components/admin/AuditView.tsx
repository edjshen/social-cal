import Link from 'next/link';

type Row = {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
};

export default function AuditView({
  rows,
  page,
  action,
}: {
  rows: Row[];
  page: number;
  action: string;
}) {
  const q = (p: number) =>
    `/admin/audit?page=${p}${action ? `&action=${encodeURIComponent(action)}` : ''}`;
  return (
    <div>
      <table>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Action</th>
            <th scope="col">Target</th>
            <th scope="col">Summary</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.createdAt}</td>
              <td>{r.action}</td>
              <td>
                {r.targetType}:{r.targetId}
              </td>
              <td>{r.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>No audit entries{action ? ` for "${action}"` : ''}.</p>}
      <div className="pager">
        {page > 0 && <Link href={q(page - 1)}>← Newer</Link>}
        {rows.length === 50 && <Link href={q(page + 1)}>Older →</Link>}
      </div>
    </div>
  );
}
