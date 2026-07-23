import { useAuth } from "../../context/AuthContext";

import { Button } from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";
import CloseIcon from "@mui/icons-material/Close";
import UndoIcon from "@mui/icons-material/Undo";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";

import MiniMonthNav from "./MiniMonthNav";
import ScheduleAsideForm from "./ScheduleAsideForm";
import ScheduleAsideDetail from "./ScheduleAsideDetail";
import CategoryAsidePage from "../categories/CategoryAsidePage";
import { getCategoryTheme } from "../../utils/getCategoryTheme";
import { useCalendar } from "../../context/CalendarContext";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { CategoryResponse } from "../../types/schedule";
import type { ScheduleForm } from "../../types/schedule";
import type { ScheduleChangeEvent } from "../schedules/useScheduleForm";

interface CalendarAsideProps {
  categories: CategoryResponse[];
  draftSchedule: ScheduleForm;
  resetForm: () => void;
  handleScheduleCreate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleScheduleUpdate: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  handleScheduleDelete: () => Promise<void>;
  handleChange: (event: ScheduleChangeEvent) => void;
  setIsDrawerOpen?: Dispatch<SetStateAction<boolean>>;
  closeButton?: () => void;
}

export default function CalendarAside({
  categories,
  draftSchedule,
  resetForm,
  handleScheduleCreate,
  handleScheduleUpdate,
  handleScheduleDelete,
  handleChange,
  setIsDrawerOpen,
  closeButton,
}: CalendarAsideProps) {
  const {
    selectedDate,
    setSelectedDate,
    selectedEvent,
    selectedSchedule,
    asideMode,
    setAsideMode,
    handleDaySelect,
    handleWeekSelect,
  } = useCalendar();

  const { user, handleLogout } = useAuth();
  const onLogout = () => {
    if (!window.confirm("ログアウトしますか？")) return;
    handleLogout();
  };

  function renderAsideContent() {
    switch (asideMode) {
      case "create":
        return (
          <ScheduleAsideForm
            mode="create"
            draftSchedule={draftSchedule}
            categories={categories}
            onChange={handleChange}
            onSubmit={handleScheduleCreate}
            onCancel={() => {
              setAsideMode(null);
              resetForm();
            }}
          />
        );
      case "edit":
        return (
          <ScheduleAsideForm
            mode="edit"
            draftSchedule={draftSchedule}
            categories={categories}
            onChange={handleChange}
            onSubmit={handleScheduleUpdate}
            onCancel={() => {
              setAsideMode(null);
            }}
          />
        );
      case "detail":
        if (!selectedSchedule) {
          return <>スケジュールを取得できませんでした。</>;
        }
        return (
          <ScheduleAsideDetail
            schedule={selectedSchedule}
            handleScheduleDelete={handleScheduleDelete}
            setAsideMode={setAsideMode}
            selectedEvent={selectedEvent}
            {...(setIsDrawerOpen ? { setIsDrawerOpen } : {})}
          />
        );
      case "category":
        return <CategoryAsidePage setAsideMode={setAsideMode} />;
      default:
        return (
          <>
            {closeButton && (
              <Button
                type="button"
                variant="text"
                startIcon={<CloseIcon sx={{ fontSize: 36 }} />}
                onClick={closeButton}
                sx={{
                  color: "#111827",
                  minWidth: "auto",
                  "&:hover": {
                    backgroundColor: "transparent",
                  },
                }}
                className="!text-xl !justify-start !p-0"
              >
                閉じる
              </Button>
            )}
            <div className="flex items-center gap-3 px-2">
              <CalendarMonthIcon
                sx={{
                  color: "#4a90e2",
                  fontSize: 34,
                }}
              />

              <h2 className="text-[28px] font-bold text-[#111827]">
                マイカレンダー
              </h2>
            </div>

            <div className="flex justify-center">
              <MiniMonthNav
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                onDayClick={(date: Date) => handleDaySelect(date)}
                onWeekClick={(date: Date) => handleWeekSelect(date)}
                {...(setIsDrawerOpen ? { setIsDrawerOpen } : {})}
              />
            </div>

            <div className="flex flex-col gap-3">
              <Button
                variant="contained"
                className="!rounded-lg !bg-[#4a90e2] !px-3 !py-2.5 !text-[14px]"
                startIcon={<AddIcon />}
                onClick={() => {
                  setAsideMode("create");
                  resetForm();
                  closeButton;
                }}
              >
                スケジュール登録
              </Button>

              <div className="mt-6 rounded-2xl border border-[#e5e7eb] bg-white shadow-sm overflow-hidden">
                <div className="flex items-center justify-between border-b border-[#e5e7eb] px-4 py-3">
                  <div className="text-left text-[18px] font-bold text-[#111827]">
                    カテゴリ
                  </div>

                  <button
                    type="button"
                    onClick={() => setAsideMode("category")}
                    className="text-sm font-medium text-[#6b7280] hover:text-[#111827]"
                  >
                    編集
                  </button>
                </div>

                {categories.map((category: CategoryResponse) => {
                  const theme = getCategoryTheme(category.color);
                  return (
                    <div
                      key={category.id}
                      className="flex items-center gap-3 border-b border-[#f3f4f6] px-4 py-4 last:border-b-0"
                    >
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: theme.border }}
                      />

                      <span className="text-[15px] text-[#374151]">
                        {category.name}
                      </span>
                    </div>
                  );
                })}
              </div>

              <Button
                variant="outlined"
                startIcon={<UndoIcon />}
                onClick={onLogout}
                className="!mt-2 !h-14 !w-full !justify-start !rounded-xl !border-[#e5e7eb] !bg-white !px-5 !text-[#374151] shadow-sm"
              >
                ログアウト
              </Button>

              <div className="mt-4 flex items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f3f4f6] text-xl text-[#9ca3af]">
                    👤
                  </div>

                  <div className="text-left">
                    <div className="text-sm font-semibold text-[#111827]">
                      ユーザー名
                    </div>
                    <div className="text-xs break-all text-[#6b7280]">
                      {user?.email ?? ""}
                    </div>
                  </div>
                </div>

                <span className="text-[#6b7280]">⌄</span>
              </div>
            </div>
          </>
        );
    }
  }

  return (
    <aside className="flex h-full w-full flex-col gap-6 border-r border-[#eee] bg-[#fafafa] p-4 max-md:w-full max-md:border-r-0">
      {renderAsideContent()}
    </aside>
  );
}
