import { describe, expect, it } from "vitest";

import { getMeetingProvider } from "./meetingUrl";

describe("getMeetingProvider", () => {
  it.each([
    ["https://meet.google.com/abc-defg-hij", "Google Meet"],
    ["https://us02web.zoom.us/j/123456789", "Zoom"],
    ["https://teams.microsoft.com/l/meetup-join/example", "Microsoft Teams"],
    ["https://teams.live.com/meet/example", "Microsoft Teams"],
  ] as const)("%sを%sの会議URLとして判定する", (url, provider) => {
    expect(getMeetingProvider(url)).toBe(provider);
  });

  it.each([
    "https://example.com/meeting",
    "http://meet.google.com/abc-defg-hij",
    "not-a-url",
  ])("会議URL以外は判定しない: %s", (url) => {
    expect(getMeetingProvider(url)).toBeNull();
  });
});
