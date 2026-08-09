import { isApiErrorCode, type ApiErrorCode } from "#contracts/api-error";
import { ApiClientError } from "./apiError";
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  refreshAccessToken,
} from "./sessionManager";

const apiUrl = import.meta.env.VITE_API_URL ?? "";

function errorCode(data: unknown, fallback: ApiErrorCode = "SERVER_ERROR") {
  if (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    isApiErrorCode(data.code)
  ) {
    return data.code;
  }
  return fallback;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;

  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new ApiClientError("INVALID_RESPONSE", response.status);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiClientError("INVALID_RESPONSE", response.status);
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  accessToken?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  const data = await parseResponse<T>(response);
  if (!response.ok) {
    throw new ApiClientError(errorCode(data), response.status);
  }
  return data;
}

async function refresh(refreshToken: string) {
  const response = await request<{ data: { access_token: string } }>(
    "/auth/refresh",
    {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    },
  );
  return response.data.access_token;
}

export const apiClient = {
  public: <T>(path: string, options?: RequestInit) => request<T>(path, options),
  authenticated: async <T>(path: string, options?: RequestInit) => {
    try {
      return await request<T>(path, options, getAccessToken());
    } catch (error) {
      if (!(error instanceof ApiClientError) || error.status !== 401) {
        throw error;
      }

      if (!getRefreshToken()) {
        clearSession();
        throw error;
      }

      const accessToken = await refreshAccessToken(refresh);
      return request<T>(path, options, accessToken);
    }
  },
};
