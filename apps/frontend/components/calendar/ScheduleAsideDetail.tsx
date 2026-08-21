import { Button, Chip, Divider } from "@mui/material";
import { Delete as DeleteIcon } from "@mui/icons-material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PendingOutlinedIcon from "@mui/icons-material/PendingOutlined";
import VideoCallOutlinedIcon from "@mui/icons-material/VideoCallOutlined";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { AsideMode } from "#frontend/context/CalendarContext";
import type { ScheduleResponse } from "#frontend/types/schedule";
import { formatDateTime } from "#frontend/utils/date";
import { getCategoryTheme } from "#frontend/utils/getCategoryTheme";
import { getCategoryIcon } from "#frontend/constants/categoryIcons";
import { buildTimeGroupsFromDates } from "./scheduleViewAdapter";
import { DateTimeCard } from "./DateTimeCard";
import ConfirmDialog from "../ConfirmDialog";
import { formatScheduleDateRange } from "../schedules/scheduleTime";
import { getMeetingProvider } from "#frontend/utils/meetingUrl";

interface Props {
  schedule: ScheduleResponse;
  handleScheduleDelete: () => Promise<void>;
  setAsideMode: (mode: AsideMode) => void;
  selectedScheduleDateId: string | null;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
}

export default function ScheduleAsideDetail({
  schedule,
  handleScheduleDelete,
  setAsideMode,
  selectedScheduleDateId,
  setIsDrawerOpen,
}: Props) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const theme = getCategoryTheme(schedule.category?.color);
  const iconColor = theme.border;
  const Icon = getCategoryIcon(schedule.category?.icon);
  const selectedScheduleDate =
    schedule.dates.find((date) => date.id === selectedScheduleDateId) ??
    schedule.dates[0];
  const startDate = selectedScheduleDate?.startDate;
  const endDate = selectedScheduleDate?.endDate;
  const meetingProvider = getMeetingProvider(schedule.url);

  if (!startDate || !endDate) return <>取得できなかった</>;

  const otherDates = Array.isArray(schedule?.dates)
    ? schedule.dates.filter((date) => date.id !== selectedScheduleDate?.id)
    : [];

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await handleScheduleDelete();
      setIsDeleteDialogOpen(false);
      setAsideMode(null);
      setIsDrawerOpen?.(false);
    } finally {
      setIsDeleting(false);
    }
  };

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
          <div className="mb-6 justify-center">
            <h1 className="text-4xl font-bold break-words">{schedule.title}</h1>
          </div>

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
                {formatScheduleDateRange(startDate, endDate)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 mb-6">
            <Icon aria-hidden="true" sx={{ color: iconColor, fontSize: 40 }} />
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

          {schedule.isTentative && (
            <div className="flex items-center gap-4 mb-6">
              <Chip
                icon={<PendingOutlinedIcon />}
                label="仮押さえ・未確定"
                aria-label="仮押さえ・未確定の予定"
                sx={{
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  color: theme.border,
                  fontWeight: 700,
                  "& .MuiChip-icon": { color: theme.border },
                }}
              />
            </div>
          )}

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
                key={`${timeGroup.start}-${timeGroup.end}-${timeGroup.crossesDate}`}
                timeGroup={timeGroup}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-4">
          {meetingProvider && schedule.url && (
            <Button
              type="button"
              variant="contained"
              component="a"
              href={schedule.url}
              target="_blank"
              rel="noreferrer"
              startIcon={<VideoCallOutlinedIcon />}
              size="large"
            >
              {meetingProvider}の会議に参加
            </Button>
          )}

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
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            削除
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={isDeleteDialogOpen}
        title="削除しますか？"
        message={`スケジュール「${schedule.title}」を削除しますか？`}
        isProcessing={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setIsDeleteDialogOpen(false)}
      />
    </>
  );
}
