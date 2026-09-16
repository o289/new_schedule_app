import { describe, expect, it } from "vitest";
import { legacyFinalizeInputSchema } from "./legacy-import";

const evidence = { status: "NOT_REQUIRED" as const, reason: "not configured" };
const valid = {
  schemaVersion: 1 as const,
  runId: "agent-workflow-slim-v323-20260916-r3",
  verifiedSha: "a".repeat(40),
  quality: {
    node: "22.23.1" as const,
    pnpm: "11.20.0" as const,
    rules: "PASS" as const,
    typecheckFrontend: "PASS" as const,
    typecheckBackend: "PASS" as const,
    typecheckTools: "PASS" as const,
    verifyPhase: "PASS" as const,
    vitestPassed: 20,
    vitestSkipped: 0,
    vitestFailed: 0 as const,
    integration: evidence,
    e2e: evidence,
  },
  noSecretsOrDebug: true as const,
  noUnapprovedChanges: true as const,
  destructiveMigrationApproved: true as const,
};

describe("legacy finalize input contract", () => {
  it("accepts the complete success input", () =>
    expect(legacyFinalizeInputSchema.parse(valid)).toEqual(valid));
  it.each([
    ["schemaVersion", { schemaVersion: 2 }],
    ["runId", { runId: 42 }],
    ["verifiedSha", { verifiedSha: "bad" }],
    ["node", { quality: { ...valid.quality, node: "20.0.0" } }],
    ["pnpm", { quality: { ...valid.quality, pnpm: "1.0.0" } }],
    ["rules", { quality: { ...valid.quality, rules: "FAIL" } }],
    ["frontend", { quality: { ...valid.quality, typecheckFrontend: "FAIL" } }],
    ["backend", { quality: { ...valid.quality, typecheckBackend: "FAIL" } }],
    ["tools", { quality: { ...valid.quality, typecheckTools: "FAIL" } }],
    ["verify", { quality: { ...valid.quality, verifyPhase: "FAIL" } }],
    ["vitest failed", { quality: { ...valid.quality, vitestFailed: 1 } }],
    ["no secrets", { noSecretsOrDebug: false }],
    ["unapproved", { noUnapprovedChanges: false }],
    ["migration", { destructiveMigrationApproved: false }],
  ])("rejects %s", (_name, change) => {
    expect(() =>
      legacyFinalizeInputSchema.parse({ ...valid, ...change }),
    ).toThrow();
  });
  it("requires a reason for NOT_REQUIRED integration/e2e", () => {
    expect(() =>
      legacyFinalizeInputSchema.parse({
        ...valid,
        quality: { ...valid.quality, integration: { status: "NOT_REQUIRED" } },
      }),
    ).toThrow();
  });
  it("accepts PASS evidence shape", () => {
    const artifact = {
      path: ".agent-runs/run/evidence/integration.json",
      sha256: "b".repeat(64),
    };
    expect(
      legacyFinalizeInputSchema.parse({
        ...valid,
        quality: {
          ...valid.quality,
          integration: { status: "PASS", evidence: artifact },
        },
      }).quality.integration,
    ).toEqual({ status: "PASS", evidence: artifact });
  });
});
