import RoomsHomeClient from './_components/RoomsHomeClient';

// Server entry — all real work happens client-side (crypto, IndexedDB, cast).
// The middleware gate (middleware.js) has already decided whether this route is
// reachable at all.
export default function RoomsPage() {
  return <RoomsHomeClient />;
}
