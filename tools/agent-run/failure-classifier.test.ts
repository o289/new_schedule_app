import { describe, expect, it } from "vitest";
import { classifyFailure } from "./failure-classifier.js";

describe("failure classifier", () => {
  it.each([
    ["NOT_CONNECTED", "INFRA_FAIL"],
    ["TIMEOUT", "INFRA_FAIL"],
    ["PROTOCOL_MISMATCH", "INFRA_FAIL"],
    ["CONNECTION_ERROR", "INFRA_FAIL"],
  ] as const)("classifies runner infrastructure %s", (code, classification) => {
    expect(classifyFailure({ kind: "runner", code }).classification).toBe(
      classification,
    );
  });
  it("classifies nonzero runner as rework", () => {
    expect(
      classifyFailure({ kind: "runner", code: "NONZERO" }).classification,
    ).toBe("REWORK");
  });
  it.each(["TEST_FAILURE", "TYPE_FAILURE"] as const)(
    "classifies %s as rework",
    (code) => {
      expect(
        classifyFailure({ kind: "verification", code }).classification,
      ).toBe("REWORK");
    },
  );
  it.each(["CAPABILITY_UNAVAILABLE", "NOT_IMPLEMENTED"] as const)(
    "classifies %s as replan",
    (code) => {
      expect(classifyFailure({ kind: "policy", code }).classification).toBe(
        "REPLAN_REQUIRED",
      );
    },
  );
  it.each([
    "SECRET_DETECTED",
    "FORBIDDEN_DB_CONNECTION",
    "PATH_VIOLATION",
    "RUNNER_BYPASS",
  ] as const)("classifies %s as safety quarantine", (code) => {
    expect(classifyFailure({ kind: "policy", code })).toMatchObject({
      classification: "SAFETY_VIOLATION",
      revokeCapabilities: true,
      quarantine: true,
    });
  });
  it("does not expose raw error messages", () => {
    const result = classifyFailure({
      kind: "policy",
      code: "SECRET_DETECTED",
      message: "token=raw-secret",
    });
    expect(result.safeMessage).not.toContain("raw-secret");
  });
  it("rejects unknown and malformed classifications", () => {
    expect(() => classifyFailure({ kind: "other", code: "x" })).toThrow();
    expect(() =>
      classifyFailure({ kind: "runner", code: "SECRET_DETECTED" }),
    ).toThrow();
  });
  it("uses a discriminated typed result", () => {
    expect(
      classifyFailure({ kind: "policy", code: "RUNNER_BYPASS" }).reasonCode,
    ).toBe("RUNNER_BYPASS");
  });
});
