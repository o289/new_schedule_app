import { useState, useEffect } from "react";
import { generateMonthGrid, shiftMonth } from "../../utils/monthGrid";
import TimePicker from "../commonPicker/TimePicker";
import ScheduleDatesModal from "../schedules/DatesModal";
import { useScheduleDateTime } from "../schedules/handleDateTime";

import {
  Button,
  Box,
  FormControl,
  MenuItem,
  Select,
  TextField,
  InputAdornment,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { getCategoryTheme } from "../../utils/getCategoryTheme";
import type { FormEvent } from "react";
import type { CategoryResponse, ScheduleForm } from "../../types/schedule";
import type { ScheduleChangeEvent } from "../schedules/useScheduleForm";

interface ScheduleAsideFormProps {
  mode: "create" | "edit";
  draftSchedule: ScheduleForm;
  categories: CategoryResponse[];
  onChange: (event: ScheduleChangeEvent) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCancel: () => void;
}

export default function ScheduleAsideForm({
  mode,
  draftSchedule,
  categories = [],
  onChange,
  onSubmit,
  onCancel,
}: ScheduleAsideFormProps) {
  // フォーム
  const { dates, start, setStart, end, setEnd, addDate, removeDate } =
    useScheduleDateTime(draftSchedule, onChange, mode === "edit");

  const [showDatesModal, setShowDatesModal] = useState(false);

  // フォームの誤送信防止
  const [disabled, setDisabled] = useState(true);
  useEffect(() => {
    if (
      draftSchedule.title &&
      draftSchedule.title.trim() !== "" &&
      dates.length > 0 &&
      draftSchedule.categoryId
    ) {
      setDisabled(false);
    } else {
      setDisabled(true);
    }
  }, [draftSchedule.title, dates, draftSchedule.categoryId]);

  // 日付ロジック一覧
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // month is 1-based

  const prevMonth = () => {
    const { year: newYear, month: newMonth } = shiftMonth(year, month, -1);
    setYear(newYear);
    setMonth(newMonth);
  };

  const nextMonth = () => {
    const { year: newYear, month: newMonth } = shiftMonth(year, month, 1);
    setYear(newYear);
    setMonth(newMonth);
  };

  const weeks = generateMonthGrid(year, month);
  return (
    <>
      <Button
        type="button"
        variant="text"
        startIcon={<ArrowBackIcon sx={{ fontSize: 36 }} />}
        onClick={onCancel}
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

      <form onSubmit={onSubmit}>
        <div className="mb-6">
          <div className="mb-2 text-left text-[18px] font-bold text-[#222]">
            タイトル
          </div>

          <TextField
            fullWidth
            variant="outlined"
            placeholder="タイトルを入力"
            name="title"
            value={draftSchedule.title || ""}
            onChange={onChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <CalendarMonthIcon />
                </InputAdornment>
              ),
            }}
          />
        </div>

        <div className="md-6">
          <div className="mb-2 text-left text-[18px] font-bold text-[#222]">
            カテゴリ
          </div>
          <FormControl fullWidth>
            <Select
              displayEmpty
              name="categoryId"
              value={draftSchedule.categoryId || ""}
              onChange={onChange}
              required
              renderValue={(selected) => {
                if (!selected) {
                  return (
                    <span style={{ color: "#b5b8c0" }}>選択してください</span>
                  );
                }

                const category = categories.find(
                  (cat) => String(cat.id) === String(selected),
                );

                if (!category) return "選択してください";

                const theme = getCategoryTheme(category.color);

                return (
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: theme.border,
                      }}
                    />
                    {category.name}
                  </Box>
                );
              }}
            >
              <MenuItem value="">
                <em>選択してください</em>
              </MenuItem>

              {categories.map((cat) => {
                const theme = getCategoryTheme(cat.color);

                return (
                  <MenuItem key={cat.id} value={cat.id}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Box
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          backgroundColor: theme.border,
                        }}
                      />
                      {cat.name}
                    </Box>
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
        </div>

        <div className="md-6">
          <div className="mb-2 text-left text-[18px] font-bold text-[#222]">
            時刻
          </div>

          <div className="flex flex-col gap-4 md:flex-row">
            {/* 開始時間 */}
            <TimePicker
              label="開始"
              mode="start"
              value={start}
              constraintValue={end}
              onChange={setStart}
            />

            {/* 終了時間 */}
            <TimePicker
              label="終了"
              mode="end"
              value={end}
              constraintValue={start}
              onChange={setEnd}
            />
          </div>
        </div>

        {start && end && (
          <>
            <div className="mb-6">
              <div className="mb-2 text-left text-[18px] font-bold text-[#222]">
                日付を選択
              </div>

              <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
                <div className="mb-6 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="px-2 text-3xl text-[#444]"
                  >
                    &lt;
                  </button>

                  <div className="text-[24px] font-bold text-[#222]">
                    {year}年 {month}月
                  </div>

                  <button
                    type="button"
                    onClick={nextMonth}
                    className="px-2 text-3xl text-[#444]"
                  >
                    &gt;
                  </button>
                </div>

                <div className="mb-4 grid grid-cols-7 text-center text-[16px] font-semibold">
                  <div className="text-red-500">日</div>
                  <div>月</div>
                  <div>火</div>
                  <div>水</div>
                  <div>木</div>
                  <div>金</div>
                  <div className="text-blue-500">土</div>
                </div>

                <div className="grid grid-cols-7 gap-2 text-center text-[16px]">
                  {weeks.map((week, weekIndex) =>
                    week.map((dayObj, dayIndex) => {
                      const { dateString, day, isCurrentMonth } = dayObj;
                      const isSelected = draftSchedule.dates?.some((d) =>
                        d.startDate.startsWith(dateString),
                      );

                      return (
                        <div
                          key={`${weekIndex}-${dayIndex}`}
                          className={[
                            "flex h-12 cursor-pointer items-center justify-center rounded-xl transition-colors",
                            isCurrentMonth ? "text-[#222]" : "text-[#d1d5db]",
                            isSelected
                              ? "bg-[#3b82f6] text-white"
                              : "hover:bg-[#eef4ff]",
                          ].join(" ")}
                          onClick={() => {
                            if (!isCurrentMonth) return;

                            if (!isSelected) {
                              addDate(dateString);
                            } else {
                              removeDate(dateString);
                            }
                          }}
                        >
                          {day}
                        </div>
                      );
                    }),
                  )}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="outlined"
              className="!mb-6 !w-full"
              onClick={() => setShowDatesModal(true)}
            >
              登録済み日程を見る
            </Button>
          </>
        )}

        <div className="mb-6">
          <div className="mb-2 text-left text-[18px] font-bold text-[#222]">
            メモ（任意）
          </div>

          <TextField
            fullWidth
            multiline
            rows={4}
            variant="outlined"
            placeholder="メモを入力"
            name="note"
            value={draftSchedule.note || ""}
            onChange={onChange}
          />
        </div>

        <div className="flex flex-col gap-3">
          <Button
            type="submit"
            variant="contained"
            className="w-full"
            startIcon={<SendIcon />}
            disabled={disabled}
          >
            完了
          </Button>
        </div>

        {showDatesModal && (
          <ScheduleDatesModal
            dates={draftSchedule.dates}
            onClose={() => setShowDatesModal(false)}
            onChange={(newDates) => {
              onChange({
                target: {
                  name: "dates",
                  value: newDates,
                },
              });
            }}
          />
        )}
      </form>
    </>
  );
}
