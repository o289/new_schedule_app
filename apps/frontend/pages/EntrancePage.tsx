import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";

import entranceCalendarHero from "../assets/entrance-calendar-hero.png";
import {
  startRegistration,
  startAuthentication,
} from "../utils/webauthn/webauthn";
import {
  formatRegistrationCredential,
  formatAuthenticationCredential,
} from "../utils/webauthn/credentialFormatter";
import { authApi } from "../lib/api";
import { getApiErrorCode, ApiClientError } from "../lib/apiError";
import { authKeys } from "../lib/queryKeys";
import { saveTokens } from "../lib/sessionManager";
import { useAlert } from "../context/AlertContext";
import { avatarKeySchema, type AvatarKey } from "#schemas/user";

type EntryResult = "authenticated" | "registration-required";

export default function EntrancePage({
  onAuthenticated,
}: {
  onAuthenticated?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<AvatarKey | "">("");
  const [isRegistration, setIsRegistration] = useState(false);
  const { showAlert } = useAlert();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const executeLoginFlow = async (email: string) => {
    const loginOptionsRes = await authApi.loginOptions(email);

    const loginPublicKey = loginOptionsRes.data.publicKey;

    const authenticationCredential = await startAuthentication(loginPublicKey);

    const formattedAuthentication = formatAuthenticationCredential(
      authenticationCredential,
    );

    const verifyRes = await authApi.loginVerify(formattedAuthentication);

    const { access_token, refresh_token } = verifyRes.data;

    queryClient.clear();
    saveTokens({ accessToken: access_token, refreshToken: refresh_token });

    const user = await authApi.me();
    queryClient.setQueryData(authKeys.me(), user);
  };

  const loginMutation = useMutation({
    mutationFn: async (): Promise<EntryResult> => {
      if (isRegistration) {
        const registerOptionsRes = await authApi.registerOptions({
          email,
          name,
          avatar: avatar || null,
        });
        const registrationCredential = await startRegistration(
          registerOptionsRes.data.publicKey,
        );
        await authApi.registerVerify(
          formatRegistrationCredential(registrationCredential),
        );
        await executeLoginFlow(email);
        return "authenticated";
      }

      try {
        await executeLoginFlow(email);
        return "authenticated";
      } catch (error) {
        if (
          error instanceof ApiClientError &&
          error.code === "PASSKEY_NOT_FOUND"
        ) {
          return "registration-required";
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      if (result === "registration-required") {
        setIsRegistration(true);
        return;
      }
      if (onAuthenticated) {
        onAuthenticated();
        return;
      }
      navigate("/dashboard");
    },
    onError: (error) => showAlert(getApiErrorCode(error)),
  });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email || (isRegistration && !name.trim())) return;

    await loginMutation.mutateAsync();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-left">
      <div
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#dcecff]/70 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-40 -bottom-48 h-[32rem] w-[32rem] rounded-full bg-[#e9f3ff] blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-screen max-w-[1280px] flex-col px-6 py-8 sm:px-10 lg:px-16">
        <header className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#4a90e2] text-white shadow-[0_8px_20px_rgba(74,144,226,0.24)]">
            <CalendarMonthRoundedIcon />
          </span>
          <span className="text-xl font-bold tracking-tight text-[#111827]">
            スケジュール管理
          </span>
        </header>

        <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <section className="mx-auto w-full max-w-[500px] lg:mx-0">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#dbeafe] bg-white/80 px-4 py-2 text-sm font-semibold text-[#3779c5] shadow-sm">
              <span className="h-2 w-2 rounded-full bg-[#4a90e2]" />
              パスワード不要ではじめられます
            </div>

            <h1 className="text-[clamp(2.5rem,5vw,4.5rem)] leading-[1.08] font-bold tracking-[-0.04em] text-[#111827]">
              毎日の予定を、
              <br />
              <span className="text-[#4a90e2]">もっとシンプルに。</span>
            </h1>

            <p className="mt-6 max-w-md text-base leading-8 text-[#5f6b7a] sm:text-lg">
              予定とカテゴリーをひとつのカレンダーで整理。
              今日やることも、これからの楽しみも、すっきり見渡せます。
            </p>

            <form
              onSubmit={handleSubmit}
              noValidate
              className="mt-9 rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_18px_50px_rgba(31,73,125,0.12)] backdrop-blur sm:p-7"
            >
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-[#374151]"
              >
                メールアドレス
              </label>
              <TextField
                fullWidth
                required
                type="email"
                name="email"
                id="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                slotProps={{
                  input: {
                    sx: {
                      borderRadius: "12px",
                      backgroundColor: "#f9fafb",
                    },
                  },
                }}
              />

              {isRegistration && (
                <>
                  <TextField
                    fullWidth
                    required
                    name="name"
                    id="name"
                    label="表示名"
                    placeholder="例: 山田 花子"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    sx={{ marginTop: 2 }}
                    slotProps={{
                      input: {
                        sx: {
                          borderRadius: "12px",
                          backgroundColor: "#f9fafb",
                        },
                      },
                    }}
                  />

                  <FormControl fullWidth sx={{ marginTop: 2 }}>
                    <InputLabel id="avatar-label">アバター</InputLabel>
                    <Select
                      labelId="avatar-label"
                      id="avatar"
                      label="アバター"
                      value={avatar}
                      onChange={(event) =>
                        setAvatar(event.target.value as AvatarKey | "")
                      }
                      sx={{ borderRadius: "12px", backgroundColor: "#f9fafb" }}
                    >
                      <MenuItem value="">選択しない</MenuItem>
                      {avatarKeySchema.options.map((avatarKey) => (
                        <MenuItem key={avatarKey} value={avatarKey}>
                          {avatarKey}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </>
              )}

              <Button
                fullWidth
                type="submit"
                disabled={loginMutation.isPending}
                variant="contained"
                endIcon={<ArrowForwardRoundedIcon />}
                sx={{
                  marginTop: 2,
                  minHeight: 52,
                  borderRadius: "12px",
                  backgroundColor: "#4a90e2",
                  fontSize: "1rem",
                  fontWeight: 700,
                  textTransform: "none",
                  boxShadow: "0 10px 24px rgba(74, 144, 226, 0.28)",
                }}
              >
                {loginMutation.isPending
                  ? "確認しています…"
                  : isRegistration
                    ? "登録して利用を開始"
                    : "アプリの利用を開始"}
              </Button>

              <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-[#7b8491]">
                <LockRoundedIcon sx={{ fontSize: 15 }} />
                端末のパスキーを使って安全にログインします
              </p>
            </form>
          </section>

          <section
            className="relative mx-auto w-full max-w-[680px]"
            aria-label="カレンダーで予定を整理するイメージ"
          >
            <div className="absolute inset-x-12 bottom-2 h-20 rounded-full bg-[#4a90e2]/15 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.25rem] border border-white/80 bg-white/50 p-3 shadow-[0_28px_80px_rgba(44,91,148,0.16)] backdrop-blur sm:p-5">
              <img
                src={entranceCalendarHero}
                alt="予定カードが並んだカレンダーと時計のイラスト"
                className="h-auto w-full rounded-[1.6rem]"
              />
            </div>
          </section>
        </div>

        <footer className="pb-2 text-center text-xs text-[#9aa3af] lg:text-left">
          予定を整えて、毎日にちょっとした余白を。
        </footer>
      </div>
    </main>
  );
}
