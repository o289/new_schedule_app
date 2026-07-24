// 本番・ステージングでは同一オリジンの application が API も配信する。
// 開発時だけ .env.dev の VITE_API_URL で別ポートの Hono を指定する。
const API_URL = import.meta.env.VITE_API_URL ?? "";

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

const INVALID_RESPONSE_CODE = "INVALID_RESPONSE";

function getErrorCode(data: unknown, fallback = "SERVER_ERROR"): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    typeof data.code === "string"
  ) {
    return data.code;
  }

  return fallback;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  // 204は本文を返さない正しい成功レスポンスである。
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("API response is not JSON");
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new Error("API response contains invalid JSON");
  }
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

  const res = await fetch(`${API_URL}${url}`, { ...options, headers });
  let data: T;

  try {
    data = await parseJsonResponse<T>(res);
  } catch {
    const code = INVALID_RESPONSE_CODE;
    if (!silentCodes.includes(code)) {
      showAlert?.(code);
    }
    throw { code };
  }

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

        let retryData: T;
        try {
          retryData = await parseJsonResponse<T>(retryRes);
        } catch {
          const code = INVALID_RESPONSE_CODE;
          if (!silentCodes.includes(code)) {
            showAlert?.(code);
          }
          throw { code };
        }

        if (retryRes.ok) {
          return retryData;
        }
      } else {
        const code = getErrorCode(data, "INVALID_REFRESH_TOKEN");
        clearSession?.();
        if (!silentCodes.includes(code)) {
          showAlert?.(code);
        }
        throw { code };
      }
    }

    // 上記以外のエラーは code のみで扱う
    const code = getErrorCode(data);
    if (!silentCodes.includes(code)) {
      showAlert?.(code);
    }
    throw { code };
  }

  return data;
}
