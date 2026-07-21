import { useState, useEffect } from "react";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { formatDateTime, toISODate, toISODatetime } from "../../utils/date";

import CloseIcon from "@mui/icons-material/Close";

import TimePicker from "../../components/commonPicker/TimePicker";
import type { ScheduleFormDate } from "../../types/schedule";

interface EditableDate {
  id?: string;
  localId: string;
  date: string;
  start: string;
  end: string;
}

interface ScheduleDatesModalProps {
  dates: ScheduleFormDate[];
  onClose: () => void;
  onChange?: (dates: ScheduleFormDate[]) => void;
}

export default function ScheduleDatesModal({
  dates,
  onClose,
  onChange,
}: ScheduleDatesModalProps) {
  // モーダル内部でのみ使用する編集用 state
  const [internalDates, setInternalDates] = useState<EditableDate[]>([]);

  // モーダルの見た目制御のため(MUI製)
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("md"));

  // dates を初期値として internalDates を生成
  useEffect(() => {
    setInternalDates(
      dates
        .map((date) => ({
          ...(date.id !== undefined && { id: date.id }),
          date: toISODate(date.startDate),
          start: formatDateTime(date.startDate, "time"),
          end: formatDateTime(date.endDate, "time"),
          localId: crypto.randomUUID(),
        }))
        .sort((a, b) => {
          const aDate = new Date(toISODatetime(a.date, a.start)).getTime();
          const bDate = new Date(toISODatetime(b.date, b.start)).getTime();
          return aDate - bDate;
        }),
    );
  }, [dates]);

  const handleTimeChange = (
    localId: string,
    field: "start" | "end",
    value: string,
  ) => {
    setInternalDates((prev) =>
      prev.map((date) =>
        date.localId === localId
          ? {
              ...date,
              [field]: value,
            }
          : date,
      ),
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      fullScreen={fullScreen}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>登録済み日程</DialogTitle>

      <DialogContent dividers>
        {internalDates.length === 0 && <p>日程はありません。</p>}

        {internalDates.map((date) => (
          <div
            key={date.localId}
            className="relative mb-3 rounded-lg border border-[#ddd] bg-[#fafbfc] p-3"
          >
            <div style={{ display: "block", marginBottom: "4px" }}>
              日程: {formatDateTime(date.date, "date")}
            </div>

            <div className="m-3">
              <TimePicker
                label="開始"
                mode="start"
                value={date.start}
                constraintValue={date.end}
                onChange={(value) =>
                  handleTimeChange(date.localId, "start", value)
                }
              />
            </div>

            <div className="m-3">
              <TimePicker
                label="終了"
                mode="end"
                value={date.end}
                constraintValue={date.start}
                onChange={(value) =>
                  handleTimeChange(date.localId, "end", value)
                }
              />
            </div>
          </div>
        ))}
      </DialogContent>

      <DialogActions>
        <Button
          type="button"
          variant="contained"
          startIcon={<CloseIcon />}
          onClick={() => {
            if (onChange) {
              const merged = internalDates.map(({ id, date, start, end }) => ({
                ...(id !== undefined && { id }),
                startDate: toISODatetime(date, start),
                endDate: toISODatetime(date, end),
              }));
              onChange(merged);
            }
            onClose();
          }}
        >
          閉じる
        </Button>
      </DialogActions>
    </Dialog>
  );
}
