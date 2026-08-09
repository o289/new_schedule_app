import { describe, expect, it } from "vitest";

import { queryClient } from "./lib/queryClient";
import { authKeys, categoryKeys, scheduleKeys } from "./lib/queryKeys";

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
});

// docker compose -f compose.dev.yml exec application pnpm test
