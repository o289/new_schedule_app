export type MeetingProvider = "Google Meet" | "Zoom" | "Microsoft Teams";

export function getMeetingProvider(
  value: string | null | undefined,
): MeetingProvider | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;

    const hostname = url.hostname.toLowerCase();
    if (hostname === "meet.google.com") return "Google Meet";
    if (hostname === "zoom.us" || hostname.endsWith(".zoom.us")) {
      return "Zoom";
    }
    if (
      hostname === "teams.microsoft.com" ||
      hostname.endsWith(".teams.microsoft.com") ||
      hostname === "teams.live.com"
    ) {
      return "Microsoft Teams";
    }
  } catch {
    return null;
  }

  return null;
}
