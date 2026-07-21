import { describe, expect, it } from "vitest";

describe("frontend", () => {
  it("string", () => {
    expect("hello").toContain("ell");
  });
});

// docker compose -f compose.dev.yml exec application pnpm test
