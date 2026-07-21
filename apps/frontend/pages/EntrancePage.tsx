import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { UserResponse } from "../../../packages/schemas/user";

import { Box, Button, TextField } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

import { apiFetch } from "../hooks/client";
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
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <TextField
        fullWidth
        required
        type="email"
        name="email"
        id="email"
        label="メールアドレス"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button
        type="submit"
        disabled={isSubmitting}
        variant="contained"
        startIcon={<SendIcon />}
      >
        アプリの利用を開始
      </Button>
    </Box>
  );
}
