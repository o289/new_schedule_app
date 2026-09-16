import { Buffer } from "node:buffer";

const maxDepth = 8;
const maxTextBytes = 64 * 1024;
const credentialPatterns: readonly RegExp[] = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /Basic\s+[A-Za-z0-9+/=]+/gi,
  /(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]+/g,
  /AKIA[0-9A-Z]{16}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /https?:\/\/[^\s/@:]+:[^\s/@]+@/gi,
  /(?:token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,;&]+/gi,
];
function decodeRepeated(value: string): string {
  let current = value;
  for (let i = 0; i < 3; i += 1) {
    try {
      const decoded = decodeURIComponent(current);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}
function safeText(value: string): string {
  const bytes = Buffer.from(value, "utf8");
  return bytes.byteLength <= maxTextBytes
    ? value
    : bytes.subarray(0, maxTextBytes).toString("utf8");
}
export function sanitizeString(
  input: string,
  knownValues: readonly string[] = [],
): string {
  let output = safeText(input);
  output = decodeRepeated(output);
  const values = [
    ...new Set(knownValues.filter((value) => value.length > 0)),
  ].sort((a, b) => b.length - a.length);
  for (const value of values) {
    for (const variant of [
      value,
      decodeRepeated(value),
      encodeURIComponent(value),
      encodeURIComponent(encodeURIComponent(value)),
    ])
      output = output.split(variant).join("[REDACTED]");
  }
  for (const pattern of credentialPatterns)
    output = output.replace(pattern, "[REDACTED]");
  return safeText(output);
}
export type SanitizedValue =
  | string
  | number
  | boolean
  | null
  | SanitizedValue[]
  | { [key: string]: SanitizedValue };
export function sanitizeValue(
  input: unknown,
  knownValues: readonly string[] = [],
  depth = 0,
  seen = new WeakSet<object>(),
): SanitizedValue {
  if (typeof input === "string") return sanitizeString(input, knownValues);
  if (typeof input === "number" || typeof input === "boolean" || input === null)
    return input;
  if (depth >= maxDepth) return "[REDACTED:DEPTH]";
  if (input instanceof Error)
    return {
      name: sanitizeString(input.name, knownValues),
      message: sanitizeString(input.message, knownValues),
    };
  if (input instanceof Uint8Array)
    return sanitizeString(new TextDecoder().decode(input), knownValues);
  if (typeof input === "object") {
    if (seen.has(input)) return "[REDACTED:CYCLE]";
    seen.add(input);
    if (Array.isArray(input))
      return input
        .slice(0, 128)
        .map((item) => sanitizeValue(item, knownValues, depth + 1, seen));
    const result: { [key: string]: SanitizedValue } = {};
    for (const [key, value] of Object.entries(input).slice(0, 128)) {
      const safeKey = sanitizeString(key, knownValues);
      const sensitive = /token|secret|password|api[-_]?key|authorization/i.test(
        key,
      );
      result[safeKey] = sensitive
        ? "[REDACTED]"
        : sanitizeValue(value, knownValues, depth + 1, seen);
    }
    return result;
  }
  return "[REDACTED:UNSUPPORTED]";
}
export class StreamingRedactor {
  private pending = Buffer.alloc(0);
  public constructor(private readonly knownValues: readonly string[] = []) {}
  public push(chunk: string | Uint8Array): string {
    const bytes =
      typeof chunk === "string"
        ? Buffer.from(chunk, "utf8")
        : Buffer.from(chunk);
    this.pending = Buffer.concat([this.pending, bytes]);
    if (this.pending.byteLength > maxTextBytes)
      this.pending = Buffer.from("[REDACTED:SIZE]");
    return "";
  }
  public finish(): string {
    const output = sanitizeString(
      new TextDecoder("utf-8", { fatal: false }).decode(this.pending),
      this.knownValues,
    );
    this.pending = Buffer.alloc(0);
    return output;
  }
}
