import { describe, expect, it } from "vitest";
import {
  handoffSchema,
  publish,
  sha256,
  validateBranches,
  verifyInputs,
  ensureFastForward,
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
  const plan = artifact("docs/plan.md", "Approved plan");
  const input: Extract<Handoff, { mode: "pull_request" }> = {
    schemaVersion: 2,
    mode: "pull_request",
    start: artifact(
      "docs/start.json",
      JSON.stringify({
        schemaVersion: 1,
        completed: true,
        approved: true,
        size: "large",
        mode: "pull_request",
        sourceBranch: base,
        head,
        slug: "pr-agent",
        reviewBaseSha: mergeSha,
        plan,
        assessment: {
          phaseCount: 5,
          plannedFiles: ["example"],
          authenticationChanged: false,
          dbModels: [],
          dependentDbModels: false,
          directImplementation: false,
        },
      }),
    ),
    head,
    headSha,
    base,
    baseSha,
    reviewBaseSha: mergeSha,
    plan,
    prReview: {
      diffSha256: sha256(diff),
      classification: artifact(
        "docs/pr-classification.md",
        "All PR diff: example#1",
      ),
      allDiffClassified: true,
      unclassified: 0,
    },
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
    remoteHead: undefined as string | undefined,
    ancestor: mergeSha,
    changedPaths: "example\0",
    reports: [] as string[],
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
    report: (message) => {
      state.reports.push(message);
    },
    run: async (program, args) => {
      commands.push([program, ...args]);
      if (program === "git") {
        if (args[0] === "check-ref-format") return "";
        if (args[0] === "status") return state.dirty ? " M file" : "";
        if (args[0] === "symbolic-ref") return input.head;
        if (args[0] === "remote") return state.remoteUrl;
        if (args[0] === "for-each-ref") return state.upstream;
        if (args[0] === "merge-base") return state.ancestor;
        if (args[0] === "diff")
          return args.includes("--name-only") ? state.changedPaths : diff;
        if (args[0] === "rev-parse") {
          if (args[1] === "--show-toplevel") return process.cwd();
          return args[1] === "HEAD" ? state.currentSha : baseSha;
        }
        if (args[0] === "ls-remote") {
          const commit =
            args[3] === `refs/heads/${input.head}`
              ? state.remoteHead
              : state.remoteBase;
          return commit === undefined ? "" : `${commit}\t${args[3]}\n`;
        }
        if (args.includes("push")) {
          if (state.failPush) throw new Error("push rejected");
          state.remoteHead = headSha;
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
    expect(() => validateBranches("pull_request", branch, base)).toThrow();
  });
  it("accepts both allowed branch forms and enforces matching feature base", () => {
    expect(() => validateBranches("pull_request", head, base)).not.toThrow();
    expect(() => validateBranches("push_only", base)).not.toThrow();
    expect(() =>
      validateBranches("pull_request", head, "feature/v3.2.1"),
    ).toThrow();
    expect(() => validateBranches("push_only", base, base)).toThrow();
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
    expect(await publish(f.input, f.io)).toMatchObject({
      mode: "pull_request",
      prUrl: url,
      ciUrl: f.run.url,
    });
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
    expect(await publish(f.input, f.io)).toMatchObject({
      mode: "pull_request",
      prUrl: url,
      ciUrl: f.run.url,
    });
    expect(writes(f.commands)).toHaveLength(1);
  });
  it("recovers an uncertain create response without creating twice", async () => {
    const f = fixture();
    f.state.failCreate = true;
    await expect(publish(f.input, f.io)).rejects.toThrow();
    f.state.failCreate = false;
    expect(await publish(f.input, f.io)).toMatchObject({
      mode: "pull_request",
      prUrl: url,
      ciUrl: f.run.url,
    });
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

function pushOnlyFixture() {
  const f = fixture();
  const {
    base: _base,
    baseSha: _baseSha,
    prReview: _prReview,
    title: _title,
    body: _body,
    ...common
  } = f.input;
  const input: Extract<Handoff, { mode: "push_only" }> = {
    ...common,
    mode: "push_only",
    head: base,
  };
  const record = JSON.stringify({
    schemaVersion: 1,
    completed: true,
    approved: true,
    size: "medium",
    mode: "push_only",
    sourceBranch: base,
    head: base,
    reviewBaseSha: mergeSha,
    plan: f.input.plan,
    assessment: {
      phaseCount: 3,
      plannedFiles: ["example"],
      authenticationChanged: false,
      dbModels: [],
      dependentDbModels: false,
      directImplementation: false,
    },
  });
  f.files.set("docs/start.json", record);
  input.start = { path: "docs/start.json", sha256: sha256(record) };
  // 外部境界の現在branchも版branchへ合わせる。
  f.input.head = base;
  f.state.upstream = `origin/${base}`;
  f.run.headBranch = base;
  return { ...f, input };
}
describe("handoff version 2", () => {
  it("derives PR base without a plan PR base line", () => {
    const { base: _base, ...input } = fixture().input;
    const parsed = handoffSchema.parse(input);
    expect(parsed.mode === "pull_request" && parsed.base).toBe(base);
  });
  it("verifies push-only without PR fields or PR commands", async () => {
    const f = pushOnlyFixture();
    expect(handoffSchema.safeParse(f.input).success).toBe(true);
    await verifyInputs(f.io, f.input);
    expect(f.commands.some((args) => args[0] === "gh")).toBe(false);
    expect(f.commands.some((args) => args.includes("ls-remote"))).toBe(false);
  });
  it.each(["wrong-mode", "old-version", "wrong-base", "push-base"])(
    "rejects %s",
    (problem) => {
      const pr = fixture().input;
      const input =
        problem === "wrong-mode"
          ? { ...pr, mode: "push_only" }
          : problem === "old-version"
            ? { ...pr, schemaVersion: 1 }
            : problem === "wrong-base"
              ? { ...pr, base: "main" }
              : { ...pushOnlyFixture().input, base };
      expect(handoffSchema.safeParse(input).success).toBe(false);
    },
  );
  it("rejects a review start that differs from the start record", async () => {
    const f = fixture();
    f.input.reviewBaseSha = headSha;
    await expect(publish(f.input, f.io)).rejects.toThrow("開始記録");
    expect(writes(f.commands)).toEqual([]);
  });
  it("rejects a different complete PR diff even when task diff matches", async () => {
    const f = fixture();
    f.input.prReview.diffSha256 = "0".repeat(64);
    await expect(publish(f.input, f.io)).rejects.toThrow("PR全diff");
    expect(writes(f.commands)).toEqual([]);
  });
});

describe("push-only publication", () => {
  it("pushes and checks CI without ever querying PRs", async () => {
    const f = pushOnlyFixture();
    expect(await publish(f.input, f.io)).toEqual({
      mode: "push_only",
      head: base,
      headSha,
      ciUrl: f.run.url,
    });
    expect(writes(f.commands)).toHaveLength(1);
    expect(f.commands.some((c) => c[0] === "gh" && c[1] === "pr")).toBe(false);
    expect(f.state.body).toBe("");
  });
  it("retries the same SHA without pushing again and still checks CI", async () => {
    const f = pushOnlyFixture();
    await publish(f.input, f.io);
    await publish(f.input, f.io);
    expect(writes(f.commands)).toHaveLength(1);
    expect(
      f.commands.filter((c) => c[0] === "gh" && c[2] === "list").length,
    ).toBeGreaterThanOrEqual(4);
  });
  it("fails after push if CI fails, and reports push completion", async () => {
    const f = pushOnlyFixture();
    f.run.conclusion = "failure";
    await expect(publish(f.input, f.io)).rejects.toThrow("CI");
    expect(f.state.reports).toContain(
      "push完了。以降の失敗時もbranchを削除しません。",
    );
    expect(f.commands.some((c) => c[0] === "gh" && c[1] === "pr")).toBe(false);
  });
  it("does not treat an identical remote SHA as successful when CI fails", async () => {
    const f = pushOnlyFixture();
    f.state.remoteHead = headSha;
    f.run.conclusion = "failure";
    await expect(publish(f.input, f.io)).rejects.toThrow("CI");
    expect(writes(f.commands)).toHaveLength(0);
  });
  it("rejects a remote ahead of or divergent from head", async () => {
    const f = pushOnlyFixture();
    f.state.remoteHead = baseSha;
    await expect(publish(f.input, f.io)).rejects.toThrow("先行または分岐");
    expect(writes(f.commands)).toHaveLength(0);
  });
  it("rejects changed paths outside the start plan", async () => {
    const f = pushOnlyFixture();
    f.state.changedPaths = "unexpected.ts\0";
    await expect(publish(f.input, f.io)).rejects.toThrow("予定にない");
    expect(writes(f.commands)).toHaveLength(0);
  });
  it("rejects a nonancestor review base", async () => {
    const f = pushOnlyFixture();
    f.state.ancestor = baseSha;
    await expect(publish(f.input, f.io)).rejects.toThrow("祖先");
    expect(writes(f.commands)).toHaveLength(0);
  });
});
describe("fast-forward check", () => {
  it("accepts only missing, identical, or ancestor remote commits", async () => {
    const io = { run: async () => baseSha };
    expect(await ensureFastForward(io, undefined, headSha)).toBe(true);
    expect(await ensureFastForward(io, headSha, headSha)).toBe(false);
    expect(await ensureFastForward(io, baseSha, headSha)).toBe(true);
    await expect(ensureFastForward(io, mergeSha, headSha)).rejects.toThrow(
      "先行または分岐",
    );
  });
  it("does not assume missing local commit objects are safe", async () => {
    const io = {
      run: async (): Promise<string> => {
        throw new Error("bad object");
      },
    };
    await expect(ensureFastForward(io, baseSha, headSha)).rejects.toThrow(
      "remote commit",
    );
  });
});

describe("publication state changes", () => {
  it("rejects detached HEAD before push", async () => {
    const f = pushOnlyFixture();
    const run = f.io.run;
    f.io.run = async (program, args) => {
      if (program === "git" && args[0] === "symbolic-ref")
        throw new Error("detached HEAD");
      return run(program, args);
    };
    await expect(publish(f.input, f.io)).rejects.toThrow();
    expect(writes(f.commands)).toHaveLength(0);
  });
  it.each(["in_progress", "wrong-sha", "missing-check", "skipped-check"])(
    "does not complete push-only on CI %s",
    async (problem) => {
      const f = pushOnlyFixture();
      if (problem === "in_progress") f.run.status = "in_progress";
      if (problem === "wrong-sha") f.run.headSha = baseSha;
      if (problem === "missing-check") f.state.jobs = [];
      if (problem === "skipped-check")
        f.state.jobs = [
          {
            name: "型・テスト・書式の確認",
            status: "completed",
            conclusion: "skipped",
          },
        ];
      await expect(publish(f.input, f.io)).rejects.toThrow();
      expect(f.commands.some((c) => c[0] === "gh" && c[1] === "pr")).toBe(
        false,
      );
    },
  );
  it("rejects a different latest CI run before completion", async () => {
    const f = pushOnlyFixture();
    const run = f.io.run;
    f.io.run = async (program, args) => {
      const output = await run(program, args);
      if (program === "gh" && args[0] === "run" && args[1] === "view")
        f.run.databaseId += 1;
      return output;
    };
    await expect(publish(f.input, f.io)).rejects.toThrow("CIが再実行");
  });
});
