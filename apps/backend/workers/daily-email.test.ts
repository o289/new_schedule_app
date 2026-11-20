import { describe, expect, it, vi } from "vitest";

import {
  EmailProviderError,
  FakeEmailProvider,
} from "../features/email-notification/provider";
import { runDailyEmailOnce } from "./daily-email";

function repositoryStub(overrides: Record<string, unknown> = {}) {
  return {
    getDueCandidates: vi.fn(async () => [
      {
        userId: "user-1",
        email: "person@example.com",
        name: "Person",
        deliveryTime: "09:00",
      },
    ]),
    getByUser: vi.fn(async () => ({
      globalEnabled: true,
      timezone: "Asia/Tokyo",
      weekdays: Array.from({ length: 7 }, (_, index) => ({
        dayOfWeek: index + 1,
        enabled: index === 2,
        deliveryTime: "09:00",
      })),
    })),
    claim: vi.fn(async () => true),
    hasActiveSession: vi.fn(async () => true),
    getEventsForDate: vi.fn(async () => [
      {
        title: "朝の予定",
        categoryName: "仕事",
        startDate: "2026-09-15T23:30:00",
        endDate: "2026-09-16T10:00:00",
      },
    ]),
    markSent: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    releaseClaim: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("daily email worker", () => {
  it("claims a due JST rule and sends overlapping same-day events", async () => {
    const repository = repositoryStub();
    const provider = new FakeEmailProvider();

    const summary = await runDailyEmailOnce({
      repository: repository as never,
      provider,
      now: () => new Date("2026-09-16T00:05:00.000Z"),
    });

    expect(summary).toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0 });
    expect(provider.messages[0]).toMatchObject({
      to: [{ email: "person@example.com" }],
      subject: "2026年9月16日（水）の予定",
    });
    expect(repository.markSent).toHaveBeenCalledWith(
      "user-1",
      "2026-09-16",
      "fake-1",
      expect.any(Date),
    );
  });

  it("does not call the provider when no events exist", async () => {
    const repository = repositoryStub({
      getEventsForDate: vi.fn(async () => []),
    });
    const provider = new FakeEmailProvider();

    const summary = await runDailyEmailOnce({
      repository: repository as never,
      provider,
      now: () => new Date("2026-09-16T00:05:00.000Z"),
    });

    expect(summary).toEqual({ claimed: 1, sent: 0, skipped: 1, failed: 0 });
    expect(provider.messages).toHaveLength(0);
    expect(repository.markSent).toHaveBeenCalledWith(
      "user-1",
      "2026-09-16",
      null,
      expect.any(Date),
    );
  });

  it("releases the claim when the last active session disappeared", async () => {
    const repository = repositoryStub({
      hasActiveSession: vi.fn(async () => false),
    });
    const provider = new FakeEmailProvider();

    const summary = await runDailyEmailOnce({
      repository: repository as never,
      provider,
      now: () => new Date("2026-09-16T00:05:00.000Z"),
    });

    expect(summary).toEqual({ claimed: 1, sent: 0, skipped: 1, failed: 0 });
    expect(provider.messages).toHaveLength(0);
    expect(repository.releaseClaim).toHaveBeenCalledWith(
      "user-1",
      "2026-09-16",
    );
  });

  it("releases the claim when settings were opted out after candidate selection", async () => {
    const repository = repositoryStub({
      getByUser: vi.fn(async () => ({
        globalEnabled: false,
        timezone: "Asia/Tokyo",
        weekdays: [],
      })),
    });
    const provider = new FakeEmailProvider();

    const summary = await runDailyEmailOnce({
      repository: repository as never,
      provider,
      now: () => new Date("2026-09-16T00:05:00.000Z"),
    });

    expect(summary).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(provider.messages).toHaveLength(0);
    expect(repository.releaseClaim).toHaveBeenCalled();
  });

  it("does no work when there are no enabled weekday candidates", async () => {
    const repository = repositoryStub({
      getDueCandidates: vi.fn(async () => []),
    });

    const summary = await runDailyEmailOnce({
      repository: repository as never,
      provider: new FakeEmailProvider(),
      now: () => new Date("2026-09-16T00:05:00.000Z"),
    });

    expect(summary).toEqual({ claimed: 0, sent: 0, skipped: 0, failed: 0 });
  });

  it.each([
    ["2026-09-15T15:05:00.000Z", "00:00"],
    ["2026-09-16T14:35:00.000Z", "23:30"],
  ])("handles the 30-minute due boundary at %s", async (iso, deliveryTime) => {
    const repository = repositoryStub({
      getDueCandidates: vi.fn(async () => [
        {
          userId: "user-1",
          email: "person@example.com",
          name: "Person",
          deliveryTime,
        },
      ]),
      getByUser: vi.fn(async () => ({
        globalEnabled: true,
        timezone: "Asia/Tokyo",
        weekdays: Array.from({ length: 7 }, (_, index) => ({
          dayOfWeek: index + 1,
          enabled: index === 2,
          deliveryTime,
        })),
      })),
    });

    await runDailyEmailOnce({
      repository: repository as never,
      provider: new FakeEmailProvider(),
      now: () => new Date(iso),
    });

    expect(repository.claim).toHaveBeenCalledTimes(1);
  });

  it.each([
    "temporary",
    "rate_limited",
    "quota",
    "permanent",
    "unknown",
  ] as const)("records %s provider failure", async (kind) => {
    const repository = repositoryStub();
    const provider = {
      send: vi.fn(async () => {
        throw new EmailProviderError(kind);
      }),
    };

    await runDailyEmailOnce({
      repository: repository as never,
      provider,
      now: () => new Date("2026-09-16T00:05:00.000Z"),
    });

    expect(repository.markFailed).toHaveBeenCalledWith(
      "user-1",
      "2026-09-16",
      expect.any(Date),
      kind,
    );
  });

  it("releases a claim after a database failure before calling the provider", async () => {
    const repository = repositoryStub({
      getEventsForDate: vi.fn(async () => {
        throw new Error("database failure with sensitive details");
      }),
    });
    const provider = new FakeEmailProvider();
    const logs: string[] = [];

    const summary = await runDailyEmailOnce({
      repository: repository as never,
      provider,
      log: (message) => logs.push(message),
      now: () => new Date("2026-09-16T00:05:00.000Z"),
    });

    expect(summary).toEqual({ claimed: 1, sent: 0, skipped: 0, failed: 1 });
    expect(provider.messages).toHaveLength(0);
    expect(repository.releaseClaim).toHaveBeenCalledWith(
      "user-1",
      "2026-09-16",
    );
    expect(logs).toEqual([
      "daily email preparation failed before provider call",
    ]);
    expect(logs.join(" ")).not.toContain("sensitive details");
  });

  it("keeps an unknown provider result failed without retry eligibility", async () => {
    const repository = repositoryStub();
    const provider = {
      send: vi.fn(async () => {
        throw new EmailProviderError("unknown");
      }),
    };

    const summary = await runDailyEmailOnce({
      repository: repository as never,
      provider,
      now: () => new Date("2026-09-16T00:05:00.000Z"),
    });

    expect(summary.failed).toBe(1);
    expect(repository.releaseClaim).not.toHaveBeenCalled();
    expect(repository.markFailed).toHaveBeenCalledWith(
      "user-1",
      "2026-09-16",
      expect.any(Date),
      "unknown",
    );
  });
});
