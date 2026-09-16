import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
const execFile = promisify(execFileCallback);
const actualPathSchema = z
  .string()
  .min(1)
  .refine(
    (p) =>
      p !== "." &&
      !p.startsWith("/") &&
      !p.includes("\\") &&
      !p.includes("\0") &&
      !p.split("/").some((s) => !s || s === "." || s === ".."),
    "不正なrepository path",
  );
const ruleSchema = z
  .string()
  .min(1)
  .refine(
    (p) =>
      p === ".env*" ||
      (!p.includes("\\") &&
        !p.includes("\0") &&
        !p.split("/").some((s) => !s || s === "." || s === "..") &&
        (!p.includes("*") || p.endsWith("/**"))),
    "不正なpath rule",
  );
export const pathGuardInputSchema = z
  .object({
    root: z.string().min(1),
    startSha: z.string().regex(/^[a-f0-9]{40}$/),
    allowedPaths: z.array(ruleSchema),
    forbiddenPaths: z.array(ruleSchema),
  })
  .strict();
export type PathGuardInput = z.infer<typeof pathGuardInputSchema>;
export type PathChange = {
  path: string;
  kind: "tracked" | "untracked" | "rename" | "copy" | "mode" | "submodule";
  oldPath?: string;
};
export type PathGuardResult = {
  changes: PathChange[];
  violations: {
    path: string;
    classification: "REPLAN_REQUIRED" | "SAFETY_VIOLATION";
    reason: string;
  }[];
  classification: "CLEAN" | "REPLAN_REQUIRED" | "SAFETY_VIOLATION";
};
export interface PathGuardIO {
  run: (args: string[], cwd: string) => Promise<string>;
}
function match(path: string, rule: string): boolean {
  if (rule === ".env*") return path === ".env" || path.startsWith(".env.");
  return rule.endsWith("/**")
    ? path === rule.slice(0, -3) || path.startsWith(rule.slice(0, -2))
    : path === rule;
}
function classify(
  path: string,
  input: PathGuardInput,
): "allowed" | "forbidden" | "outside" {
  if (input.forbiddenPaths.some((r) => match(path, r))) return "forbidden";
  return input.allowedPaths.some((r) => match(path, r)) ? "allowed" : "outside";
}
export function parseRawDiff(output: string): PathChange[] {
  if (output === "") return [];
  if (!output.endsWith("\0")) throw new Error("raw diff must end with NUL");
  const fields = output.slice(0, -1).split("\0");
  const result: PathChange[] = [];
  let i = 0;
  for (; i < fields.length;) {
    const header = fields[i++]!.split(" ");
    if (
      header.length !== 5 ||
      !/^:[0-7]{6}$/.test(header[0]!) ||
      !/^[0-7]{6}$/.test(header[1]!) ||
      !/^[a-f0-9]{40}$/.test(header[2]!) ||
      !/^[a-f0-9]{40}$/.test(header[3]!)
    )
      throw new Error("malformed raw diff header");
    const oldMode = header[0]!.slice(1),
      newMode = header[1]!,
      status = header[4]!;
    if (!/^(?:[A-Z]|R(?:[0-9]{1,3})|C(?:[0-9]{1,3}))$/.test(status))
      throw new Error("invalid raw diff status");
    const oldPath = fields[i++];
    if (!oldPath) throw new Error("missing raw diff path");
    if (status.startsWith("R") || status.startsWith("C")) {
      const path = fields[i++];
      if (!path) throw new Error("missing rename path");
      result.push({
        path,
        oldPath,
        kind: status.startsWith("R") ? "rename" : "copy",
      });
    } else
      result.push({
        path: oldPath,
        kind:
          oldMode === "160000" || newMode === "160000"
            ? "submodule"
            : oldMode !== newMode
              ? "mode"
              : "tracked",
      });
  }
  if (i !== fields.length) throw new Error("extra raw diff fields");
  return result;
}
export function parseNulPaths(output: string): string[] {
  if (output === "") return [];
  if (!output.endsWith("\0"))
    throw new Error("NUL path list must end with NUL");
  const fields = output.slice(0, -1).split("\0");
  if (fields.some((path) => path.length === 0))
    throw new Error("empty NUL path");
  return fields;
}
export async function inspectPaths(
  raw: PathGuardInput,
  io: PathGuardIO = {
    run: async (args, cwd) => (await execFile("git", args, { cwd })).stdout,
  },
): Promise<PathGuardResult> {
  const input = pathGuardInputSchema.parse(raw);
  const diff = await io.run(
    [
      "diff",
      "--raw",
      "-z",
      "--find-renames",
      "--find-copies",
      "--no-abbrev",
      input.startSha,
      "--",
    ],
    input.root,
  );
  const untracked = await io.run(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    input.root,
  );
  const changes: PathChange[] = [
    ...parseRawDiff(diff),
    ...parseNulPaths(untracked).map((path): PathChange => ({
      path,
      kind: "untracked",
    })),
  ];
  const violations = changes.flatMap((change) => {
    const paths = change.oldPath
      ? [change.oldPath, change.path]
      : [change.path];
    return paths.flatMap((path) => {
      const category = actualPathSchema.safeParse(path).success
        ? classify(path, input)
        : "forbidden";
      return category === "allowed"
        ? []
        : [
            {
              path,
              classification:
                category === "forbidden"
                  ? ("SAFETY_VIOLATION" as const)
                  : ("REPLAN_REQUIRED" as const),
              reason:
                category === "forbidden" ? "禁止pathです" : "許可path外です",
            },
          ];
    });
  });
  const classification = violations.some(
    (v) => v.classification === "SAFETY_VIOLATION",
  )
    ? "SAFETY_VIOLATION"
    : violations.length > 0
      ? "REPLAN_REQUIRED"
      : "CLEAN";
  return { changes, violations, classification };
}
