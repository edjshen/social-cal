export type EventType = 'intention' | 'plan' | 'event' | 'scene';
export type Visibility = 'inner' | 'orbit' | 'public';
export type Rsvp = 'going' | 'down' | 'maybe' | 'cant';
export type Tier = 'inner' | 'orbit';
export const ATTEND: Rsvp[] = ['going', 'down', 'maybe'];
export const EVENT_TYPES: EventType[] = ['intention', 'plan', 'event', 'scene'];

export interface PublicUser {
  id: string;
  handle: string;
  displayName: string;
  avatar: string;
  initials: string;
}
