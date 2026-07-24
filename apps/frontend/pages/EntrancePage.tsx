import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { UserResponse } from "../../../packages/schemas/user";

import { Button, TextField } from "@mui/material";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import LockRoundedIcon from "@mui/icons-material/LockRounded";

import { apiFetch } from "../hooks/client";
import entranceCalendarHero from "../assets/entrance-calendar-hero.png";
import {
  startRegistration,
  startAuthentication,
} from "../utils/webauthn/webauthn";
import type {
  AuthenticationOptions,
  RegistrationOptions,
} from "../utils/webauthn/webauthn";
import {
  formatRegistrationCredential,
  formatAuthenticationCredential,
} from "../utils/webauthn/credentialFormatter";
import { useAuth } from "../context/AuthContext";

export default function EntrancePage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { setAccessToken, setRefreshToken, setUser } = useAuth();
  const navigate = useNavigate();

  const executeLoginFlow = async (email: string) => {
    const loginOptionsRes = await apiFetch<{
      data: { publicKey: AuthenticationOptions };
    }>(
      "/auth/passkey/login/options",
      {
        method: "POST",
        body: JSON.stringify({ email }),
      },
      null,
      { silentCodes: ["PASSKEY_NOT_FOUND"] },
    );

    const loginPublicKey = loginOptionsRes.data.publicKey;

    const authenticationCredential = await startAuthentication(loginPublicKey);

    const formattedAuthentication = formatAuthenticationCredential(
      authenticationCredential,
    );

    const verifyRes = await apiFetch<{
      data: { access_token: string; refresh_token: string };
    }>("/auth/passkey/login/verify", {
      method: "POST",
      body: JSON.stringify(formattedAuthentication),
    });

    const { access_token, refresh_token } = verifyRes.data;

    setAccessToken(access_token);
    setRefreshToken(refresh_token);
    localStorage.setItem("accessToken", access_token);
    localStorage.setItem("refreshToken", refresh_token);

    const meRes = await apiFetch<UserResponse>(
      "/auth/me",
      { method: "GET" },
      {
        accessToken: access_token,
        refreshToken: refresh_token,
      },
    );

    setUser(meRes);
    navigate("/dashboard");
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email) return;

    setIsSubmitting(true);

    try {
      // 1. Try login first
      try {
        await executeLoginFlow(email);
        return;
      } catch (loginError: unknown) {
        if (
          typeof loginError !== "object" ||
          loginError === null ||
          !("code" in loginError) ||
          loginError.code !== "PASSKEY_NOT_FOUND"
        ) {
          throw loginError;
        }
      }

      // 2. If no passkey found, proceed with registration
      const registerOptionsRes = await apiFetch<{
        data: { publicKey: RegistrationOptions };
      }>("/auth/passkey/register/options", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      const registerPublicKey = registerOptionsRes.data.publicKey;

      const registrationCredential = await startRegistration(registerPublicKey);

      const formattedRegistration = formatRegistrationCredential(
        registrationCredential,
      );

      await apiFetch("/auth/passkey/register/verify", {
        method: "POST",
        body: JSON.stringify(formattedRegistration),
      });

      // After successful registration, login
      await executeLoginFlow(email);
    } catch (error: unknown) {
      throw error;
    } finally {
      setIsSubmitting(false);
    }
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

              <Button
                fullWidth
                type="submit"
                disabled={isSubmitting}
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
                {isSubmitting ? "確認しています…" : "アプリの利用を開始"}
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
