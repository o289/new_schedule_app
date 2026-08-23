import { Button, MenuItem, Select } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { Add as AddIcon } from "@mui/icons-material";
import CloseIcon from "@mui/icons-material/Close";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";

import ScheduleAsideForm from "./ScheduleAsideForm";
import ScheduleAsideDetail from "./ScheduleAsideDetail";
import CategoryAsidePage from "../categories/CategoryAsidePage";
import { ProfileAvatar } from "../common/ProfileAvatar";
import { getCategoryTheme } from "#frontend/utils/getCategoryTheme";
import { getCategoryIcon } from "#frontend/constants/categoryIcons";
import {
  type CalendarSelection,
  useCalendar,
} from "#frontend/context/CalendarContext";
import { useSession } from "#frontend/hooks/useSession";
import type { GroupResponse } from "#schemas/group";
import { useGroupList } from "../groups/useGroupManagement";
import GroupManagementAside from "../groups/GroupManagementAside";
import GroupDetailAside from "../groups/GroupDetailAside";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import type {
  CategoryResponse,
  ScheduleForm,
  ScheduleResponse,
} from "#frontend/types/schedule";
import type { ScheduleChangeEvent } from "../schedules/useScheduleForm";
import type { useCategory } from "../categories/useCategory";

type CategoryController = Pick<
  ReturnType<typeof useCategory>,
  | "categories"
  | "form"
  | "editingId"
  | "handleChange"
  | "handleSubmit"
  | "handleEditClick"
  | "handleCancelEdit"
  | "handleDelete"
>;

function CalendarSelector({
  selectedCalendar,
  setSelectedCalendar,
  groups,
  onSelected,
}: {
  selectedCalendar: CalendarSelection;
  setSelectedCalendar: (selection: CalendarSelection) => void;
  groups: GroupResponse[] | undefined;
  onSelected: () => void;
}) {
  const selectedValue =
    selectedCalendar.kind === "group" &&
    groups?.some((group) => group.id === selectedCalendar.groupId)
      ? selectedCalendar.groupId
      : "personal";

  return (
    <div className="flex items-center gap-3 px-2">
      {selectedCalendar.kind === "personal" ? (
        <CalendarMonthIcon sx={{ color: "#4a90e2", fontSize: 34 }} />
      ) : (
        <GroupsRoundedIcon sx={{ color: "#7c3aed", fontSize: 34 }} />
      )}
      <Select
        aria-label="表示するカレンダー"
        value={selectedValue}
        onChange={(event) => {
          const value = event.target.value;
          setSelectedCalendar(
            value === "personal"
              ? { kind: "personal" }
              : { kind: "group", groupId: value },
          );
          onSelected();
        }}
        className="!min-w-0 !flex-1 !text-[24px] !font-bold !text-[#111827]"
      >
        <MenuItem value="personal">マイカレンダー</MenuItem>
        {groups?.map((group) => (
          <MenuItem key={group.id} value={group.id}>
            {group.name}
          </MenuItem>
        ))}
      </Select>
    </div>
  );
}

interface CalendarAsideProps {
  categories: CategoryResponse[];
  schedules: ScheduleResponse[];
  category: CategoryController;
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
  schedules,
  category,
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
    selectedScheduleDateId,
    selectedScheduleId,
    asideMode,
    setAsideMode,
    selectedCalendar,
    setSelectedCalendar,
  } = useCalendar();
  const { user } = useSession();
  const { listQuery } = useGroupList();
  const selectedSchedule =
    schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null;
  const navigate = useNavigate();

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
            selectedScheduleDateId={selectedScheduleDateId}
            {...(setIsDrawerOpen ? { setIsDrawerOpen } : {})}
          />
        );
      case "category":
        return (
          <CategoryAsidePage setAsideMode={setAsideMode} category={category} />
        );
      case "group-list":
        return (
          <>
            <CalendarSelector
              selectedCalendar={selectedCalendar}
              setSelectedCalendar={setSelectedCalendar}
              groups={listQuery.data}
              onSelected={() => setAsideMode(null)}
            />
            <GroupManagementAside />
          </>
        );
      case "group-detail":
        return (
          <>
            <CalendarSelector
              selectedCalendar={selectedCalendar}
              setSelectedCalendar={setSelectedCalendar}
              groups={listQuery.data}
              onSelected={() => setAsideMode(null)}
            />
            <GroupDetailAside />
          </>
        );
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
            <CalendarSelector
              selectedCalendar={selectedCalendar}
              setSelectedCalendar={setSelectedCalendar}
              groups={listQuery.data}
              onSelected={() => setAsideMode(null)}
            />

            <div className="flex flex-col gap-3">
              {selectedCalendar.kind === "personal" ? (
                <>
                  <Button
                    variant="contained"
                    className="!rounded-lg !bg-[#4a90e2] !px-3 !py-2.5 !text-[14px]"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      setAsideMode("create");
                      resetForm();
                    }}
                  >
                    スケジュール登録
                  </Button>

                  <div className="mt-6 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#e5e7eb] px-4 py-3">
                      <div className="text-left text-[18px] font-bold text-[#111827]">
                        カテゴリ
                      </div>

                      <button
                        type="button"
                        aria-label="カテゴリーを管理"
                        onClick={() => setAsideMode("category")}
                        className="text-sm font-medium text-[#6b7280] hover:text-[#111827]"
                      >
                        編集
                      </button>
                    </div>

                    {categories.map((category: CategoryResponse) => {
                      const theme = getCategoryTheme(category.color);
                      const Icon = getCategoryIcon(category.icon);
                      return (
                        <div
                          key={category.id}
                          className="flex items-center gap-3 border-b border-[#f3f4f6] px-4 py-4 last:border-b-0"
                        >
                          <Icon
                            aria-hidden="true"
                            sx={{ color: theme.border, fontSize: 20 }}
                          />

                          <span className="text-[15px] text-[#374151]">
                            {category.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <GroupDetailAside />
              )}

              <Button
                variant="outlined"
                startIcon={<GroupsRoundedIcon />}
                onClick={() => setAsideMode("group-list")}
                className="!mt-2 !h-14 !w-full !justify-start !rounded-xl !border-[#e5e7eb] !bg-white !px-5 !text-[#374151] shadow-sm"
              >
                グループ
              </Button>

              <button
                type="button"
                onClick={() => navigate("/setting")}
                className="mt-4 flex w-full items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-left shadow-sm transition-colors hover:bg-[#f9fafb]"
              >
                <div className="flex items-center gap-3">
                  <ProfileAvatar
                    name={user?.name ?? ""}
                    avatar={user?.avatar ?? null}
                    size={48}
                  />

                  <div className="text-left">
                    <div className="text-sm font-semibold text-[#111827]">
                      {user?.name ?? "ユーザー名"}
                    </div>
                  </div>
                </div>

                <span className="text-lg text-[#6b7280]">›</span>
              </button>
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
