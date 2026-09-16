import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { handoffSchema } from "../pr-agent-publish.js";
import { startRecordV2Schema } from "../pr-agent-start.js";
import { CanonicalStateStore } from "./state-store";
import { containsSecretLikeValue, finalizeLegacyImport } from "./legacy-import";
import { runPaths } from "./run-paths";

describe("legacy finalize integration", () => {
  it("creates start, handoff, evidence and completed canonical events", async () => {
    const runId = "agent-workflow-slim-v323-20260916-r3";
    const root = await mkdtemp(join(tmpdir(), "legacy-finalize-"));
    const sourceRoot = resolve(".");
    const startSha = "a".repeat(40);
    const paths = runPaths(runId);
    const files = new Map<string, string>();
    for (const path of [
      paths.plan,
      paths.approval,
      paths.ai + "/agent-plan.md",
      paths.ai + "/legacy-import-input.json",
    ]) {
      const content = await readFile(join(sourceRoot, path), "utf8");
      files.set(
        path,
        path.endsWith("legacy-import-input.json")
          ? content.replace(
              /"reviewBaseSha":\s*"[a-f0-9]{40}"/,
              `"reviewBaseSha": "${startSha}"`,
            )
          : content,
      );
    }
    const marker = JSON.stringify({
      schemaVersion: 1,
      runId,
      repositoryRealpath: "/primary",
      startSha,
      taskBranch: "feature/agent-workflow-slim-v3.2.3",
      gitCommonDir: "/primary/.git",
    });
    files.set(".agent-run-marker.json", marker);
    const io = {
      read: async (path: string) => {
        const value = files.get(path);
        if (value === undefined)
          throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        return value;
      },
      writeExclusive: async (path: string, content: string) => {
        if (files.has(path)) throw new Error("EEXIST");
        files.set(path, content);
        await mkdir(resolve(root, path.substring(0, path.lastIndexOf("/"))), {
          recursive: true,
        });
        await writeFile(resolve(root, path), content);
      },
      mkdir: async (path: string) => {
        await mkdir(resolve(root, path), { recursive: true });
      },
    };
    const verifiedSha = "b".repeat(40);
    const git = {
      run: async (args: string[]) => {
        const key = args.join(" ");
        if (key === "rev-parse HEAD") return verifiedSha + "\n";
        if (key === "rev-parse --show-toplevel") return root + "\n";
        if (key === "rev-parse --path-format=absolute --git-common-dir")
          return "/primary/.git\n";
        if (key === "symbolic-ref --quiet --short HEAD")
          return "feature/agent-workflow-slim-v3.2.3\n";
        if (args[0] === "merge-base") return startSha + "\n";
        if (key === "remote") return "origin\n";
        if (key === "remote get-url origin")
          return "https://github.com/o289/new_schedule_app.git\n";
        if (args[0] === "status") return "";
        if (args[0] === "diff" && args[1] === "--name-only")
          return ".agents/tools/agent-run/legacy-import.ts\0ai/common.txt\0";
        if (args[0] === "diff")
          return "diff --git a/file b/file\n+<safe-tag>\n";
        if (key === `rev-parse feature/v3.2.3`) return "c".repeat(40) + "\n";
        if (key === `rev-parse refs/remotes/origin/feature/v3.2.3`)
          return "c".repeat(40) + "\n";
        throw new Error(`unexpected git args: ${key}`);
      },
    };
    const finalInput = {
      schemaVersion: 1,
      runId,
      verifiedSha,
      quality: {
        node: "22.23.1",
        pnpm: "11.20.0",
        rules: "PASS",
        typecheckFrontend: "PASS",
        typecheckBackend: "PASS",
        typecheckTools: "PASS",
        verifyPhase: "PASS",
        vitestPassed: 20,
        vitestSkipped: 0,
        vitestFailed: 0,
        integration: { status: "NOT_REQUIRED", reason: "not required" },
        e2e: { status: "NOT_REQUIRED", reason: "not required" },
      },
      noSecretsOrDebug: true,
      noUnapprovedChanges: true,
      destructiveMigrationApproved: true,
    };
    await finalizeLegacyImport(
      runId,
      finalInput,
      io,
      paths,
      root,
      git,
      new Date("2026-09-16T13:00:00Z"),
    );
    const start = startRecordV2Schema.parse(
      JSON.parse(files.get(paths.start)!),
    );
    const handoff = handoffSchema.parse(
      JSON.parse(
        files.get(paths.runtime + "/requests/publication-handoff.json")!,
      ),
    );
    const snapshot = await new CanonicalStateStore(
      resolve(root, paths.events),
    ).snapshot();
    expect(start.head).toBe("feature/agent-workflow-slim-v3.2.3");
    expect(handoff.headSha).toBe(verifiedSha);
    expect(snapshot.state).toBe("COMPLETED");
    expect(snapshot.publicationState).toBe("PENDING");
    expect(snapshot.passedPhaseIds).toHaveLength(5);
    expect(files.get(paths.runtime + "/evidence/pr-review.html")).toContain(
      "&lt;safe-tag&gt;",
    );
    const classification = JSON.parse(
      files.get(paths.runtime + "/evidence/diff-classification.json")!,
    );
    expect(classification.unclassified).toBe(0);
    expect(
      new Set(
        classification.classifications.map(
          (item: { path: string }) => item.path,
        ),
      ).size,
    ).toBe(classification.classifications.length);
  });
  it("does not treat fixture values as secrets, but rejects real token formats", () => {
    expect(
      containsSecretLikeValue(
        "+token=raw-secret\n+secret=secret\n+super-secret\n",
      ),
    ).toBe(false);
    expect(
      containsSecretLikeValue("+token=" + "ghp_" + "A".repeat(24) + "\n"),
    ).toBe(true);
  });
});
