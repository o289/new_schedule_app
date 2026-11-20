import { describe, expect, it } from "vitest";

import {
  emailNotificationSettingsSchema,
  emailNotificationSettingsUpdateSchema,
} from "./email-notification";

const weekdays = Array.from({ length: 7 }, (_, index) => ({
  dayOfWeek: index + 1,
  enabled: false,
  deliveryTime: "09:00",
}));

describe("email notification settings schema", () => {
  it("accepts all ISO weekdays and 30-minute times", () => {
    expect(
      emailNotificationSettingsSchema.parse({
        globalEnabled: true,
        timezone: "Asia/Tokyo",
        weekdays,
      }),
    ).toEqual({
      globalEnabled: true,
      timezone: "Asia/Tokyo",
      weekdays,
    });
  });

  it.each(["08:01", "24:00", "8:00"])(
    "rejects an invalid delivery time: %s",
    (deliveryTime) => {
      expect(() =>
        emailNotificationSettingsUpdateSchema.parse({
          globalEnabled: false,
          timezone: "Asia/Tokyo",
          weekdays: weekdays.map((rule, index) =>
            index === 0 ? { ...rule, deliveryTime } : rule,
          ),
        }),
      ).toThrow();
    },
  );

  it("rejects duplicate or missing weekdays", () => {
    expect(() =>
      emailNotificationSettingsUpdateSchema.parse({
        globalEnabled: false,
        timezone: "Asia/Tokyo",
        weekdays: weekdays.map((rule, index) =>
          index === 6 ? { ...rule, dayOfWeek: 1 } : rule,
        ),
      }),
    ).toThrow();
  });
});
