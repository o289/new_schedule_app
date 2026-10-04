import { describe, expect, it } from "vitest";

import { buildDailyEmailMessage } from "./template";

describe("daily email template", () => {
  it("builds escaped HTML and plain text without notes or URLs", () => {
    const message = buildDailyEmailMessage({
      recipient: { email: "safe@example.com", name: "確認用" },
      localDate: "2026-10-04",
      idempotencyKey: "user-1:2026-10-04",
      events: [
        {
          title: "<script>alert('x')</script>",
          categoryName: "仕事 & 生活",
          startDate: "2026-10-04T09:00:00",
          endDate: "2026-10-04T17:30:00",
        },
      ],
    });

    expect(message.subject).toContain("2026年10月4日");
    expect(message.htmlContent).toContain("&lt;script&gt;");
    expect(message.htmlContent).not.toContain("<script>");
    expect(message.htmlContent).not.toContain("http");
    expect(message.textContent).toContain("09:00–17:30");
    expect(message.textContent).toContain("<script>alert('x')</script>");
  });

  it("labels cross-day and full-day events explicitly", () => {
    const message = buildDailyEmailMessage({
      recipient: { email: "safe@example.com" },
      localDate: "2026-10-04",
      idempotencyKey: "user-1:2026-10-04",
      events: [
        {
          title: "日跨ぎ",
          categoryName: "仕事",
          startDate: "2026-10-03T23:30:00",
          endDate: "2026-10-04T01:00:00",
        },
        {
          title: "終日",
          categoryName: "予定",
          startDate: "2026-10-04 00:00:00",
          endDate: "2026-10-05 00:00:00",
        },
      ],
    });

    expect(message.textContent).toContain("2026-10-03 23:30–01:00");
    expect(message.textContent).toContain("終日");
  });
});
