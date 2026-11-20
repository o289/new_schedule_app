import { queryClient } from "./queryClient";

let accessToken: string | null = localStorage.getItem("accessToken");
let refreshToken: string | null = localStorage.getItem("refreshToken");
let refreshPromise: Promise<string> | null = null;
let sessionGeneration = 0;
let nextRefreshAttemptId = 1;
const sessionListeners = new Set<() => void>();
const refreshExpiryListeners = new Set<
  (event: { attemptId: number; sessionGeneration: number }) => void
>();
const refreshFailures = new WeakMap<
  Error,
  { attemptId: number; sessionGeneration: number; isExpired: boolean }
>();
let pendingRefreshExpiry: {
  attemptId: number;
  sessionGeneration: number;
} | null = null;

export class StaleRefreshError extends Error {
  constructor() {
    super("Refresh result belongs to an inactive session");
    this.name = "StaleRefreshError";
  }
}

function notifySessionListeners() {
  sessionListeners.forEach((listener) => listener());
}

export function subscribeToSession(listener: () => void) {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function subscribeToRefreshExpiry(
  listener: (event: { attemptId: number; sessionGeneration: number }) => void,
) {
  refreshExpiryListeners.add(listener);
  if (pendingRefreshExpiry) {
    const event = pendingRefreshExpiry;
    pendingRefreshExpiry = null;
    listener(event);
  }
  return () => {
    refreshExpiryListeners.delete(listener);
  };
}

export function hasStoredSession() {
  return Boolean(accessToken || refreshToken);
}

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function getSessionGeneration() {
  return sessionGeneration;
}

export function saveTokens(tokens: {
  accessToken: string;
  refreshToken: string;
}) {
  sessionGeneration += 1;
  refreshPromise = null;
  pendingRefreshExpiry = null;
  accessToken = tokens.accessToken;
  refreshToken = tokens.refreshToken;
  localStorage.setItem("accessToken", tokens.accessToken);
  localStorage.setItem("refreshToken", tokens.refreshToken);
  notifySessionListeners();
}

export function clearTokens() {
  sessionGeneration += 1;
  refreshPromise = null;
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  notifySessionListeners();
}

export function clearSession() {
  clearTokens();
  queryClient.clear();
}

export function beginSessionTermination() {
  sessionGeneration += 1;
  refreshPromise = null;
  pendingRefreshExpiry = null;
  return sessionGeneration;
}

export function beginLogoutRequest() {
  const capturedRefreshToken = refreshToken;
  const generation = beginSessionTermination();
  return { generation, refreshToken: capturedRefreshToken };
}

export function isSessionGenerationCurrent(generation: number) {
  return sessionGeneration === generation;
}

export function clearSessionIfGeneration(expectedGeneration: number) {
  if (sessionGeneration !== expectedGeneration) return false;
  clearSession();
  return true;
}

export function handleRefreshFailure(error: unknown) {
  if (!(error instanceof Error)) return false;
  const failure = refreshFailures.get(error);
  if (!failure) return false;
  refreshFailures.delete(error);
  if (failure.sessionGeneration !== sessionGeneration) return false;

  clearSession();
  if (failure.isExpired) {
    pendingRefreshExpiry = {
      attemptId: failure.attemptId,
      sessionGeneration: failure.sessionGeneration,
    };
    if (refreshExpiryListeners.size > 0) {
      const event = pendingRefreshExpiry;
      pendingRefreshExpiry = null;
      refreshExpiryListeners.forEach((listener) => listener(event));
    }
  }
  return true;
}

export function refreshAccessToken(
  requestRefresh: (
    refreshToken: string,
  ) => Promise<{ accessToken: string; refreshToken: string }>,
) {
  if (!refreshToken) {
    return Promise.reject(new Error("Refresh token is unavailable"));
  }

  if (!refreshPromise) {
    const requestGeneration = sessionGeneration;
    const attemptId = nextRefreshAttemptId++;
    let trackedRefresh: Promise<string>;
    trackedRefresh = requestRefresh(refreshToken)
      .then((tokens) => {
        if (requestGeneration !== sessionGeneration) {
          throw new StaleRefreshError();
        }
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
        localStorage.setItem("accessToken", tokens.accessToken);
        localStorage.setItem("refreshToken", tokens.refreshToken);
        notifySessionListeners();
        return tokens.accessToken;
      })
      .catch((error: unknown) => {
        if (requestGeneration !== sessionGeneration) {
          throw new StaleRefreshError();
        }
        const refreshError =
          error instanceof Error
            ? error
            : new Error("Refresh request failed", { cause: error });
        refreshFailures.set(refreshError, {
          attemptId,
          sessionGeneration: requestGeneration,
          isExpired:
            "code" in refreshError &&
            refreshError.code === "REFRESH_TOKEN_EXPIRED",
        });
        throw refreshError;
      })
      .finally(() => {
        if (refreshPromise === trackedRefresh) refreshPromise = null;
      });
    refreshPromise = trackedRefresh;
  }

  return refreshPromise;
}
