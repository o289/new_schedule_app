import { describe, expect, it } from "vitest";
import {
  handoffSchema,
  parsePublicationHandoff,
  publish,
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
  start: artifact("ai/runs/run-001/start.json"),
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

  it("runs verification before fixed push and reuses a matching PR", async () => {
    const calls: string[] = [];
    const command = async (program: string, args: readonly string[]) => {
      calls.push(`${program} ${args.join(" ")}`);
      if (program === "git" && args[0] === "branch")
        return { stdout: "feature/task-v3.2.3\n", stderr: "" };
      if (program === "git" && args[0] === "rev-parse")
        return { stdout: "a".repeat(40), stderr: "" };
      if (program === "git" && args[0] === "remote")
        return {
          stdout: "https://github.com/o289/new_schedule_app.git\n",
          stderr: "",
        };
      if (program === "gh" && args[0] === "run")
        return {
          stdout: JSON.stringify([
            {
              conclusion: "success",
              url: "https://ci.example/run/1",
              headSha: "a".repeat(40),
            },
          ]),
          stderr: "",
        };
      if (program === "gh" && args[0] === "pr" && args[1] === "list")
        return {
          stdout: JSON.stringify([
            {
              url: "https://github.com/o289/new_schedule_app/pull/1",
              headRefName: "feature/task-v3.2.3",
              baseRefName: "feature/v3.2.3",
              headRefOid: "a".repeat(40),
              isDraft: false,
              state: "OPEN",
            },
          ]),
          stderr: "",
        };
      if (program === "gh" && args[0] === "pr" && args[1] === "view")
        return {
          stdout: JSON.stringify({
            url: "https://github.com/o289/new_schedule_app/pull/1",
            headRefName: "feature/task-v3.2.3",
            baseRefName: "feature/v3.2.3",
            headRefOid: "a".repeat(40),
            isDraft: false,
            state: "OPEN",
          }),
          stderr: "",
        };
      return { stdout: "", stderr: "" };
    };
    const result = await publish(command);
    expect(result).toMatchObject({
      mode: "pull_request",
      prUrl: "https://github.com/o289/new_schedule_app/pull/1",
    });
    expect(calls[0]).toBe("git branch --show-current");
    expect(calls).toContain(
      "docker compose -f compose.dev.yml run --rm application sh -c pnpm install --frozen-lockfile && pnpm verify:phase",
    );
    expect(calls).toContain("git push origin feature/task-v3.2.3");
    expect(
      calls.indexOf(
        "docker compose -f compose.dev.yml run --rm application sh -c pnpm install --frozen-lockfile && pnpm verify:phase",
      ),
    ).toBeLessThan(calls.indexOf("git push origin feature/task-v3.2.3"));
  });

  it("stops before push when Docker verification fails", async () => {
    const calls: string[] = [];
    const command = async (program: string, args: readonly string[]) => {
      calls.push(`${program} ${args.join(" ")}`);
      if (program === "git" && args[0] === "branch")
        return { stdout: "feature/v3.2.3\n", stderr: "" };
      if (program === "git" && args[0] === "rev-parse")
        return { stdout: "a".repeat(40), stderr: "" };
      if (program === "git" && args[0] === "remote")
        return {
          stdout: "https://github.com/o289/new_schedule_app.git\n",
          stderr: "",
        };
      if (program === "docker") throw new Error("Docker verification failed");
      return { stdout: "", stderr: "" };
    };
    await expect(publish(command)).rejects.toThrow(
      "Docker verification failed",
    );
    expect(calls.some((call) => call.startsWith("git push "))).toBe(false);
  });

  it("pushes a version branch without creating a PR", async () => {
    const calls: string[] = [];
    const command = async (program: string, args: readonly string[]) => {
      calls.push(`${program} ${args.join(" ")}`);
      if (program === "git" && args[0] === "branch")
        return { stdout: "feature/v3.2.3\n", stderr: "" };
      if (program === "git" && args[0] === "rev-parse")
        return { stdout: "a".repeat(40), stderr: "" };
      if (program === "git" && args[0] === "remote")
        return {
          stdout: "https://github.com/o289/new_schedule_app.git\n",
          stderr: "",
        };
      if (program === "gh" && args[0] === "run")
        return {
          stdout: JSON.stringify([
            {
              conclusion: "success",
              url: "https://ci.example/run/2",
              headSha: "a".repeat(40),
            },
          ]),
          stderr: "",
        };
      return { stdout: "", stderr: "" };
    };
    const result = await publish(command);
    expect(result).toMatchObject({
      mode: "push_only",
      branch: "feature/v3.2.3",
    });
    expect(calls).toContain("git push origin feature/v3.2.3");
    expect(calls.some((call) => call.startsWith("gh pr "))).toBe(false);
  });

  it("creates and then verifies an open non-draft PR", async () => {
    const command = async (program: string, args: readonly string[]) => {
      if (program === "git" && args[0] === "branch")
        return { stdout: "feature/task-v3.2.3\n", stderr: "" };
      if (program === "git" && args[0] === "rev-parse")
        return { stdout: "a".repeat(40), stderr: "" };
      if (program === "git" && args[0] === "remote")
        return {
          stdout: "https://github.com/o289/new_schedule_app.git\n",
          stderr: "",
        };
      if (program === "gh" && args[0] === "run")
        return {
          stdout: JSON.stringify([
            {
              conclusion: "success",
              url: "https://ci.example/run/3",
              headSha: "a".repeat(40),
            },
          ]),
          stderr: "",
        };
      if (program === "gh" && args[0] === "pr" && args[1] === "list")
        return { stdout: "[]", stderr: "" };
      if (program === "gh" && args[0] === "pr" && args[1] === "create")
        return {
          stdout: "https://github.com/o289/new_schedule_app/pull/3\n",
          stderr: "",
        };
      if (program === "gh" && args[0] === "pr" && args[1] === "view")
        return {
          stdout: JSON.stringify({
            url: "https://github.com/o289/new_schedule_app/pull/3",
            headRefName: "feature/task-v3.2.3",
            baseRefName: "feature/v3.2.3",
            headRefOid: "a".repeat(40),
            isDraft: false,
            state: "OPEN",
          }),
          stderr: "",
        };
      return { stdout: "", stderr: "" };
    };
    await expect(publish(command)).resolves.toMatchObject({
      prUrl: "https://github.com/o289/new_schedule_app/pull/3",
    });
  });

  it("rejects an existing draft PR", async () => {
    const command = async (program: string, args: readonly string[]) => {
      if (program === "git" && args[0] === "branch")
        return { stdout: "feature/task-v3.2.3\n", stderr: "" };
      if (program === "git" && args[0] === "rev-parse")
        return { stdout: "a".repeat(40), stderr: "" };
      if (program === "git" && args[0] === "remote")
        return {
          stdout: "https://github.com/o289/new_schedule_app.git\n",
          stderr: "",
        };
      if (program === "gh" && args[0] === "run")
        return {
          stdout: JSON.stringify([
            {
              conclusion: "success",
              url: "https://ci.example/run/4",
              headSha: "a".repeat(40),
            },
          ]),
          stderr: "",
        };
      if (program === "gh" && args[0] === "pr" && args[1] === "list")
        return {
          stdout: JSON.stringify([
            {
              url: "https://github.com/o289/new_schedule_app/pull/4",
              headRefName: "feature/task-v3.2.3",
              baseRefName: "feature/v3.2.3",
              headRefOid: "a".repeat(40),
              isDraft: true,
              state: "OPEN",
            },
          ]),
          stderr: "",
        };
      if (program === "gh" && args[0] === "pr" && args[1] === "view")
        return {
          stdout: JSON.stringify({
            url: "https://github.com/o289/new_schedule_app/pull/4",
            headRefName: "feature/task-v3.2.3",
            baseRefName: "feature/v3.2.3",
            headRefOid: "a".repeat(40),
            isDraft: true,
            state: "OPEN",
          }),
          stderr: "",
        };
      return { stdout: "", stderr: "" };
    };
    await expect(publish(command)).rejects.toThrow("通常PR");
  });

  it("stops before push on a forbidden branch", async () => {
    const calls: string[] = [];
    const command = async (program: string, args: readonly string[]) => {
      calls.push(`${program} ${args.join(" ")}`);
      if (program === "git" && args[0] === "branch")
        return { stdout: "main\n", stderr: "" };
      return { stdout: "", stderr: "" };
    };
    await expect(publish(command)).rejects.toThrow("STOP:");
    expect(calls.some((call) => call.startsWith("git push "))).toBe(false);
  });

  it("stops on a dirty worktree and a non-GitHub origin", async () => {
    const dirty = async (program: string, args: readonly string[]) => {
      if (program === "git" && args[0] === "branch")
        return { stdout: "feature/v3.2.3\n", stderr: "" };
      if (program === "git" && args[0] === "status")
        return { stdout: " M app.ts\n", stderr: "" };
      return { stdout: "", stderr: "" };
    };
    await expect(publish(dirty)).rejects.toThrow("未コミット");

    const badOrigin = async (program: string, args: readonly string[]) => {
      if (program === "git" && args[0] === "branch")
        return { stdout: "feature/v3.2.3\n", stderr: "" };
      if (program === "git" && args[0] === "rev-parse")
        return { stdout: "a".repeat(40), stderr: "" };
      if (program === "git" && args[0] === "remote")
        return { stdout: "https://example.com/repo.git\n", stderr: "" };
      return { stdout: "", stderr: "" };
    };
    await expect(publish(badOrigin)).rejects.toThrow("originはGitHub");
  });

  it("hashes evidence content deterministically", () => {
    expect(sha256("evidence")).toMatch(/^[a-f0-9]{64}$/);
  });
});
