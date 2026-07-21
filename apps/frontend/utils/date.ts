/*
利用方法:
formatDatePart(isoString, "datetime") // 年月日時分を返す（デフォルト）
formatDatePart(isoString, "date")     // 年月日を返す
formatDatePart(isoString, "time")     // 時分のみを返す
*/
export function getLocalDateTimeParts(value: string): {
  date: string;
  time: string;
} {
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16),
  };
}

export function formatDateTime(
  isoString: string,
  mode: "date" | "time" | "datetime" = "datetime",
): string {
  const { date, time } = getLocalDateTimeParts(isoString);
  const [year = "", month = "", day = ""] = date.split("-");

  switch (mode) {
    case "date":
      return `${Number(year)}年${Number(month)}月${Number(day)}日`;
    case "time":
      return time;
    case "datetime":
      return `${Number(year)}年${Number(month)}月${Number(day)}日 ${time}`;
    default:
      throw new Error(`Invalid mode: ${mode}`);
  }
}

/*
--- 日付補助関数 ---
SafariでtoISOString()を使うとUTCに変換されてしまい、
<input type="datetime-local"> にセットできなくなる。
そこで、手動で「YYYY-MM-DDTHH:mm」形式の文字列を作る。

重複処理をまとめた共通関数
→ どんなDateオブジェクトでも安全にローカル時刻フォーマットできる
*/

export function formatLocalDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getNowDateTime() {
  // 現在時刻をローカルフォーマットで返す
  const now = new Date();
  return formatLocalDateTime(now);
}

export function getNowPlusOneHour() {
  // 現在時刻＋1時間をローカルフォーマットで返す
  const now = new Date();
  now.setHours(now.getHours() + 1);
  return formatLocalDateTime(now);
}

/*
====================================================
API用ヘルパー（非破壊追加）
----------------------------------------------------
目的:
- 表示用フォーマット（formatDateTime）をAPI送信に使わないための安全な経路を提供する
- 既存関数の役割は一切変更しない

ルール:
- API送信・保存時は「必ず」このセクションの関数のみを使用する
- formatDateTime は表示専用（人間向け）としてのみ使用する
====================================================
*/

/**
 * API専用: ISO datetime から ISO date (YYYY-MM-DD) を取り出す
 * @param {string} isoDatetime - 例: "2026-01-09T07:30:00"
 * @returns {string} - "2026-01-09"
 */
export function toISODate(isoDatetime: string): string {
  // 先頭10文字を使うことで、表示用ロケール変換を一切通さない
  return isoDatetime.slice(0, 10);
}

/**
 * API専用: ISO date + time(HH:mm) から ISO datetime を組み立てる
 * @param {string} isoDate - "YYYY-MM-DD"
 * @param {string} time - "HH:mm"
 * @returns {string} - "YYYY-MM-DDTHH:mm:00"
 */
export function toISODatetime(isoDate: string, time: string): string {
  return `${isoDate}T${time}:00`;
}

/*
----------------------------------------------------
使い方例（コメントアウト／参考）
----------------------------------------------------

// 【DatesModal 初期化時】
// 表示は formatDateTime、内部データは ISO を保持
// import { toISODate, formatDateTime } from "@/utils/date";
//
// const isoDate = toISODate(d.start_date);     // "2026-01-09"
// const start = formatDateTime(d.start_date, "time"); // "07:30"
// const end   = formatDateTime(d.end_date, "time");   // "08:30"

// 【保存時（親コンポーネント）】
// import { toISODatetime } from "@/utils/date";
//
// const payload = {
//   dates: formData.dates.map(d => ({
//     start_date: toISODatetime(d.date, d.start),
//     end_date:   toISODatetime(d.date, d.end),
//   })),
// };
*/
