/**
 * Mayfly — embedded ephemeral group chat. This layout owns the /rooms area's
 * own minimal chrome, independent of the marketing-site nav (which LayoutShell
 * already suppresses for /rooms paths).
 *
 * The feature is unlisted, noindex, and gated by middleware.js until launch
 * (ROOMS_ENABLED). See docs/mayfly-handoff.md.
 */
import styles from './rooms.module.css';

export const metadata = {
  // Belt-and-suspenders with the middleware X-Robots-Tag + robots.js disallow.
  robots: { index: false, follow: false, nocache: true },
  title: 'rooms',
  // Don't let a fragment credential leak via the Referer header.
  referrer: 'no-referrer',
};

// Mayfly is a fully client-driven, per-request surface; never prerender it.
export const dynamic = 'force-dynamic';

export default function RoomsLayout({ children }) {
  return (
    <div data-area="rooms" className={styles.shell}>
      {children}
    </div>
  );
}
