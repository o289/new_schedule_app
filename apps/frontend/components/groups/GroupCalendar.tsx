import { useMemo, useRef, useState } from "react";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FullCalendar from "@fullcalendar/react";
import type {
  DatesSetArg,
  EventClickArg,
  EventContentArg,
} from "@fullcalendar/core";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import jaLocale from "@fullcalendar/core/locales/ja";
import timeGridPlugin from "@fullcalendar/timegrid";

import type { GroupDailyBusySegment } from "./groupCalendarSegments";
import GroupEventCard from "./GroupEventCard";
import GroupEventDetailDrawer from "./GroupEventDetailDrawer";
import {
  getGroupCalendarRange,
  toGroupCalendarEvents,
  type GroupCalendarRange,
} from "./groupCalendarView";
import "./GroupCalendar.css";

type GroupCalendarProps = {
  segments: GroupDailyBusySegment[];
  initialDate: string;
  onRangeChange: (range: GroupCalendarRange) => void;
};

export default function GroupCalendar({
  segments,
  initialDate,
  onRangeChange,
}: GroupCalendarProps) {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [title, setTitle] = useState("");
  const [selectedSegment, setSelectedSegment] =
    useState<GroupDailyBusySegment | null>(null);
  const events = useMemo(() => toGroupCalendarEvents(segments), [segments]);

  const handleDatesSet = (arg: DatesSetArg) => {
    setTitle(arg.view.title);
    onRangeChange(getGroupCalendarRange(arg.start, arg.end));
  };
  const handleEventClick = (arg: EventClickArg) => {
    const segment = arg.event.extendedProps.segment as
      GroupDailyBusySegment | undefined;
    if (segment) setSelectedSegment(segment);
  };
  const eventContent = (arg: EventContentArg) => {
    const segment = arg.event.extendedProps.segment as GroupDailyBusySegment;
    return (
      <GroupEventCard
        timeText={arg.timeText}
        memberCount={segment.memberCount}
      />
    );
  };

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="前の週を表示"
            className="group-calendar-navigation"
            onClick={() => calendarRef.current?.getApi().prev()}
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            aria-label="次の週を表示"
            className="group-calendar-navigation"
            onClick={() => calendarRef.current?.getApi().next()}
          >
            <ChevronRightIcon />
          </button>
        </div>
        <h2 className="text-base font-bold text-[#111827]">{title}</h2>
      </div>

      <div className="group-calendar-scroll rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
        <div className="group-calendar-min-width">
          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin, luxonPlugin]}
            initialView="timeGridWeek"
            initialDate={initialDate}
            locale={jaLocale}
            timeZone="Asia/Tokyo"
            firstDay={0}
            headerToolbar={false}
            allDaySlot={false}
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            slotDuration="00:30:00"
            editable={false}
            selectable={false}
            eventStartEditable={false}
            eventDurationEditable={false}
            events={events}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            eventContent={eventContent}
            eventTimeFormat={{
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }}
            height="auto"
          />
        </div>
      </div>

      <GroupEventDetailDrawer
        segment={selectedSegment}
        onClose={() => setSelectedSegment(null)}
      />
    </>
  );
}
