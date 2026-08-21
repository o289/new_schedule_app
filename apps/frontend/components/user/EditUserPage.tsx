import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Button, TextField } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { avatarKeySchema, type AvatarKey } from "#schemas/user";
import { useAlert } from "#frontend/context/AlertContext";
import { useSession } from "#frontend/hooks/useSession";
import { authApi } from "#frontend/lib/api";
import { getApiErrorCode } from "#frontend/lib/apiError";
import { authKeys } from "#frontend/lib/queryKeys";
import { ProfileAvatar } from "../common/ProfileAvatar";

const avatarLabels: Record<AvatarKey, string> = {
  sky: "スカイ",
  emerald: "エメラルド",
  amber: "アンバー",
  rose: "ローズ",
  violet: "バイオレット",
  slate: "スレート",
};

export default function EditUserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showAlert } = useAlert();
  const { user } = useSession();
  const [name, setName] = useState(user?.name ?? "");
  const [avatar, setAvatar] = useState<AvatarKey | null>(user?.avatar ?? null);

  const updateProfileMutation = useMutation({
    mutationFn: () => authApi.updateProfile({ name, avatar }),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(authKeys.me(), updatedUser);
      navigate("/dashboard");
    },
    onError: (error) => showAlert(getApiErrorCode(error)),
  });

  if (!user) return null;

  const handleSave = async () => {
    if (!name.trim()) return;
    await updateProfileMutation.mutateAsync();
  };

  return (
    <main className="min-h-screen bg-[#f7f9fc] px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto w-full max-w-xl rounded-3xl border border-white bg-white p-6 shadow-[0_18px_50px_rgba(31,73,125,0.12)] sm:p-8">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1 text-sm font-medium text-[#5f6b7a] hover:text-[#111827]"
        >
          <ArrowBackRoundedIcon fontSize="small" />
          カレンダーに戻る
        </button>

        <h1 className="mt-6 text-2xl font-bold text-[#111827]">
          プロフィールを編集
        </h1>
        <p className="mt-2 text-sm text-[#6b7280]">
          表示名とアバターを変更できます。
        </p>

        <div className="mt-8 flex flex-col items-center rounded-2xl bg-[#f7f9fc] p-6">
          <ProfileAvatar name={name} avatar={avatar} size={88} />
          <span className="mt-3 text-sm font-semibold text-[#374151]">
            {name || "表示名"}
          </span>
          <span className="mt-1 text-xs text-[#6b7280]">{user.email}</span>
        </div>

        <TextField
          fullWidth
          required
          label="表示名"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="name"
          sx={{ marginTop: 3 }}
          slotProps={{
            input: { sx: { borderRadius: "12px", backgroundColor: "#f9fafb" } },
          }}
        />

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold text-[#374151]">
            アバター
          </legend>
          <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
            <button
              type="button"
              aria-pressed={avatar === null}
              onClick={() => setAvatar(null)}
              className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium ${
                avatar === null
                  ? "border-[#4a90e2] bg-[#eff6ff] text-[#3779c5]"
                  : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
              }`}
            >
              <ProfileAvatar name={name} avatar={null} size={40} />
              選択しない
            </button>
            {avatarKeySchema.options.map((avatarKey) => (
              <button
                key={avatarKey}
                type="button"
                aria-pressed={avatar === avatarKey}
                onClick={() => setAvatar(avatarKey)}
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium ${
                  avatar === avatarKey
                    ? "border-[#4a90e2] bg-[#eff6ff] text-[#3779c5]"
                    : "border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]"
                }`}
              >
                <ProfileAvatar name={name} avatar={avatarKey} size={40} />
                {avatarLabels[avatarKey]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="outlined"
            onClick={() => navigate("/dashboard")}
            disabled={updateProfileMutation.isPending}
            sx={{ borderRadius: "12px", textTransform: "none" }}
          >
            キャンセル
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={updateProfileMutation.isPending || !name.trim()}
            sx={{
              borderRadius: "12px",
              backgroundColor: "#4a90e2",
              textTransform: "none",
            }}
          >
            {updateProfileMutation.isPending ? "保存しています…" : "保存する"}
          </Button>
        </div>
      </section>
    </main>
  );
}
