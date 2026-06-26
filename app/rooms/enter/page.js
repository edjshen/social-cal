import RoomsHomeClient from '../_components/RoomsHomeClient';

// Convenience entry for links shaped `/rooms/enter#i=..&k=..&v=1`. The canonical
// cast link is `/rooms#...`, but this alias resolves the same way: the client
// reads the credential from location.hash, saves it, and connects. Both paths
// are covered by the middleware gate (matcher includes /rooms/:path*).
export default function RoomsEnterPage() {
  return <RoomsHomeClient />;
}
