import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { apiFetch } from "../hooks/client";
import { useAlert } from "./AlertContext";
import type { UserResponse } from "../../../packages/schemas/user";

interface RefreshResponse {
  data?: {
    access_token?: string;
  };
}

interface AuthContextValue {
  user: UserResponse | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  handleLogout: () => Promise<void>;
  handleRefresh: (tokenOverride?: string | null) => Promise<string | false>;
  setAccessToken: Dispatch<SetStateAction<string | null>>;
  setRefreshToken: Dispatch<SetStateAction<string | null>>;
  setUser: Dispatch<SetStateAction<UserResponse | null>>;
  clearSession: () => void;
  authFetch: <T>(
    url: string,
    options?: RequestInit,
    fetchOptions?: { silentCodes?: string[] },
  ) => Promise<T>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { showAlert } = useAlert();

  const refreshPromiseRef = useRef<Promise<string | false> | null>(null);
  const authFetch = <T,>(
    url: string,
    options: RequestInit = {},
    fetchOptions = {},
  ) => {
    return apiFetch<T>(url, options, {
      accessToken,
      refreshToken,
      showAlert,
      clearSession,
      ...fetchOptions,
    });
  };

  // セッションをクリアにする
  const clearSession = () => {
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  };

  // ログアウト
  const handleLogout = async () => {
    if (refreshToken) {
      await apiFetch(
        "/auth/logout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
        { showAlert },
      );
    }
    clearSession();
  };

  // リフレッシュ
  const handleRefresh = async (
    tokenOverride: string | null = null,
  ): Promise<string | false> => {
    const token = tokenOverride || refreshToken;
    if (!token) return false;

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = (async () => {
      try {
        const res = await apiFetch<RefreshResponse>(
          "/auth/refresh",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: token }),
          },
          { showAlert },
        );

        if (res?.data?.access_token) {
          const newToken = res.data.access_token;

          setAccessToken(newToken);
          localStorage.setItem("accessToken", newToken);

          return newToken;
        }

        return false;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    return refreshPromiseRef.current;
  };

  // 初期化: localStorageから復元
  useEffect(() => {
    const savedRefresh = localStorage.getItem("refreshToken");

    const initAuth = async () => {
      try {
        if (savedRefresh) {
          const newToken = await handleRefresh(savedRefresh);

          if (newToken) {
            setAccessToken(newToken);
            setRefreshToken(savedRefresh);

            const me = await apiFetch<UserResponse>(
              "/auth/me",
              { method: "GET" },
              { accessToken: newToken, showAlert },
            );

            setUser(me);
          }
        }
      } catch {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        refreshToken,
        isLoading,
        handleLogout,
        handleRefresh,
        setAccessToken,
        setRefreshToken,
        setUser,
        clearSession,
        authFetch,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// 呼び出し
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
