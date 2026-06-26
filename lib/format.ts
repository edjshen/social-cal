export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export function dayLabel(iso: string) {
  const day = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
  const diff = Math.round((day(new Date(iso)) - day(new Date())) / 864e5);
  const wd = new Date(iso).toLocaleDateString('en-US', { weekday: 'short' });
  if (diff === 0) return 'Today · ' + wd;
  if (diff === 1) return 'Tomorrow · ' + wd;
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });
}
export function relTime(iso: string) {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return 'today'; if (days === 1) return 'yesterday'; if (days < 14) return days + 'd ago'; return Math.round(days / 7) + 'w ago';
}
