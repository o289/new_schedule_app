import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";

export function createE2EName(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function formatLocalDate(offsetDays = 0): string {
  const date = localDate(offsetDays);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function localDate(offsetDays: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date;
}

async function moveScheduleMonthForDate(
  page: Page,
  offsetDays: number,
): Promise<void> {
  const today = localDate(0);
  const target = localDate(offsetDays);
  const monthDelta =
    (target.getFullYear() - today.getFullYear()) * 12 +
    target.getMonth() -
    today.getMonth();

  for (let index = 0; index < Math.abs(monthDelta); index += 1) {
    await page
      .getByRole("button", {
        name: monthDelta > 0 ? "次の月を表示" : "前の月を表示",
      })
      .click();
  }
}

export async function openCategoryManagement(page: Page): Promise<void> {
  await page.getByRole("button", { name: "カテゴリーを管理" }).click();
  await expect(
    page.getByRole("heading", { name: "カテゴリ作成" }),
  ).toBeVisible();
}

export async function createCategory(
  page: Page,
  category: { name: string; color: string; icon: string },
): Promise<void> {
  await openCategoryManagement(page);
  await page.getByLabel("カテゴリ名").fill(category.name);
  await page.getByLabel("カテゴリの色").selectOption(category.color);
  await page.getByLabel("カテゴリのアイコン").selectOption(category.icon);
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.getByText(category.name, { exact: true })).toBeVisible();
}

export async function returnToCalendarAside(page: Page): Promise<void> {
  await page.getByRole("button", { name: "戻る" }).click();
  await expect(
    page.getByRole("button", { name: "スケジュール登録" }),
  ).toBeVisible();
}

export async function openScheduleForm(page: Page): Promise<void> {
  await page.getByRole("button", { name: "スケジュール登録" }).click();
  await expect(page.getByLabel("予定タイトル")).toBeVisible();
}

export async function selectMuiOption(
  page: Page,
  label: string,
  optionName: string,
): Promise<void> {
  await page.getByLabel(label).click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

export async function fillScheduleForm(
  page: Page,
  schedule: {
    title: string;
    note: string;
    categoryName: string;
    start: string;
    end: string;
    dateOffsets: number[];
    tentative?: boolean;
  },
): Promise<void> {
  await page.getByLabel("予定タイトル").fill(schedule.title);
  await selectMuiOption(page, "カテゴリーを選択", schedule.categoryName);
  await selectMuiOption(page, "開始時刻", schedule.start);
  await selectMuiOption(page, "終了時刻", schedule.end);

  for (const offset of schedule.dateOffsets) {
    await moveScheduleMonthForDate(page, offset);
    await page
      .getByRole("button", {
        name: `${formatLocalDate(offset)}の日程を選択`,
      })
      .click();
  }

  if (schedule.tentative) {
    await page.getByRole("switch", { name: "本登録" }).check();
  }

  await page.getByLabel("予定メモ").fill(schedule.note);
}
