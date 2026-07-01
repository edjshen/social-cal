import { redirect } from 'next/navigation';

// Discover was folded into the organizer-focused Organizations tab during the
// rewards-feature tab rework. Kept as a redirect for one release so existing
// links/bookmarks don't 404.
export default function DiscoverPage() {
  redirect('/organizations');
}
