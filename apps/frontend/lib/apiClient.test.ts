import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError } from "./apiError";
import { apiClient } from "./apiClient";

const groupId = "11111111-1111-4111-8111-111111111111";

describe("apiClient error details", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ALREADY_GROUP_MEMBER の検証済みgroupIdだけを保持する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "ALREADY_GROUP_MEMBER",
            data: { groupId },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    await expect(apiClient.public("/groups/join")).rejects.toMatchObject({
      code: "ALREADY_GROUP_MEMBER",
      status: 409,
      details: { groupId },
    } satisfies Partial<ApiClientError>);
  });

  it("未検証のerror dataは保持しない", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "ALREADY_GROUP_MEMBER",
            data: { groupId: "invalid" },
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );

    try {
      await apiClient.public("/groups/join");
      throw new Error("Expected ApiClientError");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiClientError);
      expect((error as ApiClientError).details).toBeUndefined();
    }
  });
});
