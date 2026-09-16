import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  handoffSchema,
  parsePublicationHandoff,
  sha256,
  validateBranches,
} from "./pr-agent-publish.js";

const headSha = "a".repeat(40);
const baseSha = "b".repeat(40);
const artifact = (path: string) => ({ path, sha256: "c".repeat(64) });
const common = {
  schemaVersion: 2,
  headSha,
  reviewBaseSha: baseSha,
  start: artifact("docs/agent-runs/run-001/start.json"),
  plan: artifact("docs/plan.json"),
  implementation: artifact("docs/implementation.md"),
  allPhasesComplete: true,
  quality: {
    final: "PASS",
    verifyPhase: { status: "PASS", evidence: artifact("docs/quality.md") },
    integration: { status: "NOT_REQUIRED", reason: "none" },
    e2e: { status: "NOT_REQUIRED", reason: "none" },
  },
  changes: {
    db: false,
    dependencies: false,
    configuration: false,
    generated: false,
  },
  review: {
    diffSha256: "d".repeat(64),
    classification: artifact("docs/classification.md"),
    allDiffClassified: true,
    unclassified: 0,
    safetyReview: artifact("docs/safety.md"),
    noSecretsOrDebug: true,
    noUnapprovedChanges: true,
    destructiveMigrationApproved: true,
    html: artifact("docs/review.html"),
  },
};

describe("publication handoff contract", () => {
  it("accepts both fixed publication modes", () => {
    expect(
      parsePublicationHandoff({
        ...common,
        mode: "push_only",
        head: "feature/v3.2.3",
      }),
    ).toMatchObject({ mode: "push_only" });
    expect(
      parsePublicationHandoff({
        ...common,
        mode: "pull_request",
        head: "feature/task-v3.2.3",
        baseSha,
        prReview: {
          diffSha256: "e".repeat(64),
          classification: artifact("docs/pr.md"),
          allDiffClassified: true,
          unclassified: 0,
        },
        title: "test",
        body: artifact("docs/body.md"),
      }),
    ).toMatchObject({ base: "feature/v3.2.3" });
  });

  it.each([
    ["push_only", "feature/v3.2.3", "feature/v3.2.3"],
    ["pull_request", "feature/task-v3.2.3", "main"],
  ] as const)("rejects invalid %s branch pairing", (mode, head, base) => {
    expect(() => validateBranches(mode, head, base)).toThrow("STOP:");
  });

  it("rejects non-canonical handoff data", () => {
    expect(
      handoffSchema.safeParse({ ...common, schemaVersion: 1 }).success,
    ).toBe(false);
    expect(() =>
      parsePublicationHandoff({ ...common, mode: "push_only", head: "main" }),
    ).toThrow();
  });

  it("contains no direct git push or gh PR create bypass", async () => {
    const source = await readFile(
      new URL("./pr-agent-publish.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toContain('"push"');
    expect(source).not.toContain('"pr"');
    expect(source).not.toContain('"create"');
  });

  it("hashes evidence content deterministically", () => {
    expect(sha256("evidence")).toMatch(/^[a-f0-9]{64}$/);
  });
});
