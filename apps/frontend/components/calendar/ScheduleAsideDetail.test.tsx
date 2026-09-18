import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ScheduleResponse } from "#frontend/types/schedule";
import ScheduleAsideDetail from "./ScheduleAsideDetail";

const schedule: ScheduleResponse = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "改行テスト",
  note: "1行目\n2行目",
  url: null,
  categoryId: "22222222-2222-4222-8222-222222222222",
  isTentative: false,
  category: { name: "テスト", color: "blue", icon: "tag" },
  dates: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      startDate: "2026-09-18T10:00:00",
      endDate: "2026-09-18T11:00:00",
    },
  ],
};

describe("ScheduleAsideDetail", () => {
  it("メモの改行を保持する表示スタイルを適用する", () => {
    const markup = renderToStaticMarkup(
      <ScheduleAsideDetail
        schedule={schedule}
        handleScheduleDelete={vi.fn()}
        setAsideMode={vi.fn()}
        selectedScheduleDateId={schedule.dates[0]?.id ?? null}
      />,
    );

    expect(markup).toContain('class="whitespace-pre-wrap break-words"');
    expect(markup).toContain("1行目\n2行目");
  });
});
