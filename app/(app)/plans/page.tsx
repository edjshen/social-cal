import { redirect } from 'next/navigation';

// Plans was folded during the rewards-feature tab rework — RSVP'd plans now
// surface on the Calendar. Kept as a redirect for one release.
export default function PlansPage() {
  redirect('/calendar');
}
