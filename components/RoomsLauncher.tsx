'use client';
import Link from 'next/link';
export default function RoomsLauncher() {
  return (
    <Link href="/rooms" aria-label="Ephemeral rooms" style={{
      position: 'fixed', right: 16, bottom: 'calc(86px + env(safe-area-inset-bottom))', zIndex: 40,
      width: 46, height: 46, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--card)', border: '1px solid var(--bd)', backdropFilter: 'blur(12px)', color: 'var(--ink)',
      boxShadow: '0 8px 22px -8px rgba(0,0,0,.6)', textDecoration: 'none', fontSize: 20,
    }}>
      <span aria-hidden>🦋</span>
    </Link>
  );
}
