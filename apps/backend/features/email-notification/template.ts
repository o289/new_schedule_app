import { createHash } from "node:crypto";

import { addDaysToISODate, getLocalDateTimeParts } from "#utils/local-datetime";

export type DailyEmailEvent = {
  title: string;
  categoryName: string;
  startDate: string;
  endDate: string;
};

export type DailyEmailInput = {
  recipient: { email: string; name?: string };
  localDate: string;
  events: DailyEmailEvent[];
  idempotencyKey: string;
};

export type EmailMessage = {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  textContent: string;
  idempotencyKey: string;
};

const weekdayNames = ["日", "月", "火", "水", "木", "金", "土"];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function toUuid(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function formatLocalDate(localDate: string): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const weekday = new Date(year!, month! - 1, day!).getDay();
  return `${year}年${month}月${day}日（${weekdayNames[weekday]}）`;
}

function formatEventTime(event: DailyEmailEvent, localDate: string): string {
  const startParts = getLocalDateTimeParts(event.startDate);
  const endParts = getLocalDateTimeParts(event.endDate);
  const nextDate = addDaysToISODate(localDate, 1);
  if (
    startParts.date === localDate &&
    startParts.time === "00:00" &&
    endParts.date === nextDate &&
    endParts.time === "00:00"
  ) {
    return "終日";
  }
  const label = (value: string, time: string): string => {
    const date = getLocalDateTimeParts(value).date;
    if (date === localDate) return time;
    return `${date} ${time}`;
  };
  return `${label(event.startDate, startParts.time)}–${label(event.endDate, endParts.time)}`;
}

export function buildDailyEmailMessage(input: DailyEmailInput): EmailMessage {
  const dateLabel = formatLocalDate(input.localDate);
  const subject = `${dateLabel}の予定`;
  const textEvents = input.events.map(
    (event) =>
      `${formatEventTime(event, input.localDate)} ${event.title}\nカテゴリー：${event.categoryName}`,
  );
  const textContent = [
    `${dateLabel}の予定`,
    "",
    ...textEvents,
    "",
    "予定の詳細はスケジュール管理アプリで確認できます。",
  ].join("\n");
  const htmlEvents = input.events
    .map(
      (
        event,
      ) => `<article style="border-left:4px solid #2563eb;padding:12px 16px;margin:12px 0;background:#f8fafc;">
  <div style="font-weight:700;color:#2563eb;">${escapeHtml(formatEventTime(event, input.localDate))}</div>
  <div style="font-weight:700;margin-top:4px;">${escapeHtml(event.title)}</div>
  <div style="color:#64748b;font-size:14px;margin-top:4px;">カテゴリー：${escapeHtml(event.categoryName)}</div>
</article>`,
    )
    .join("\n");
  const htmlContent = `<html><body style="font-family:Arial,'Hiragino Kaku Gothic ProN',sans-serif;color:#0f172a;line-height:1.5;">
<main style="max-width:560px;margin:0 auto;padding:24px 16px;">
  <h1 style="font-size:22px;margin:0 0 20px;">${escapeHtml(subject)}</h1>
  ${htmlEvents}
  <p style="color:#64748b;font-size:14px;margin-top:24px;">予定の詳細はスケジュール管理アプリで確認できます。</p>
</main></body></html>`;

  return {
    to: [input.recipient],
    subject,
    htmlContent,
    textContent,
    idempotencyKey: toUuid(input.idempotencyKey),
  };
}
