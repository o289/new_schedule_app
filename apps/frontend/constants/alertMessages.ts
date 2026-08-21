import type { ApiErrorCode } from "#contracts/api-error";

export type AlertType = "success" | "warning" | "error";

export interface AlertMessage {
  type: AlertType;
  message: string;
}

type SuccessAlertCode = "CREATE_SUCCESS" | "UPDATE_SUCCESS" | "DELETE_SUCCESS";

export const ALERT_MESSAGES = {
  // =========================
  // Success（成功）
  // =========================
  CREATE_SUCCESS: {
    type: "success",
    message: "作成しました",
  },
  UPDATE_SUCCESS: {
    type: "success",
    message: "更新しました",
  },
  DELETE_SUCCESS: {
    type: "success",
    message: "削除しました",
  },

  // =========================
  // Warning（想定内エラー）
  // =========================
  VALIDATION_ERROR: {
    type: "warning",
    message: "入力内容に誤りがあります",
  },
  //　スケジュール
  INVALID_TIME: {
    type: "warning",
    message: "開始日時と終了日時を確認してください",
  },
  SCHEDULE_TIME_OVERLAP: {
    type: "warning",
    message: "ほかの予定と時間が重なっています",
  },
  NOT_FOUND_SCHEDULE: {
    type: "warning",
    message: "指定された予定が見つかりませんでした",
  },
  // カテゴリー
  NOT_FOUND_CATEGORY: {
    type: "warning",
    message: "指定されたカテゴリが見つかりませんでした",
  },
  CATEGORY_HAS_SCHEDULES: {
    type: "warning",
    message: "このカテゴリーにはスケジュールが存在します",
  },
  // ToDo
  NOT_FOUND_TODO: {
    type: "warning",
    message: "指定されたToDoが見つかりませんでした",
  },
  FORBIDDEN_SCHEDULE: {
    type: "warning",
    message: "ToDoを追加するスケジュールがありません",
  },
  ALREADY_GROUP_MEMBER: {
    type: "warning",
    message: "すでにこのグループに参加しています",
  },
  INVALID_DATE_RANGE: {
    type: "warning",
    message: "表示期間を確認してください",
  },
  OWNER_CANNOT_LEAVE: {
    type: "warning",
    message: "オーナーはグループを退出できません",
  },
  CANNOT_REMOVE_OWNER: {
    type: "warning",
    message: "オーナーを追放することはできません",
  },
  CANNOT_REMOVE_SELF: {
    type: "warning",
    message: "自分自身を追放することはできません",
  },
  GROUP_OWNER_REQUIRED: {
    type: "warning",
    message: "この操作はグループオーナーのみ実行できます",
  },
  NOT_FOUND_GROUP: {
    type: "warning",
    message: "指定されたグループが見つかりませんでした",
  },
  NOT_FOUND_GROUP_MEMBER: {
    type: "warning",
    message: "指定されたグループメンバーが見つかりませんでした",
  },
  INVALID_JOIN_CODE: {
    type: "warning",
    message: "参加コードが正しくありません",
  },
  GROUP_MEMBER_LIMIT_REACHED: {
    type: "warning",
    message: "このグループは定員に達しています",
  },
  GROUP_REJOIN_FORBIDDEN: {
    type: "warning",
    message: "このグループには再参加できません",
  },
  // Auth
  EMAIL_ALREADY_EXISTS: {
    type: "warning",
    message: "このメールアドレスはすでに登録されています",
  },
  INVALID_CREDENTIALS: {
    type: "warning",
    message: "メールアドレスまたはパスワードが正しくありません",
  },

  INVALID_REFRESH_TOKEN: {
    type: "warning",
    message: "認証に失敗しました。再度ログインをしてください",
  },
  ALREADY_LOGGED_OUT: {
    type: "warning",
    message: "すでにログアウトされています",
  },
  AUTH_INVALID_CHALLENGE: {
    type: "warning",
    message: "パスキーの操作をやり直してください",
  },
  PASSKEY_ALREADY_REGISTERED: {
    type: "warning",
    message: "このパスキーはすでに登録されています",
  },
  PASSKEY_VERIFICATION_FAILED: {
    type: "warning",
    message: "パスキーの確認に失敗しました。もう一度お試しください",
  },
  PASSKEY_NOT_FOUND: {
    type: "warning",
    message: "このメールアドレスにはパスキーが登録されていません",
  },
  USER_NOT_FOUND: {
    type: "warning",
    message: "ユーザーが見つかりませんでした",
  },
  INVALID_REQUEST: {
    type: "warning",
    message: "リクエストの内容を確認してください",
  },
  INVALID_RESPONSE: {
    type: "error",
    message: "サーバーから正しい応答を受け取れませんでした",
  },
  HTTP_ERROR: {
    type: "warning",
    message: "認証に失敗しました。再度ログインをしてください",
  },

  // =========================
  // Error（想定外エラー）
  // =========================
  SERVER_ERROR: {
    type: "error",
    message:
      "サーバーエラーが発生しました。ご迷惑をおかけして大変申し訳ございませんでした",
  },
  INTERNAL_SERVER_ERROR: {
    type: "error",
    message:
      "サーバーエラーが発生しました。ご迷惑をおかけして大変申し訳ございませんでした",
  },
} satisfies Record<ApiErrorCode | SuccessAlertCode, AlertMessage>;

export type AlertCode = ApiErrorCode | SuccessAlertCode;
