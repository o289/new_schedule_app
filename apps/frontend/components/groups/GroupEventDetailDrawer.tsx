import CloseIcon from "@mui/icons-material/Close";
import { Drawer, IconButton } from "@mui/material";

import { ProfileAvatar } from "#frontend/components/common/ProfileAvatar";
import type { GroupDailyBusySegment } from "./groupCalendarSegments";
import { formatGroupCalendarEventTimeRange } from "./groupCalendarView";

type GroupEventDetailDrawerProps = {
  segment: GroupDailyBusySegment | null;
  onClose: () => void;
};

export default function GroupEventDetailDrawer({
  segment,
  onClose,
}: GroupEventDetailDrawerProps) {
  return (
    <Drawer
      anchor="right"
      open={segment !== null}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100vw", sm: 400 } } }}
    >
      <section aria-label="グループ予定の詳細" className="h-full p-6">
        <div className="flex justify-end">
          <IconButton aria-label="予定詳細を閉じる" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>

        <div className="text-center">
          <p className="text-sm font-semibold text-[#2563eb]">予定あり</p>
          {segment && (
            <p className="mt-2 text-sm text-[#4b5563]">
              {formatGroupCalendarEventTimeRange(
                segment.startDate,
                segment.endDate,
              )}
            </p>
          )}
        </div>

        <h2 className="mt-8 text-lg font-bold text-[#111827]">
          メンバーごとの予定
        </h2>
        <ul className="mt-3 space-y-3">
          {segment?.events.map((event) => (
            <li
              key={event.dateId}
              className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] p-3"
            >
              <ProfileAvatar
                name={event.member.name}
                avatar={event.member.avatar}
                size={36}
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[#111827]">
                  {event.member.name}
                </p>
                <p className="mt-1 text-xs text-[#4b5563]">
                  {formatGroupCalendarEventTimeRange(
                    event.startDate,
                    event.endDate,
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Drawer>
  );
}
