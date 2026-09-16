import { describe, expect, it } from "vitest";
import {
  canonicalStates,
  isCanonicalTransition,
  mapLegacyState,
} from "./canonical-state";

describe("canonical run state", () => {
  it("defines exactly nine states", () => {
    expect(canonicalStates).toEqual([
      "DRAFT",
      "APPROVED",
      "READY",
      "RUNNING",
      "VERIFYING",
      "COMPLETED",
      "REPLAN",
      "FAILED",
      "SAFETY_STOP",
    ]);
  });
  it.each([
    "PREPARED",
    "PLAN_APPROVED",
    "WORKTREE_READY",
    "PHASE_RUNNING",
    "REWORK",
    "CHECKPOINTED",
    "VERIFYING",
    "PHASE_PASSED",
    "PUBLISH_READY",
    "REPLAN_REQUIRED",
    "INFRA_FAIL",
    "SAFETY_VIOLATION",
    "QUARANTINED",
    "ROLLBACK",
    "DISCARD",
  ])("maps legacy state %s", (state) => {
    expect(mapLegacyState(state)).toBeTypeOf("string");
  });
  it("allows the normal loop and rejects terminal progress", () => {
    expect(isCanonicalTransition("DRAFT", "APPROVED")).toBe(true);
    expect(isCanonicalTransition("APPROVED", "READY")).toBe(true);
    expect(isCanonicalTransition("READY", "RUNNING")).toBe(true);
    expect(isCanonicalTransition("RUNNING", "VERIFYING")).toBe(true);
    expect(isCanonicalTransition("VERIFYING", "RUNNING")).toBe(true);
    expect(isCanonicalTransition("VERIFYING", "COMPLETED")).toBe(true);
    expect(isCanonicalTransition("COMPLETED", "RUNNING")).toBe(false);
    expect(isCanonicalTransition("REPLAN", "READY")).toBe(false);
    expect(isCanonicalTransition("FAILED", "RUNNING")).toBe(false);
    expect(isCanonicalTransition("SAFETY_STOP", "RUNNING")).toBe(false);
  });
});
