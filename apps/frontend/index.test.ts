import { describe, expect, it } from "vitest";

import { queryClient } from "./lib/queryClient";
import {
  authKeys,
  categoryKeys,
  groupKeys,
  scheduleKeys,
} from "./lib/queryKeys";
import {
  authQueries,
  categoryQueries,
  groupQueries,
  scheduleQueries,
} from "./lib/queryOptions";

describe("TanStack Query基盤", () => {
  it("QueryClientの初期設定を固定する", () => {
    expect(queryClient.getDefaultOptions().queries).toMatchObject({
      staleTime: 30_000,
      retry: false,
      refetchOnWindowFocus: false,
    });
  });

  it("Query keyを一か所で生成する", () => {
    expect(authKeys.me()).toEqual(["auth", "me"]);
    expect(categoryKeys.lists()).toEqual(["categories", "list"]);
    expect(scheduleKeys.detail("schedule-id")).toEqual([
      "schedules",
      "detail",
      "schedule-id",
    ]);
  });

  it("予定・カテゴリー一覧のQuery定義を共通化する", () => {
    expect(scheduleQueries.list().queryKey).toEqual(scheduleKeys.lists());
    expect(categoryQueries.list().queryKey).toEqual(categoryKeys.lists());
  });

  it("グループ・認証のQuery定義を共通化する", () => {
    expect(groupQueries.list().queryKey).toEqual(groupKeys.lists());
    expect(groupQueries.detail("group-id").queryKey).toEqual(
      groupKeys.detail("group-id"),
    );
    expect(
      groupQueries.calendar("group-id", {
        startDate: "2026-08-28T00:00:00",
        endDate: "2026-08-29T00:00:00",
      }).queryKey,
    ).toEqual(
      groupKeys.calendar(
        "group-id",
        "2026-08-28T00:00:00",
        "2026-08-29T00:00:00",
      ),
    );
    expect(authQueries.me().queryKey).toEqual(authKeys.me());
  });
});

// docker compose -f compose.dev.yml exec application pnpm test
