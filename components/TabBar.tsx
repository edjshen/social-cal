'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { type IconName } from './primitives/Icon';
import CreateButton from './CreateButton';

const TABS: { href: string; icon: IconName; label: string }[] = [
  { href: '/discover', icon: 'discover', label: 'Discover' },
  { href: '/plans', icon: 'plans', label: 'Plans' },
  { href: '/regulars', icon: 'regulars', label: 'Regulars' },
  { href: '/you', icon: 'you', label: 'You' },
];
export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="nav">
      {TABS.slice(0, 2).map((t) => <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'on' : ''}><Icon name={t.icon} />{t.label}</Link>)}
      <CreateButton />
      {TABS.slice(2).map((t) => <Link key={t.href} href={t.href} className={path.startsWith(t.href) ? 'on' : ''}><Icon name={t.icon} />{t.label}</Link>)}
    </nav>
  );
}
