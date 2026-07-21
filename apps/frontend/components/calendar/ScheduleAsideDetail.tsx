import { Button, Chip, Divider } from "@mui/material";
import { Delete as DeleteIcon } from "@mui/icons-material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { EventApi } from "@fullcalendar/core";
import type { Dispatch, SetStateAction } from "react";
import type { AsideMode } from "../../context/CalendarContext";
import type { ScheduleResponse } from "../../types/schedule";
import { formatDateTime } from "../../utils/date";
import { getCategoryTheme } from "../../utils/getCategoryTheme";
import { buildTimeGroupsFromDates } from "./scheduleViewAdapter";
import { DateTimeCard } from "./DateTimeCard";

interface Props {
  schedule: ScheduleResponse;
  handleScheduleDelete: () => Promise<void>;
  setAsideMode: (mode: AsideMode) => void;
  selectedEvent: EventApi | null;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

export default function ScheduleAsideDetail({
  schedule,
  handleScheduleDelete,
  setAsideMode,
  selectedEvent,
  setIsDrawerOpen,
}: Props) {
  const theme = getCategoryTheme(schedule.category?.color);
  const iconColor = theme.border;
  const selectedScheduleDate =
    schedule.dates.find((date) => date.id === selectedEvent?.id) ??
    schedule.dates[0];
  const startDate = selectedScheduleDate?.startDate;
  const endDate = selectedScheduleDate?.endDate;

  if (!startDate || !endDate) return <>取得できなかった</>;

  const selectedDateStr = startDate ? formatDateTime(startDate, "date") : null;

  const otherDates = Array.isArray(schedule?.dates)
    ? schedule.dates.filter((d) => {
        if (!selectedDateStr) return true;
        const dStr = formatDateTime(d.startDate, "date");
        return dStr !== selectedDateStr;
      })
    : [];

  return (
    <>
      <Button
        type="button"
        variant="text"
        startIcon={<ArrowBackIcon sx={{ fontSize: 36 }} />}
        onClick={() => {
          setAsideMode(null);
          if (setIsDrawerOpen) {
            setIsDrawerOpen(false);
          }
        }}
        sx={{
          color: "#111827",
          minWidth: "auto",
          "&:hover": {
            backgroundColor: "transparent",
          },
        }}
        className="!text-xl !justify-start !p-0"
      >
        戻る
      </Button>
      <div className="p-4">
        <div className="bg-white rounded-3xl shadow-md p-6 mb-6">
          <h1 className="text-4xl font-bold mb-6 break-words">
            {schedule.title}
          </h1>
          <Divider className="!mb-6" />

          <div className="flex items-center gap-4 mb-6">
            <CalendarMonthOutlinedIcon
              sx={{ color: iconColor, fontSize: 40 }}
            />
            <div>
              <div className="text-gray-500 text-sm">日付</div>
              <div className="text-2xl">
                {formatDateTime(startDate, "date") || "日付不明"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <AccessTimeOutlinedIcon sx={{ color: iconColor, fontSize: 40 }} />
            <div>
              <div className="text-gray-500 text-sm">時間</div>
              <div className="text-2xl">
                {formatDateTime(startDate, "time")} -{" "}
                {formatDateTime(endDate, "time")}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <LocalOfferOutlinedIcon sx={{ color: iconColor, fontSize: 40 }} />
            <div>
              <div className="text-gray-500 text-sm mb-2">カテゴリー</div>
              <Chip
                label={schedule.category?.name || "なし"}
                sx={{
                  backgroundColor: iconColor,
                  color: "#fff",
                  fontWeight: 600,
                }}
              />
            </div>
          </div>

          {schedule.note && (
            <>
              <Divider className="!mb-6" />
              <div>
                <div className="font-semibold mb-2">メモ</div>
                <div>{schedule.note}</div>
              </div>
            </>
          )}
        </div>

        {Array.isArray(otherDates) && otherDates.length > 0 && (
          <div className="mb-6">
            <div className="text-2xl font-bold mb-4">他の日程</div>

            {buildTimeGroupsFromDates(otherDates, "gray").map((timeGroup) => (
              <DateTimeCard
                key={`${timeGroup.start}-${timeGroup.end}`}
                timeGroup={timeGroup}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4">
          <Button
            type="button"
            variant="outlined"
            startIcon={<EditOutlinedIcon />}
            sx={{
              color: iconColor,
              borderColor: iconColor,
              "&:hover": {
                borderColor: iconColor,
                backgroundColor: `${iconColor}10`,
              },
            }}
            size="large"
            onClick={() => {
              setAsideMode("edit");
            }}
          >
            編集
          </Button>

          <Button
            type="button"
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            size="large"
            onClick={() => {
              handleScheduleDelete();
              setAsideMode(null);
            }}
          >
            削除
          </Button>
        </div>
      </div>
    </>
  );
}
