import type { EnrichedEvent } from '@/lib/domain/enrich';
import { timeLabel } from '@/lib/format';
import Pill from './primitives/Pill';
import Avatar from './primitives/Avatar';
import RsvpButtons from './RsvpButtons';
import MotionAvatarStack from './MotionAvatarStack';

export default function EventCard({ ev, meId }: { ev: any; meId: string }) {
  if (ev.busy)
    return (
      <div className="card">
        <div className="row between">
          <Pill type="busy" />
          <span className="meta">{timeLabel(ev.startTime)}</span>
        </div>
        <div className="ev-title faint" style={{ marginBottom: 0 }}>
          A friend is busy
        </div>
      </div>
    );
  const proof = ev.proof?.count ? (
    <div className="proof">
      <MotionAvatarStack users={ev.proof.sample} />
      <span>{ev.proof.count} going</span>
    </div>
  ) : (
    <div className="proof">
      <span className="faint">be the first in</span>
    </div>
  );
  return (
    <div className="card">
      <div className="row between">
        <Pill type={ev.type} recurring={!!ev.recurring} />
        <span className="meta">{timeLabel(ev.startTime)}</span>
      </div>
      <div className="ev-title">{ev.title}</div>
      <div className="meta">
        {ev.creator.displayName}
        {ev.location && (
          <>
            <span className="dot" />
            {ev.location}
          </>
        )}
      </div>
      <div className="row between" style={{ marginTop: 12 }}>
        {proof}
        {ev.creator.id === meId ? (
          <span className="btn sm in">Hosting</span>
        ) : (
          <RsvpButtons eventId={ev.id} myRsvp={ev.myRsvp} />
        )}
      </div>
    </div>
  );
}
