import { expect, test } from "./fixtures/auth";
import { categoryResponseSchema } from "#schemas/category";
import { scheduleResponseSchema } from "#schemas/schedule";
import { getE2EEnvironment } from "./environment";
import {
  createCategory,
  createE2EName,
  fillScheduleForm,
  formatLocalDate,
  openScheduleForm,
  returnToCalendarAside,
  selectMuiOption,
} from "./helpers/calendar";

test("予定を作成・更新・削除し、カレンダーと詳細へ反映する", async ({
  authenticatedPage: page,
}) => {
  const categoryName = createE2EName("schedule-category");
  const updatedCategoryName = `${categoryName}-更新`;
  const title = createE2EName("schedule");
  const updatedTitle = `${title}-更新`;
  const note = "作成時のメモ\n2行目";

  await createCategory(page, {
    name: categoryName,
    color: "orange",
    icon: "meeting",
  });
  await returnToCalendarAside(page);
  await openScheduleForm(page);
  await fillScheduleForm(page, {
    title,
    note,
    categoryName,
    start: "10:00",
    end: "11:00",
    dateOffsets: [0],
  });
  const allowOverwrite = page.getByRole("switch", {
    name: "上書きされることを許可",
  });
  await expect(allowOverwrite).not.toBeChecked();
  await allowOverwrite.check();
  await expect(page.getByText(/重なった日付だけが削除されます/)).toBeVisible();
  await page.getByRole("button", { name: "完了" }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "戻る" }).click();
  await page.getByRole("button", { name: "カテゴリーを管理" }).click();
  await page.getByRole("button", { name: `${categoryName}を編集` }).click();
  await page.getByLabel("カテゴリ名").fill(updatedCategoryName);
  await page.getByRole("button", { name: "更新", exact: true }).click();
  await returnToCalendarAside(page);

  await page.getByText(title, { exact: true }).click();
  const noteDetail = page.locator(".whitespace-pre-wrap", { hasText: note });
  await expect(noteDetail).toBeVisible();
  await expect(noteDetail).toHaveCSS("white-space", "pre-wrap");
  await expect
    .poll(() => noteDetail.evaluate((element) => element.textContent))
    .toBe(note);
  await expect(
    page.getByText(updatedCategoryName, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("10:00 - 11:00", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "編集" }).click();
  const editAllowOverwrite = page.getByRole("switch", {
    name: "上書きされることを許可",
  });
  await expect(editAllowOverwrite).toBeChecked();
  await editAllowOverwrite.uncheck();
  await page.getByLabel("予定タイトル").fill(updatedTitle);
  await page.getByLabel("予定メモ").fill("更新後のメモ");
  await selectMuiOption(page, "開始時刻", "11:00");
  await selectMuiOption(page, "終了時刻", "12:30");
  await page.getByRole("button", { name: "完了" }).click();
  await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "戻る" }).click();
  await page.getByText(updatedTitle, { exact: true }).click();
  await expect(page.getByText("更新後のメモ", { exact: true })).toBeVisible();
  await expect(page.getByText("11:00 - 12:30", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "キャンセル" }).click();
  await expect(
    page.getByRole("heading", { name: updatedTitle, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "削除" }).click();
  await page.getByRole("button", { name: "実行する" }).click();
  await expect(
    page.getByRole("heading", { name: updatedTitle, level: 1 }),
  ).toHaveCount(0);
  await expect(page.locator("a").filter({ hasText: updatedTitle })).toHaveCount(
    0,
  );
});

test("複数日程の仮押さえを日跨ぎで登録する", async ({
  authenticatedPage: page,
}) => {
  const categoryName = createE2EName("tentative-category");
  const title = createE2EName("tentative");

  await createCategory(page, {
    name: categoryName,
    color: "purple",
    icon: "event",
  });
  await returnToCalendarAside(page);
  await openScheduleForm(page);
  await fillScheduleForm(page, {
    title,
    note: "複数日程の仮押さえ",
    categoryName,
    start: "22:00",
    end: "01:00",
    dateOffsets: [0, 1],
    tentative: true,
  });

  await expect(
    page.getByText("終了時刻は選択日の翌日として登録されます。"),
  ).toBeVisible();
  await page.getByRole("button", { name: "登録済み日程を見る" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "登録済み日程", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "完了" }).click();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "戻る" }).click();
  await page.getByText(title, { exact: true }).first().click();
  await expect(page.getByLabel("仮押さえ・未確定の予定")).toBeVisible();
  await expect(page.getByText("他の日程", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "編集" }).click();
  const tentativeRadio = page.getByRole("radio", { name: "仮押さえ" });
  const confirmedRadio = page.getByRole("radio", { name: "本登録" });
  await expect(tentativeRadio).toBeChecked();
  await confirmedRadio.check();

  const updateResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/schedules/") &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "完了" }).click();
  const updateResponse = await updateResponsePromise;
  expect((await updateResponse.json()).isTentative).toBe(false);
});

test("後発予定の作成で既存予定の重複日程だけを置き換え画面へ反映する", async ({
  authenticatedPage: page,
}) => {
  const environment = getE2EEnvironment();
  const categoryName = createE2EName("overwrite-category");
  const existingTitle = createE2EName("overwrite-existing");
  const laterTitle = createE2EName("overwrite-later");
  const today = formatLocalDate(0);
  const todayDate = new Date();
  const nextDate = new Date(todayDate);
  nextDate.setDate(nextDate.getDate() + 1);
  const remainingDateOffset =
    nextDate.getMonth() === todayDate.getMonth() ? 1 : -1;
  const remainingDate = formatLocalDate(remainingDateOffset);

  await createCategory(page, {
    name: categoryName,
    color: "orange",
    icon: "meeting",
  });
  await returnToCalendarAside(page);

  const accessToken = await page.evaluate(() =>
    localStorage.getItem("accessToken"),
  );
  if (!accessToken) throw new Error("E2E access token is unavailable");
  const headers = { Authorization: `Bearer ${accessToken}` };

  const categoryResponse = await page.request.get(
    `${environment.apiUrl}/categories`,
    { headers },
  );
  expect(categoryResponse.status()).toBe(200);
  const categories = categoryResponseSchema
    .array()
    .parse(await categoryResponse.json());
  const category = categories.find((item) => item.name === categoryName);
  expect(category).toBeDefined();
  if (!category) throw new Error("E2E category was not created");

  const existingResponse = await page.request.post(
    `${environment.apiUrl}/schedules`,
    {
      headers,
      data: {
        title: existingTitle,
        categoryId: category.id,
        isTentative: false,
        allowOverwrite: true,
        dates: [
          {
            startDate: `${today}T10:00:00`,
            endDate: `${today}T11:00:00`,
          },
          {
            startDate: `${remainingDate}T12:00:00`,
            endDate: `${remainingDate}T13:00:00`,
          },
        ],
      },
    },
  );
  expect(existingResponse.status()).toBe(201);
  const existing = scheduleResponseSchema.parse(await existingResponse.json());
  expect(existing.allowOverwrite).toBe(true);
  expect(existing.dates).toHaveLength(2);

  // Load the API fixture before exercising the form. From this point onward,
  // the successful B creation must update the visible calendar without reload.
  await page.reload();
  await expect(page.getByText(existingTitle, { exact: true })).toHaveCount(2);
  await openScheduleForm(page);
  await fillScheduleForm(page, {
    title: laterTitle,
    note: "上書き後の予定",
    categoryName,
    start: "10:30",
    end: "11:30",
    dateOffsets: [0],
  });
  await expect(
    page.getByRole("switch", {
      name: "上書きされることを許可",
    }),
  ).not.toBeChecked();

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url() === `${environment.apiUrl}/schedules` &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "完了" }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  const later = scheduleResponseSchema.parse(await createResponse.json());
  expect(later.title).toBe(laterTitle);
  expect(later.allowOverwrite).toBe(false);

  await expect(page.getByText(laterTitle, { exact: true })).toBeVisible();
  await expect(page.getByText(existingTitle, { exact: true })).toHaveCount(1);

  const schedulesResponse = await page.request.get(
    `${environment.apiUrl}/schedules`,
    { headers },
  );
  expect(schedulesResponse.status()).toBe(200);
  const persistedSchedules = scheduleResponseSchema
    .array()
    .parse(await schedulesResponse.json());
  expect(
    persistedSchedules.find((schedule) => schedule.id === existing.id)?.dates,
  ).toEqual([
    expect.objectContaining({
      startDate: `${remainingDate}T12:00:00`,
      endDate: `${remainingDate}T13:00:00`,
    }),
  ]);
  expect(
    persistedSchedules.find((schedule) => schedule.id === later.id)?.dates,
  ).toEqual([
    expect.objectContaining({
      startDate: `${today}T10:30:00`,
      endDate: `${today}T11:30:00`,
    }),
  ]);
});
