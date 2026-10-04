import { z } from "zod";

const deliveryTimeSchema = z
  .string()
  .regex(
    /^(?:[01]\d|2[0-3]):[03]0$/,
    "deliveryTime must use 30-minute intervals",
  );

export const emailNotificationWeekdayRuleSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    enabled: z.boolean(),
    deliveryTime: deliveryTimeSchema,
  })
  .strict();

export const emailNotificationSettingsSchema = z
  .object({
    globalEnabled: z.boolean(),
    timezone: z.literal("Asia/Tokyo"),
    weekdays: z
      .array(emailNotificationWeekdayRuleSchema)
      .length(7)
      .superRefine((rules, context) => {
        const days = rules.map((rule) => rule.dayOfWeek);
        if (new Set(days).size !== days.length) {
          context.addIssue({
            code: "custom",
            message: "dayOfWeek must not contain duplicates",
          });
        }

        if (new Set(days).size !== 7) {
          context.addIssue({
            code: "custom",
            message: "all ISO weekdays must be provided",
          });
        }
      }),
  })
  .strict();

export const emailNotificationSettingsUpdateSchema =
  emailNotificationSettingsSchema;

export type EmailNotificationWeekdayRule = z.infer<
  typeof emailNotificationWeekdayRuleSchema
>;

export type EmailNotificationSettings = z.infer<
  typeof emailNotificationSettingsSchema
>;

export type EmailNotificationSettingsUpdate = z.infer<
  typeof emailNotificationSettingsUpdateSchema
>;
