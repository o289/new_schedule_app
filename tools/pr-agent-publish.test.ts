import { describe, expect, it } from "vitest";
import {
  handoffSchema,
  publish,
  sha256,
  validateBranches,
} from "./pr-agent-publish.js";
import type { Handoff, PublishIO } from "./pr-agent-publish.js";

const headSha = "a".repeat(40);
const baseSha = "b".repeat(40);
const mergeSha = "c".repeat(40);
const head = "feature/pr-agent-v3.2.2";
const base = "feature/v3.2.2";
const diff = "diff --git a/example b/example\n@@ -1 +1 @@\n-old\n+new\n";
const url = "https://github.com/o289/new_schedule_app/pull/12";
function fixture() {
  const files = new Map<string, string>();
  function artifact(path: string, content: string) {
    files.set(path, content);
    return { path, sha256: sha256(content) };
  }
  const evidence = artifact(
    "docs/quality.md",
    `${headSha}\npnpm verify:phase PASS`,
  );
  const input: Handoff = {
    schemaVersion: 1,
    head,
    headSha,
    base,
    baseSha,
    mergeBaseSha: mergeSha,
    plan: artifact("docs/plan.md", `Approved\nPR base: ${base}`),
    implementation: artifact("docs/implementation.md", headSha),
    allPhasesComplete: true,
    quality: {
      final: "PASS",
      verifyPhase: { status: "PASS", evidence },
      integration: { status: "NOT_REQUIRED", reason: "No database changes" },
      e2e: { status: "NOT_REQUIRED", reason: "No app flow changes" },
    },
    changes: {
      db: false,
      dependencies: false,
      configuration: true,
      generated: false,
    },
    review: {
      diffSha256: sha256(diff),
      classification: artifact("docs/classification.md", "STEP 1: example#1"),
      allDiffClassified: true,
      unclassified: 0,
      safetyReview: artifact(
        "docs/safety.md",
        "Reviewed. No destructive migration.",
      ),
      noSecretsOrDebug: true,
      noUnapprovedChanges: true,
      destructiveMigrationApproved: true,
      html: artifact("docs/html/review.html", "<html>Review</html>"),
    },
    title: "Validate PR publishing",
    body: artifact(
      "docs/body.md",
      [
        "目的",
        "ユーザーへの影響",
        "変更の全体像",
        "STEPごとの変更概要",
        "重要な変更とリスク",
        "契約・データへの影響",
        "検証結果",
        "Integration / E2Eの範囲",
        "レビュー推奨順序",
        "対象外・未確認・rollback",
      ]
        .map((title) => `## ${title}\n説明`)
        .join("\n\n"),
    ),
  };
  const run = {
    databaseId: 10,
    headSha,
    headBranch: head,
    event: "push",
    status: "completed",
    conclusion: "success",
    workflowName: "CI",
    url: "https://github.com/o289/new_schedule_app/actions/runs/10",
  };
  const pr = {
    number: 12,
    headRefName: head,
    baseRefName: base,
    headRefOid: headSha,
    state: "OPEN",
    isDraft: false,
    isCrossRepository: false,
    url,
  };
  const state = {
    dirty: false,
    currentSha: headSha,
    remoteBase: baseSha,
    remoteHead: headSha,
    remoteUrl: "https://github.com/o289/new_schedule_app.git",
    upstream: `origin/${head}`,
    runs: [run],
    jobs: [
      {
        name: "型・テスト・書式の確認",
        status: "completed",
        conclusion: "success",
      },
      {
        name: "Chromium・WebKit E2Eテスト",
        status: "completed",
        conclusion: "skipped",
      },
    ],
    prs: [] as (typeof pr)[],
    failCreate: false,
    failPush: false,
    body: "",
    sleeps: 0,
    onSleep: () => {},
    onPush: () => {},
    onRead: () => {},
  };
  const commands: string[][] = [];
  const io: PublishIO = {
    read: async (path) => {
      state.onRead();
      const content = files.get(path);
      if (content === undefined) throw new Error("Missing artifact");
      return content;
    },
    bodyFile: async (content) => {
      state.body = content;
      return "/tmp/pr-agent/body.md";
    },
    sleep: async () => {
      state.sleeps += 1;
      state.onSleep();
    },
    report: () => {},
    run: async (program, args) => {
      commands.push([program, ...args]);
      if (program === "git") {
        if (args[0] === "check-ref-format") return "";
        if (args[0] === "status") return state.dirty ? " M file" : "";
        if (args[0] === "symbolic-ref") return input.head;
        if (args[0] === "remote") return state.remoteUrl;
        if (args[0] === "for-each-ref") return state.upstream;
        if (args[0] === "merge-base") return mergeSha;
        if (args[0] === "diff") return diff;
        if (args[0] === "rev-parse") {
          if (args[1] === "--show-toplevel") return process.cwd();
          return args[1] === "HEAD" ? state.currentSha : baseSha;
        }
        if (args[0] === "ls-remote")
          return `${args[3] === `refs/heads/${input.base}` ? state.remoteBase : state.remoteHead}\t${args[3]}\n`;
        if (args.includes("push")) {
          if (state.failPush) throw new Error("push rejected");
          state.onPush();
          return "ok";
        }
      }
      if (program === "gh") {
        if (args[0] === "run" && args[1] === "list")
          return JSON.stringify(state.runs);
        if (args[0] === "run" && args[1] === "view")
          return JSON.stringify({ ...state.runs[0], jobs: state.jobs });
        if (args[0] === "pr" && args[1] === "list")
          return JSON.stringify(state.prs);
        if (args[0] === "pr" && args[1] === "create") {
          state.prs = [pr];
          if (state.failCreate) throw new Error("connection lost after create");
          return url;
        }
      }
      throw new Error(`Unexpected command: ${program} ${args.join(" ")}`);
    },
  };
  return { input, state, files, io, commands, run, pr };
}
function writes(commands: string[][]) {
  return commands.filter(
    (args) =>
      (args[0] === "git" && args.includes("push")) ||
      (args[0] === "gh" && args[2] === "create"),
  );
}
describe("PR publish safety", () => {
  it.each([
    "main",
    "release",
    "codex/new",
    "feature/task",
    "feature/v3.2",
    "feature/a/v3.2.2",
    "",
  ])("rejects forbidden head %s", (branch) => {
    expect(() => validateBranches(branch, base)).toThrow();
  });
  it("accepts both allowed branch forms and enforces matching feature base", () => {
    expect(() => validateBranches(head, base)).not.toThrow();
    expect(() => validateBranches(base, "main")).not.toThrow();
    expect(() => validateBranches(head, "feature/v3.2.1")).toThrow();
    expect(() => validateBranches(base, base)).toThrow();
  });
  it.each([
    "quality",
    "args",
    "dirty",
    "sha",
    "remote",
    "upstream",
    "base",
    "diff",
    "artifact",
    "unclassified",
    "plan",
  ])("stops before writes for %s", async (problem) => {
    const f = fixture();
    switch (problem) {
      case "quality":
        f.files.set("docs/quality.md", "FAIL");
        break;
      case "dirty":
        f.state.dirty = true;
        break;
      case "sha":
        f.state.currentSha = baseSha;
        break;
      case "remote":
        f.state.remoteUrl = "https://github.com/other/repo.git";
        break;
      case "upstream":
        f.state.upstream = "other/main";
        break;
      case "base":
        f.state.remoteBase = mergeSha;
        break;
      case "diff":
        f.input.review.diffSha256 = "0".repeat(64);
        break;
      case "artifact":
        f.input.body.path = "docs/../secret";
        break;
      case "unclassified": {
        const raw = {
          ...f.input,
          review: { ...f.input.review, unclassified: 1 },
        };
        await expect(publish(raw, f.io)).rejects.toThrow();
        expect(writes(f.commands)).toEqual([]);
        return;
      }
      case "plan":
        f.files.set("docs/plan.md", "No base");
        f.input.plan.sha256 = sha256("No base");
        break;
    }
    await expect(
      publish(f.input, f.io, problem === "args" ? ["main"] : []),
    ).rejects.toThrow();
    expect(writes(f.commands)).toEqual([]);
  });
  it("rejects incomplete phases, FAIL, and unexplained skipped gates", () => {
    const { input } = fixture();
    expect(
      handoffSchema.safeParse({ ...input, allPhasesComplete: false }).success,
    ).toBe(false);
    expect(
      handoffSchema.safeParse({
        ...input,
        quality: { ...input.quality, final: "FAIL" },
      }).success,
    ).toBe(false);
    expect(
      handoffSchema.safeParse({
        ...input,
        quality: {
          ...input.quality,
          e2e: { status: "NOT_REQUIRED", reason: "" },
        },
      }).success,
    ).toBe(false);
  });
  it("pushes one explicit SHA without force then creates a normal PR with CI evidence", async () => {
    const f = fixture();
    expect(await publish(f.input, f.io)).toBe(url);
    const actualWrites = writes(f.commands);
    expect(actualWrites).toHaveLength(2);
    expect(actualWrites[0]).toEqual([
      "git",
      "-c",
      "push.followTags=false",
      "-c",
      "remote.origin.mirror=false",
      "push",
      "--porcelain",
      "origin",
      `${headSha}:refs/heads/${head}`,
    ]);
    expect(actualWrites[1]).toContain("--body-file");
    expect(actualWrites[1]).not.toContain("--draft");
    expect(f.state.body).toContain(headSha);
    expect(f.state.body).toContain(f.run.url);
  });
  it.each([
    "failure",
    "cancelled",
    "skipped",
    "wrong-sha",
    "wrong-branch",
    "wrong-workflow",
    "missing-job",
    "skipped-job",
    "missing-run",
    "pending",
  ])("never creates PR with CI %s", async (problem) => {
    const f = fixture();
    switch (problem) {
      case "wrong-sha":
        f.run.headSha = baseSha;
        break;
      case "wrong-branch":
        f.run.headBranch = "main";
        break;
      case "wrong-workflow":
        f.run.workflowName = "Other";
        break;
      case "missing-job":
        f.state.jobs = [];
        break;
      case "skipped-job":
        f.state.jobs = [
          {
            name: "型・テスト・書式の確認",
            status: "completed",
            conclusion: "skipped",
          },
        ];
        break;
      case "missing-run":
        f.state.runs = [];
        break;
      case "pending":
        f.run.status = "in_progress";
        break;
      default:
        f.run.conclusion = problem;
    }
    await expect(publish(f.input, f.io)).rejects.toThrow();
    expect(writes(f.commands)).toHaveLength(1);
    if (["missing-run", "pending"].includes(problem))
      expect(f.state.sleeps).toBe(60);
  });
  it("waits for CI and only then creates a PR", async () => {
    const f = fixture();
    f.run.status = "queued";
    f.state.onSleep = () => {
      f.run.status = "completed";
    };
    await publish(f.input, f.io);
    expect(f.state.sleeps).toBe(1);
    expect(writes(f.commands)).toHaveLength(2);
  });
  it.each(["head", "base", "remote-head", "artifact"])(
    "detects %s changes after push",
    async (change) => {
      const f = fixture();
      f.state.onPush = () => {
        if (change === "head") f.state.currentSha = baseSha;
        if (change === "base") f.state.remoteBase = mergeSha;
        if (change === "remote-head") f.state.remoteHead = mergeSha;
        if (change === "artifact") f.files.set("docs/body.md", "Changed");
      };
      await expect(publish(f.input, f.io)).rejects.toThrow();
      expect(writes(f.commands)).toHaveLength(1);
    },
  );
  it.each(["draft", "closed", "base", "fork", "sha", "duplicate"])(
    "rejects existing PR %s before push",
    async (problem) => {
      const f = fixture();
      f.state.prs = [f.pr];
      if (problem === "draft") f.pr.isDraft = true;
      if (problem === "closed") f.pr.state = "CLOSED";
      if (problem === "base") f.pr.baseRefName = "main";
      if (problem === "fork") f.pr.isCrossRepository = true;
      if (problem === "sha") f.pr.headRefOid = mergeSha;
      if (problem === "duplicate") f.state.prs.push(f.pr);
      await expect(publish(f.input, f.io)).rejects.toThrow();
      expect(writes(f.commands)).toEqual([]);
    },
  );
  it("reuses a matching normal PR", async () => {
    const f = fixture();
    f.state.prs = [f.pr];
    expect(await publish(f.input, f.io)).toBe(url);
    expect(writes(f.commands)).toHaveLength(1);
  });
  it("recovers an uncertain create response without creating twice", async () => {
    const f = fixture();
    f.state.failCreate = true;
    await expect(publish(f.input, f.io)).rejects.toThrow();
    f.state.failCreate = false;
    expect(await publish(f.input, f.io)).toBe(url);
    expect(
      f.commands.filter((c) => c[0] === "gh" && c[2] === "create"),
    ).toHaveLength(1);
  });
  it("does not query CI or create PR when push fails", async () => {
    const f = fixture();
    f.state.failPush = true;
    await expect(publish(f.input, f.io)).rejects.toThrow();
    expect(f.commands.some((c) => c[0] === "gh" && c[1] === "run")).toBe(false);
  });
});
