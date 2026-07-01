export type EventType = 'intention' | 'plan' | 'event' | 'scene';
// Personal-calendar audience for an event:
//   private → only the creator (plus members of any orbit it's shared to)
//   orbit   → "My Orbit" — everyone the creator is connected to
//   public  → anyone, including logged-out visitors
// 'inner' is a legacy value from the old two-tier model; it's still accepted and
// treated exactly like 'orbit' so pre-existing events stay visible to connections.
export type Visibility = 'private' | 'inner' | 'orbit' | 'public';
export type Rsvp = 'going' | 'down' | 'maybe' | 'cant';
export type Tier = 'inner' | 'orbit';
export const ATTEND: Rsvp[] = ['going', 'down', 'maybe'];
export const EVENT_TYPES: EventType[] = ['intention', 'plan', 'event', 'scene'];

// A light view of a custom orbit, safe to ship to clients / embed in events.
export interface OrbitSummary {
  id: string;
  name: string;
  color: string | null;
}

export interface PublicUser {
  id: string;
  handle: string;
  displayName: string;
  avatar: string;
  initials: string;
}
