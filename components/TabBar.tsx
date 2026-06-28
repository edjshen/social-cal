'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from './primitives/Icon';

const TABS: { href: string; icon: IconName; label: string }[] = [
  { href: '/discover', icon: 'discover', label: 'Discover' },
  { href: '/plans', icon: 'plans', label: 'Plans' },
  { href: '/regulars', icon: 'regulars', label: 'Regulars' },
  { href: '/you', icon: 'you', label: 'You' },
];
export default function TabBar() {
  const path = usePathname();
  const onCal = path.startsWith('/calendar');
  return (
    <nav className="nav">
      <Link href="/discover" className="brand" aria-label="Barycal">
        <span className="brand-mark" />
        <span className="brand-name">Barycal</span>
      </Link>
      {TABS.slice(0, 2).map((t) => (
        <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'on' : ''}>
          <Icon name={t.icon} />
          {t.label}
        </Link>
      ))}
      <Link href="/calendar" className={'cal-tab' + (onCal ? ' on' : '')} aria-label="Calendar">
        <span className="create">
          <Icon name="calendar" />
        </span>
        <span className="nav-label">Calendar</span>
      </Link>
      {TABS.slice(2).map((t) => (
        <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'on' : ''}>
          <Icon name={t.icon} />
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
