import { groupJoinSchema } from "#schemas/group";

const invitationTokenPattern = /^[A-Z0-9_-]{24}$/u;

export function buildInvitationLink(origin: string, token: string): string {
  const url = new URL("/join", origin);
  url.hash = token;
  return url.toString();
}

export function isShareCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function parseInvitationToken(hash: string): string | null {
  if (!hash.startsWith("#")) return null;

  try {
    const parsed = groupJoinSchema.safeParse({
      joinCode: decodeURIComponent(hash.slice(1)),
    });
    if (!parsed.success || !invitationTokenPattern.test(parsed.data.joinCode)) {
      return null;
    }
    return parsed.data.joinCode;
  } catch {
    return null;
  }
}
