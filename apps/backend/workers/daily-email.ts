import { writeFile } from "node:fs/promises";

import { addDaysToISODate } from "#utils/local-datetime";
import type { EmailNotificationSettings } from "#schemas/email-notification";
import { EmailNotificationRepository } from "../features/email-notification/repository";
import { closeDatabase } from "../database/client";
import {
  EmailProviderError,
  createEmailProvider,
  type EmailProvider,
} from "../features/email-notification/provider";
import { buildDailyEmailMessage } from "../features/email-notification/template";

const JST = "Asia/Tokyo";
const POLL_INTERVAL_MS = 30_000;
const DUE_WINDOW_MINUTES = 30;
const MAX_ATTEMPTS = 3;

type JapanClock = {
  localDate: string;
  minutes: number;
  dayOfWeek: number;
};

function getJapanClock(now: Date): JapanClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);
  const values = new Map(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const weekday = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[
    values.get("weekday") ?? ""
  ];
  if (!weekday) throw new Error("Failed to determine JST weekday");
  const hour = Number(values.get("hour"));
  const minute = Number(values.get("minute"));
  return {
    localDate: `${values.get("year")}-${values.get("month")}-${values.get("day")}`,
    minutes: hour * 60 + minute,
    dayOfWeek: weekday,
  };
}

function isDue(deliveryTime: string, currentMinutes: number): boolean {
  const [hour, minute] = deliveryTime.split(":").map(Number);
  const scheduledMinutes = hour! * 60 + minute!;
  return (
    scheduledMinutes <= currentMinutes &&
    scheduledMinutes >= currentMinutes - DUE_WINDOW_MINUTES
  );
}

function errorKind(error: unknown): string {
  return error instanceof EmailProviderError ? error.kind : "unknown";
}

function isDispatchable(
  settings: EmailNotificationSettings,
  dayOfWeek: number,
  deliveryTime: string,
  currentMinutes: number,
): boolean {
  const rule = settings.weekdays.find(
    (weekday) => weekday.dayOfWeek === dayOfWeek,
  );
  return Boolean(
    settings.globalEnabled &&
    rule?.enabled &&
    rule.deliveryTime === deliveryTime &&
    isDue(rule.deliveryTime, currentMinutes),
  );
}

export type DailyEmailWorkerDependencies = {
  repository: EmailNotificationRepository;
  provider: EmailProvider;
  now?: () => Date;
  log?: (message: string) => void;
};

export async function runDailyEmailOnce(
  dependencies: DailyEmailWorkerDependencies,
): Promise<{ claimed: number; sent: number; skipped: number; failed: number }> {
  const now = dependencies.now?.() ?? new Date();
  const clock = getJapanClock(now);
  const candidates = await dependencies.repository.getDueCandidates(
    clock.dayOfWeek,
  );
  const summary = { claimed: 0, sent: 0, skipped: 0, failed: 0 };

  for (const candidate of candidates) {
    if (!isDue(candidate.deliveryTime, clock.minutes)) continue;

    const claimed = await dependencies.repository.claim(
      candidate.userId,
      clock.localDate,
      now,
      MAX_ATTEMPTS,
    );
    if (!claimed) continue;
    summary.claimed += 1;

    let message: ReturnType<typeof buildDailyEmailMessage>;
    let sendNow: Date;
    try {
      const settings = await dependencies.repository.getByUser(
        candidate.userId,
      );
      if (
        !isDispatchable(
          settings,
          clock.dayOfWeek,
          candidate.deliveryTime,
          clock.minutes,
        )
      ) {
        await dependencies.repository.releaseClaim(
          candidate.userId,
          clock.localDate,
        );
        summary.skipped += 1;
        continue;
      }

      if (
        !(await dependencies.repository.hasActiveSession(candidate.userId, now))
      ) {
        await dependencies.repository.releaseClaim(
          candidate.userId,
          clock.localDate,
        );
        summary.skipped += 1;
        continue;
      }

      const rangeEnd = addDaysToISODate(clock.localDate, 1);
      const events = await dependencies.repository.getEventsForDate(
        candidate.userId,
        `${clock.localDate}T00:00:00`,
        `${rangeEnd}T00:00:00`,
      );
      if (events.length === 0) {
        await dependencies.repository.markSent(
          candidate.userId,
          clock.localDate,
          null,
          now,
        );
        summary.skipped += 1;
        continue;
      }

      sendNow = dependencies.now?.() ?? new Date();
      const sendClock = getJapanClock(sendNow);
      const latestSettings = await dependencies.repository.getByUser(
        candidate.userId,
      );
      if (
        sendClock.localDate !== clock.localDate ||
        !isDispatchable(
          latestSettings,
          sendClock.dayOfWeek,
          candidate.deliveryTime,
          sendClock.minutes,
        ) ||
        !(await dependencies.repository.hasActiveSession(
          candidate.userId,
          sendNow,
        ))
      ) {
        await dependencies.repository.releaseClaim(
          candidate.userId,
          clock.localDate,
        );
        summary.skipped += 1;
        continue;
      }

      message = buildDailyEmailMessage({
        recipient: { email: candidate.email, name: candidate.name },
        localDate: clock.localDate,
        events,
        idempotencyKey: `${candidate.userId}:${clock.localDate}`,
      });
    } catch (error) {
      try {
        await dependencies.repository.releaseClaim(
          candidate.userId,
          clock.localDate,
        );
      } catch {
        dependencies.log?.(
          "daily email claim release failed; pending claim retained",
        );
      }
      dependencies.log?.("daily email preparation failed before provider call");
      summary.failed += 1;
      continue;
    }

    let providerMessageId: string | null;
    try {
      const result = await dependencies.provider.send(message);
      providerMessageId = result.providerMessageId;
    } catch (error) {
      await dependencies.repository.markFailed(
        candidate.userId,
        clock.localDate,
        sendNow,
        errorKind(error),
      );
      dependencies.log?.(`daily email delivery failed (${errorKind(error)})`);
      summary.failed += 1;
      continue;
    }

    await dependencies.repository.markSent(
      candidate.userId,
      clock.localDate,
      providerMessageId,
      sendNow,
    );
    summary.sent += 1;
  }

  return summary;
}

async function startWorker(): Promise<void> {
  const repository = new EmailNotificationRepository();
  const provider = createEmailProvider();
  const heartbeat =
    process.env.WORKER_HEARTBEAT_FILE ?? "/tmp/daily-email-worker.heartbeat";
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  process.once("SIGTERM", () => {
    stopping = true;
    if (timer) clearTimeout(timer);
  });
  const tick = async (): Promise<void> => {
    try {
      await runDailyEmailOnce({
        repository,
        provider,
        log: (message) => console.error(message),
      });
    } catch {
      console.error("daily email worker tick failed");
    } finally {
      try {
        await writeFile(heartbeat, new Date().toISOString());
      } catch {
        console.error("daily email worker heartbeat failed");
      }
      if (stopping) {
        await closeDatabase();
      } else {
        timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
      }
    }
  };
  await tick();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void startWorker().catch(() => {
    console.error("daily email worker failed to start");
    process.exitCode = 1;
  });
}
