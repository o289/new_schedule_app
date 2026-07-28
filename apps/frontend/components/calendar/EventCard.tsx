import { getCategoryTheme } from "../../utils/getCategoryTheme";
import { getCategoryIcon } from "../../constants/categoryIcons";
import type { EventApi } from "@fullcalendar/core";
import type { CategoryIcon } from "../../../../packages/schemas/category";

interface EventCardProps {
  event: EventApi;
  timeText: string;
  variant: "month" | "week";
}

export default function EventCard({
  event,
  timeText,
  variant,
}: EventCardProps) {
  const schedule = event.extendedProps.schedule as {
    category?: {
      color?: Parameters<typeof getCategoryTheme>[0];
      icon?: CategoryIcon;
    };
  };
  const theme = getCategoryTheme(schedule.category?.color);
  const Icon = getCategoryIcon(schedule.category?.icon);

  if (variant === "month") {
    return (
      <div
        className="flex min-w-0 items-center gap-1 overflow-hidden rounded-md border border-[#e5e7eb] bg-white px-1.5 py-0.5 shadow-sm"
        style={{
          borderLeft: `3px solid ${theme.border}`,
        }}
      >
        {timeText && (
          <span className="shrink-0 text-[11px] font-semibold text-[#4b5563]">
            {timeText}
          </span>
        )}
        <Icon
          aria-hidden="true"
          className="shrink-0"
          sx={{ color: theme.border, fontSize: 14 }}
        />
        <span
          className="truncate text-[11px] font-bold"
          style={{ color: theme.border }}
        >
          {event.title}
        </span>
      </div>
    );
  }

  if (variant === "month") {
    return (
      <div
        className="flex min-w-0 items-center gap-1 overflow-hidden rounded-md border border-[#e5e7eb] bg-white px-1.5 py-0.5 shadow-sm"
        style={{
          borderLeft: `3px solid ${theme.border}`,
        }}
      >
        {timeText && (
          <span className="shrink-0 text-[11px] font-semibold text-[#4b5563]">
            {timeText}
          </span>
        )}
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: theme.border }}
        />
        <span
          className="truncate text-[11px] font-bold"
          style={{ color: theme.border }}
        >
          {event.title}
        </span>
      </div>
    );
  }

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
