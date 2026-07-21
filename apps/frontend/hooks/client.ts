const API_URL = import.meta.env.VITE_API_URL;

interface AuthOptions {
  accessToken?: string | null;
  refreshToken?: string | null;
  handleRefresh?: () => Promise<string | false>;
  showAlert?: (code: string) => void;
  clearSession?: () => void;
}

interface FetchConfig {
  silentCodes?: string[];
}

interface ErrorResponse {
  code?: string;
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
  auth: AuthOptions | null = null,
  config: FetchConfig = {},
): Promise<T> {
  let accessToken: string | null | undefined;
  let refreshToken: string | null | undefined;
  let handleRefresh: (() => Promise<string | false>) | undefined;
  let showAlert: ((code: string) => void) | undefined;
  let clearSession: (() => void) | undefined;

  if (auth) {
    // authContext が渡された場合のみ分解
    ({ accessToken, refreshToken, handleRefresh, showAlert, clearSession } =
      auth);
  }

  const { silentCodes = [] } = config;

  const headers = {
    ...(options.headers as Record<string, string> | undefined),
    ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
    "Content-Type": "application/json",
  };

  let res = await fetch(`${API_URL}${url}`, { ...options, headers });
  const data: ErrorResponse = await res.json().catch(() => ({}));

  if (!res.ok) {
    // 401 特例: refresh → retry
    if (res.status === 401 && refreshToken && handleRefresh) {
      const refreshed = await handleRefresh();
      if (refreshed) {
        const retryHeaders = {
          ...(options.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${refreshed}`,
          "Content-Type": "application/json",
        };

        const retryRes = await fetch(`${API_URL}${url}`, {
          ...options,
          headers: retryHeaders,
        });

        if (retryRes.ok) {
          const retryData: T = await retryRes.json().catch(() => ({}) as T);
          return retryData;
        }
      } else {
        const code = data?.code || "INVALID_REFRESH_TOKEN";
        clearSession?.();
        if (!silentCodes.includes(code)) {
          showAlert?.(code);
        }
        throw { code };
      }
    }

    // 上記以外のエラーは code のみで扱う
    const code = data?.code || "SERVER_ERROR";
    if (!silentCodes.includes(code)) {
      showAlert?.(code);
    }
    throw { code };
  }

  return data as T;
}
