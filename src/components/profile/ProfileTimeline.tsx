import type { ReactNode } from "react";

export type TimelineEvent = {
  id: string;
  title: string;
  subtitle?: string;
  timestamp?: Date | null;
  icon?: ReactNode;
};

function formatTimestamp(timestamp?: Date | null) {
  if (!timestamp) return "Unknown date";
  return timestamp.toLocaleString();
}

export function ProfileTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-800 bg-[#0b0b0f]/60 px-6 py-5 text-sm text-gray-400">
        No collection activity yet. Go hunt some beasts!
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-800 bg-[#0b0b0f]/60 px-6 py-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gold">
        Collection Timeline
      </h3>
      <ol className="mt-4 space-y-4 border-l border-gray-800 pl-6">
        {events.map((event) => (
          <li key={event.id} className="relative">
            <span className="absolute -left-3 top-1 h-2.5 w-2.5 rounded-full border border-gold bg-gold" />
            <div className="text-xs uppercase tracking-wide text-gray-500">
              {formatTimestamp(event.timestamp)}
            </div>
            <div className="text-sm font-semibold text-gray-200">{event.title}</div>
            {event.subtitle ? (
              <div className="text-xs text-gray-400">{event.subtitle}</div>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default ProfileTimeline;
