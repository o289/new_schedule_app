// DateTimeCard.jsx
import { useState } from "react";

interface TimeGroupDate {
  id: string;
  date: string;
  isPast: boolean;
}
interface TimeGroup {
  start: string;
  end: string;
  dates: TimeGroupDate[];
}

export function DateTimeCard({ timeGroup }: { timeGroup: TimeGroup }) {
  /**
   * YYYY-MM-DD → 「M月D日」
   */
  function formatDate(isoDate: string) {
    const [, month = "", day = ""] = isoDate.split("-");
    return `${Number(month)}月${Number(day)}日`;
  }

  /**
   * dates の安全化
   */
  function normalizeDates(dates: TimeGroupDate[] | undefined): TimeGroupDate[] {
    return dates ?? [];
  }

  /**
   * 最大表示数を超えた場合の制御
   */
  function getVisibleDates(dates: TimeGroupDate[], max = 5) {
    return {
      visible: dates.slice(0, max),
      rest: Math.max(dates.length - max, 0),
    };
  }

  const dates = normalizeDates(timeGroup?.dates);
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl p-4 mb-4 shadow-md">
      {/* 時刻帯 */}
      <div className="mb-3">
        <div className="text-[13px] text-gray-600 flex items-center gap-1.5 mb-2">
          ⏰ 時刻帯
        </div>

        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-12 text-sm text-gray-700">開始</div>
          <span className="text-sm text-gray-900">{timeGroup.start}</span>
        </div>

        <div className="flex items-center gap-2 mb-1.5">
          <div className="w-12 text-sm text-gray-700">終了</div>
          <span className="text-sm text-gray-900">{timeGroup.end}</span>
        </div>
      </div>

      {/* 日付一覧 */}
      <div className="mb-3">
        <div className="text-[13px] text-gray-600 flex items-center gap-1.5 mb-2">
          📅 対象日
        </div>

        {dates.length > 0 ? (
          (() => {
            const { visible, rest } = getVisibleDates(dates);
            const shownDates = isExpanded ? dates : visible;

            return (
              <ul className="pl-[18px] m-0">
                {shownDates.map((d: TimeGroupDate) => (
                  <li
                    key={d.id}
                    className={
                      d.isPast
                        ? "text-sm mb-1 text-gray-400 opacity-60"
                        : "text-sm mb-1"
                    }
                  >
                    {formatDate(d.date)}
                  </li>
                ))}
                {!isExpanded && rest > 0 && (
                  <li
                    className="text-sm mb-1 cursor-pointer"
                    onClick={() => setIsExpanded(true)}
                  >
                    …その他 {rest} 件
                  </li>
                )}
              </ul>
            );
          })()
        ) : (
          <p>日程はまだ登録されていません。</p>
        )}
      </div>
    </div>
  );
}
