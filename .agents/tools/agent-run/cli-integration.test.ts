import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const repositoryRoot = resolve(
  dirname(new URL(import.meta.url).pathname),
  "../../..",
);
const wrapper = resolve(repositoryRoot, ".agents/tools/agent-run-command");
const entrypoint = resolve(
  repositoryRoot,
  ".agents/tools/agent-run-command.ts",
);

async function run(command: string, args: string[], env?: NodeJS.ProcessEnv) {
  try {
    const result = await exec(command, args, {
      cwd: repositoryRoot,
      env: { ...process.env, ...env },
      maxBuffer: 1024 * 1024,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as {
      code?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: `${failure.stderr ?? ""}${failure.message ?? ""}`,
    };
  }
}

describe("agent-run CLI integration", () => {
  it("wrapper forwards arguments and runs from repository root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "agent-run-wrapper-"));
    const log = join(directory, "calls.log");
    const fakePnpm = join(directory, "pnpm");
    await writeFile(
      fakePnpm,
      `#!/bin/sh
printf '%s|%s\\n' "$PWD" "$*" >> "${log}"
exit 0
`,
      "utf8",
    );
    await chmod(fakePnpm, 0o755);
    try {
      const result = await run(wrapper, ["create", "run-test"], {
        PATH: `${directory}:${process.env.PATH ?? ""}`,
      });
      expect(result.code).toBe(0);
      const calls = (await readFile(log, "utf8")).trim().split("\n");
      expect(calls).toEqual([
        `${repositoryRoot}|runtime:check`,
        `${repositoryRoot}|exec tsx .agents/tools/agent-run-command.ts create run-test`,
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  const invalidArguments: string[][] = [
    [],
    ["create"],
    ["create", "run-test", "extra"],
  ];
  it.each(invalidArguments.map((args) => [args]))(
    "wrapper rejects %s arguments",
    async (args) => {
      const result = await run(wrapper, args);
      expect(result.code).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "agent run <command> <runId>",
      );
    },
  );

  it("entrypoint reaches runCommand for an unknown command", async () => {
    const result = await run(process.execPath, [
      "--import",
      "tsx",
      entrypoint,
      "unknown",
      "run-test",
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain(
      "commandはcreate、approve、start、またはcanonical操作です",
    );
  });

  it("entrypoint fails on a missing run-scoped plan without reading global docs", async () => {
    const result = await run(process.execPath, [
      "--import",
      "tsx",
      entrypoint,
      "create",
      "missing-run",
    ]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("ENOENT");
    expect(result.stderr).not.toContain("docs/agent-plan-input.json");
  });
});
