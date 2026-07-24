import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./client";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("JSONレスポンスを返す", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ id: "1" })),
    );

    await expect(apiFetch<{ id: string }>("/resource")).resolves.toEqual({
      id: "1",
    });
  });

  it("JSONではない成功レスポンスを正常値として扱わない", async () => {
    const showAlert = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>error</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    await expect(apiFetch("/resource", {}, { showAlert })).rejects.toEqual({
      code: "INVALID_RESPONSE",
    });
    expect(showAlert).toHaveBeenCalledWith("INVALID_RESPONSE");
  });

  it("壊れたJSONを正常値として扱わない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(apiFetch("/resource")).rejects.toEqual({
      code: "INVALID_RESPONSE",
    });
  });

  it("204 No Contentは本文なしの成功として扱う", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(apiFetch<void>("/resource")).resolves.toBeUndefined();
  });
});
