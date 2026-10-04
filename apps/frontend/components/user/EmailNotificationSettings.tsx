import { Button, CircularProgress } from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  EmailNotificationSettings as Settings,
  EmailNotificationWeekdayRule,
} from "#schemas/email-notification";
import { useAlert } from "#frontend/context/AlertContext";
import { emailNotificationApi } from "#frontend/lib/api";
import { getApiErrorCode } from "#frontend/lib/apiError";
import { emailNotificationQueries } from "#frontend/lib/queryOptions";
import { emailNotificationKeys } from "#frontend/lib/queryKeys";

const weekdayLabels = [
  "月曜日",
  "火曜日",
  "水曜日",
  "木曜日",
  "金曜日",
  "土曜日",
  "日曜日",
];
const timeOptions = Array.from({ length: 48 }, (_, index) => {
  const hour = String(Math.floor(index / 2)).padStart(2, "0");
  return `${hour}:${index % 2 === 0 ? "00" : "30"}`;
});

function cloneSettings(settings: Settings): Settings {
  return {
    ...settings,
    weekdays: settings.weekdays.map((rule) => ({ ...rule })),
  };
}

export default function EmailNotificationSettings({
  onClose,
}: {
  onClose?: () => void;
}) {
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery(emailNotificationQueries.settings());
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settingsQuery.data && !dirty)
      setDraft(cloneSettings(settingsQuery.data));
  }, [dirty, settingsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: emailNotificationApi.updateSettings,
    onSuccess: (settings) => {
      queryClient.setQueryData(emailNotificationKeys.settings(), settings);
      setDraft(cloneSettings(settings));
      setDirty(false);
      setSaved(true);
      showAlert("UPDATE_SUCCESS");
    },
    onError: (error) => showAlert(getApiErrorCode(error)),
  });

  const weekdays = useMemo(
    () =>
      [...(draft?.weekdays ?? [])].sort(
        (left, right) => left.dayOfWeek - right.dayOfWeek,
      ),
    [draft?.weekdays],
  );

  if (settingsQuery.isPending) {
    return (
      <section
        aria-labelledby="email-notification-heading"
        className="mt-8 border-t border-[#e5e7eb] pt-6"
      >
        <h2
          id="email-notification-heading"
          className="text-base font-semibold text-[#111827]"
        >
          今日の予定メール
        </h2>
        <div
          className="mt-4 flex items-center gap-2 text-sm text-[#6b7280]"
          role="status"
        >
          <CircularProgress size={18} aria-label="読み込み中" />{" "}
          読み込んでいます…
        </div>
      </section>
    );
  }

  if (settingsQuery.isError || !draft) {
    return (
      <section
        aria-labelledby="email-notification-heading"
        className="mt-8 border-t border-[#e5e7eb] pt-6"
      >
        <h2
          id="email-notification-heading"
          className="text-base font-semibold text-[#111827]"
        >
          今日の予定メール
        </h2>
        <p className="mt-3 text-sm text-[#b42318]">
          設定を読み込めませんでした。再読み込みしてください。
        </p>
        <Button
          variant="outlined"
          onClick={() => void settingsQuery.refetch()}
          sx={{ marginTop: 2, borderRadius: "12px", textTransform: "none" }}
        >
          再読み込み
        </Button>
      </section>
    );
  }

  const updateRule = (
    dayOfWeek: number,
    change: Partial<EmailNotificationWeekdayRule>,
  ) => {
    setSaved(false);
    setDirty(true);
    setDraft((current) =>
      current
        ? {
            ...current,
            weekdays: current.weekdays.map((rule) =>
              rule.dayOfWeek === dayOfWeek ? { ...rule, ...change } : rule,
            ),
          }
        : current,
    );
  };

  return (
    <section
      aria-labelledby="email-notification-heading"
      className="mt-8 border-t border-[#e5e7eb] pt-6"
    >
      <div>
        {onClose && (
          <Button
            variant="text"
            onClick={onClose}
            sx={{ padding: 0, minWidth: 0, textTransform: "none" }}
          >
            カレンダーに戻る
          </Button>
        )}
        <h2
          id="email-notification-heading"
          className="text-base font-semibold text-[#111827]"
        >
          今日の予定メール
        </h2>
        <p className="mt-1 text-sm text-[#6b7280]">
          JSTの設定時刻に、当日の予定をメールでお知らせします。
        </p>
      </div>

      <label className="mt-5 flex items-start gap-3 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
        <input
          type="checkbox"
          disabled={updateMutation.isPending}
          checked={draft.globalEnabled}
          onChange={(event) => {
            setSaved(false);
            setDirty(true);
            setDraft({ ...draft, globalEnabled: event.target.checked });
          }}
          className="mt-1 h-4 w-4 accent-[#4a90e2]"
        />
        <span>
          <span className="block text-sm font-semibold text-[#374151]">
            通知を有効にする
          </span>
          <span className="mt-1 block text-xs text-[#6b7280]">
            全体をオフにすると曜日設定を残したまま通知を停止できます。
          </span>
        </span>
      </label>

      <fieldset className="mt-5" disabled={updateMutation.isPending}>
        <legend className="text-sm font-semibold text-[#374151]">
          曜日ごとの送信時刻
        </legend>
        <div className="mt-3 space-y-2">
          {weekdays.map((rule) => (
            <div
              key={rule.dayOfWeek}
              className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-[#e5e7eb] p-3 sm:grid-cols-[1fr_auto_auto]"
            >
              <label
                htmlFor={`email-day-${rule.dayOfWeek}`}
                className="text-sm text-[#374151]"
              >
                {weekdayLabels[rule.dayOfWeek - 1]}
              </label>
              <select
                id={`email-day-${rule.dayOfWeek}`}
                value={rule.deliveryTime}
                disabled={!rule.enabled}
                onChange={(event) =>
                  updateRule(rule.dayOfWeek, {
                    deliveryTime: event.target.value,
                  })
                }
                className="rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-sm"
              >
                {timeOptions.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <label className="col-span-2 flex items-center gap-2 text-xs text-[#6b7280] sm:col-span-1">
                <input
                  type="checkbox"
                  aria-label={`${weekdayLabels[rule.dayOfWeek - 1]}に送る`}
                  checked={rule.enabled}
                  onChange={(event) =>
                    updateRule(rule.dayOfWeek, {
                      enabled: event.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-[#4a90e2]"
                />
                この曜日に送る
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      {!draft.weekdays.some((rule) => rule.enabled) && (
        <p className="mt-3 text-xs text-[#6b7280]">
          送信する曜日が選択されていないため、メールを送信しません。
        </p>
      )}
      <div className="mt-5 flex items-center justify-end gap-3">
        {saved && (
          <span className="text-sm text-[#237a57]" role="status">
            保存しました
          </span>
        )}
        <Button
          variant="contained"
          onClick={() => updateMutation.mutate(draft)}
          disabled={updateMutation.isPending}
          sx={{
            borderRadius: "12px",
            backgroundColor: "#4a90e2",
            textTransform: "none",
          }}
        >
          {updateMutation.isPending ? "保存しています…" : "通知設定を保存"}
        </Button>
      </div>
    </section>
  );
}
