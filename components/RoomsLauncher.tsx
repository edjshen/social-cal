'use client';
import Link from 'next/link';
export default function RoomsLauncher() {
  return (
    <Link href="/rooms" aria-label="Ephemeral rooms" className="rooms-fab">
      <span aria-hidden>🦋</span>
    </Link>
  );
}
