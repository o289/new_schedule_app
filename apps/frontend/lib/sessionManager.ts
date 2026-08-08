import { queryClient } from "./queryClient";

let accessToken: string | null = localStorage.getItem("accessToken");
let refreshToken: string | null = localStorage.getItem("refreshToken");
let refreshPromise: Promise<string> | null = null;

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function saveTokens(tokens: {
  accessToken: string;
  refreshToken: string;
}) {
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  localStorage.setItem("accessToken", tokens.accessToken);
  localStorage.setItem("refreshToken", tokens.refreshToken);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

export function clearSession() {
  clearTokens();
  queryClient.clear();
}

export function refreshAccessToken(
  requestRefresh: (refreshToken: string) => Promise<string>,
) {
  if (!refreshToken) {
    return Promise.reject(new Error("Refresh token is unavailable"));
  }

  if (!refreshPromise) {
    refreshPromise = requestRefresh(refreshToken)
      .then((newAccessToken) => {
        accessToken = newAccessToken;
        localStorage.setItem("accessToken", newAccessToken);
        return newAccessToken;
      })
      .catch((error: unknown) => {
        // Keep the active auth query alive so React Query can publish the error.
        clearTokens();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}
