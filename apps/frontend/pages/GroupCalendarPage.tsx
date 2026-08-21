import { useEffect, useState } from "react";
import { Alert, Button, CircularProgress } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";

import GroupCalendar from "#frontend/components/groups/GroupCalendar";
import {
  getInitialGroupCalendarRange,
  type GroupCalendarRange,
} from "../components/groups/groupCalendarView";
import { useGroupCalendar } from "../components/groups/useGroupCalendar";

export default function GroupCalendarPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const [range, setRange] = useState<GroupCalendarRange>(
    getInitialGroupCalendarRange,
  );
  const [hasLoadedCalendar, setHasLoadedCalendar] = useState(false);
  const calendarQuery = useGroupCalendar(groupId ?? "", range);

  useEffect(() => {
    if (calendarQuery.state === "success") setHasLoadedCalendar(true);
  }, [calendarQuery.state]);

  if (!groupId) return null;

  const isInitialLoading =
    !hasLoadedCalendar && calendarQuery.state === "loading";
  const isInitialError = !hasLoadedCalendar && calendarQuery.state === "error";

  return (
    <main className="min-h-screen bg-[#f7f9fc] px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-[1440px]">
        <button
          type="button"
          onClick={() => navigate(`/groups/${groupId}`)}
          className="text-sm font-medium text-[#5f6b7a] hover:text-[#111827]"
        >
          ← グループ詳細に戻る
        </button>
        <h1 className="mt-3 text-3xl font-bold text-[#111827]">
          グループカレンダー
        </h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          メンバーの予定あり時間を週単位で確認できます。
        </p>

        {isInitialLoading && (
          <div className="flex justify-center py-20">
            <CircularProgress aria-label="グループカレンダーを読み込み中" />
          </div>
        )}

        {isInitialError && (
          <div className="mt-8 rounded-2xl bg-white p-8 text-center shadow-sm">
            <p className="text-sm text-[#4b5563]">
              グループカレンダーを取得できませんでした。
            </p>
            <Button
              className="!mt-4"
              variant="contained"
              onClick={() => calendarQuery.refetch()}
            >
              再試行
            </Button>
          </div>
        )}

        {!isInitialLoading && !isInitialError && (
          <div className="mt-8">
            {calendarQuery.state === "refreshing" && (
              <Alert severity="info" className="!mb-4">
                最新の予定を確認しています。
              </Alert>
            )}
            {calendarQuery.state === "stale" && (
              <Alert
                severity="warning"
                action={
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => calendarQuery.refetch()}
                  >
                    再試行
                  </Button>
                }
                className="!mb-4"
              >
                {range.startDate.slice(0, 10)}〜{range.endDate.slice(0, 10)}
                の最新情報を取得できませんでした。表示中の予定は更新前の情報です。
              </Alert>
            )}
            {calendarQuery.state === "loading" && (
              <Alert severity="info" className="!mb-4">
                表示する週の予定を読み込み中です。
              </Alert>
            )}
            <GroupCalendar
              segments={calendarQuery.dailyBusySegments}
              initialDate={range.startDate}
              onRangeChange={setRange}
            />
          </div>
        )}
      </section>
    </main>
  );
}
