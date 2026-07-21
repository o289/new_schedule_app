import { getCategoryTheme } from "../../utils/getCategoryTheme";
import type { EventApi } from "@fullcalendar/core";

interface EventCardProps {
  event: EventApi;
  timeText: string;
}

export default function EventCard({ event, timeText }: EventCardProps) {
  const schedule = event.extendedProps.schedule as {
    category?: { color?: Parameters<typeof getCategoryTheme>[0] };
  };
  const theme = getCategoryTheme(schedule.category?.color);

  return (
    <div
      className="h-full overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-sm"
      style={{
        borderLeft: `4px solid ${theme.border}`,
      }}
    >
      <div className="flex h-full flex-col px-3">
        <div className="text-[14px] font-semibold text-[#374151]">
          {timeText}
        </div>

        <div className="flex items-center gap-1.5 text-[14px] font-bold md:mt-1">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: theme.border }}
          />

          <span style={{ color: theme.border }}>{event.title}</span>
        </div>
      </div>
    </div>
  );
}
