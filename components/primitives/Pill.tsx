import Icon, { type IconName } from './Icon';
const PILL: Record<string, [IconName, string]> = {
  intention: ['free', 'Free'],
  plan: ['standing', 'Plan'],
  event: ['event', 'Event'],
  scene: ['scene', 'Scene'],
  busy: ['event', 'Busy'],
};
export function typeClass(t: string) {
  return (
    (
      {
        intention: 'free',
        plan: 'standing',
        event: 'event',
        scene: 'scene',
        busy: 'busy',
      } as Record<string, string>
    )[t] || 'event'
  );
}
export default function Pill({ type, recurring }: { type: string; recurring?: boolean }) {
  const [icon, label] = PILL[type] || PILL.event;
  return (
    <span className={`pill ${typeClass(type)}`}>
      <Icon name={icon} /> {label}
      {recurring ? ' ·↻' : ''}
    </span>
  );
}
