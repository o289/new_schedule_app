import { z } from "zod";
import type { PathGuardIO } from "./path-guard";
const digest = z.string().regex(/^[a-f0-9]{40}$/);
const dep = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    reason: z.string().min(1),
    license: z.string().min(1),
  })
  .strict();
export const dependencyChangeFactSchema = dep
  .extend({
    scope: z
      .enum([
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ])
      .optional(),
    beforeVersion: z.string().min(1).nullable().optional(),
    afterVersion: z.string().min(1).nullable().optional(),
  })
  .strict();
export const dependencyApprovalSchema = dep
  .extend({
    status: z.enum(["APPROVED", "NOT_APPLICABLE", "REJECTED"]),
    description: z.string().min(1),
    scope: z
      .enum([
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ])
      .optional(),
    beforeVersion: z.string().min(1).nullable().optional(),
    afterVersion: z.string().min(1).nullable().optional(),
  })
  .strict();
export const dependencyGuardInputSchema = z
  .object({
    root: z.string().min(1),
    startSha: digest,
    dependencyChanges: z.array(dependencyApprovalSchema).min(1),
    facts: z.array(dependencyChangeFactSchema).default([]),
  })
  .strict();
export type DependencyGuardResult = {
  changed: boolean;
  changes: string[];
  classification: "CLEAN" | "REPLAN_REQUIRED" | "SAFETY_VIOLATION";
  reason: string;
};
export interface DependencyGuardIO extends PathGuardIO {
  read: (path: string) => Promise<string>;
}
const out = (
  classification: DependencyGuardResult["classification"],
  changes: string[],
  reason: string,
): DependencyGuardResult => ({
  changed: changes.length > 0,
  changes,
  classification,
  reason,
});
const scopes = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
type Json = Record<string, unknown>;
type Delta = {
  scope: (typeof scopes)[number];
  name: string;
  beforeVersion: string | null;
  afterVersion: string | null;
};
const map = (value: unknown): Record<string, string> => {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("dependency map type");
  const result: Record<string, string> = {};
  for (const [name, version] of Object.entries(value))
    if (typeof version !== "string" || !version.trim())
      throw new Error("dependency version type");
    else result[name] = version;
  return result;
};
export async function inspectDependencies(
  raw: unknown,
  io: DependencyGuardIO,
): Promise<DependencyGuardResult> {
  const input = dependencyGuardInputSchema.parse(raw);
  const files = ["package.json", "pnpm-lock.yaml"];
  const before: string[] = [];
  const after: string[] = [];
  try {
    for (const f of files) {
      before.push(await io.run(["show", `${input.startSha}:${f}`], input.root));
      after.push(await io.read(`${input.root}/${f}`));
    }
  } catch (e) {
    return out(
      "SAFETY_VIOLATION",
      files,
      `read/show failure: ${e instanceof Error ? e.message : "unknown"}`,
    );
  }
  let oldJson: Json, newJson: Json;
  try {
    const a = JSON.parse(before[0]!) as unknown,
      b = JSON.parse(after[0]!) as unknown;
    if (
      a === null ||
      typeof a !== "object" ||
      Array.isArray(a) ||
      b === null ||
      typeof b !== "object" ||
      Array.isArray(b)
    )
      throw new Error("plain object required");
    oldJson = a as Json;
    newJson = b as Json;
  } catch (e) {
    return out(
      "SAFETY_VIOLATION",
      ["package.json"],
      `invalid package.json: ${e instanceof Error ? e.message : "unknown"}`,
    );
  }
  const oldMaps: Record<string, Record<string, string>> = {},
    newMaps: Record<string, Record<string, string>> = {};
  try {
    for (const s of scopes) {
      oldMaps[s] = map(oldJson[s]);
      newMaps[s] = map(newJson[s]);
    }
  } catch (e) {
    return out(
      "SAFETY_VIOLATION",
      ["package.json"],
      `dependency value type: ${e instanceof Error ? e.message : "unknown"}`,
    );
  }
  const strip = (v: Json): Json =>
    Object.fromEntries(
      Object.entries(v).filter(
        ([k]) => !scopes.includes(k as (typeof scopes)[number]),
      ),
    );
  if (JSON.stringify(strip(oldJson)) !== JSON.stringify(strip(newJson)))
    return out("SAFETY_VIOLATION", files, "non-dependency manifest change");
  const changed = files.filter((_, n) => before[n] !== after[n]);
  if (!changed.length) return out("CLEAN", [], "unchanged");
  if (changed.length !== 2)
    return out("SAFETY_VIOLATION", changed, "manifest/lock pair required");
  const deltas: Delta[] = [];
  for (const s of scopes) {
    for (const n of new Set([
      ...Object.keys(oldMaps[s]!),
      ...Object.keys(newMaps[s]!),
    ])) {
      if (oldMaps[s]![n] !== newMaps[s]![n])
        deltas.push({
          scope: s,
          name: n,
          beforeVersion: oldMaps[s]![n] ?? null,
          afterVersion: newMaps[s]![n] ?? null,
        });
    }
  }
  const names = deltas.map((d) => d.name);
  if (new Set(names).size !== names.length)
    return out("SAFETY_VIOLATION", changed, "ambiguous dependency scope");
  const approvals = input.dependencyChanges.filter(
    (a) => a.status === "APPROVED",
  );
  if (!approvals.length)
    return out("REPLAN_REQUIRED", changed, "no approved dependency");
  if (
    new Set(approvals.map((a) => a.name)).size !== approvals.length ||
    new Set(input.facts.map((f) => f.name)).size !== input.facts.length
  )
    return out("SAFETY_VIOLATION", changed, "duplicate approval/fact");
  if (
    approvals.length !== deltas.length ||
    input.facts.length !== deltas.length
  )
    return out(
      "REPLAN_REQUIRED",
      changed,
      "delta and approval cardinality mismatch",
    );
  for (const d of deltas) {
    const a = approvals.find(
      (x) =>
        x.name === d.name &&
        x.version === (d.afterVersion ?? "<removed>") &&
        (!x.scope || x.scope === d.scope),
    );
    const f = input.facts.find(
      (x) =>
        x.name === d.name &&
        x.version === (d.afterVersion ?? "<removed>") &&
        (!x.scope || x.scope === d.scope) &&
        x.reason === a?.reason &&
        x.license === a?.license,
    );
    if (!a || !f)
      return out("REPLAN_REQUIRED", changed, `dependency mismatch: ${d.name}`);
  }
  return out("CLEAN", changed, "approved dependency changes");
}
