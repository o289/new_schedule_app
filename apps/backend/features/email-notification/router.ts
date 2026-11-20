import { Hono } from "hono";

import {
  emailNotificationSettingsSchema,
  emailNotificationSettingsUpdateSchema,
} from "#schemas/email-notification";
import { ValidationError } from "#backend/core/api-error";
import { requireCurrentUser } from "#backend/core/current-user";
import { parseJsonBody } from "#backend/core/request";
import { EmailNotificationService } from "./service";

export const emailNotificationRouter = new Hono().basePath(
  "/email-notification",
);

emailNotificationRouter.get("/settings", async (context) => {
  const settings = await new EmailNotificationService().getSettings(
    await requireCurrentUser(context),
  );

  return context.json(emailNotificationSettingsSchema.parse(settings), 200);
});

emailNotificationRouter.put("/settings", async (context) => {
  const settings = await new EmailNotificationService().updateSettings(
    await requireCurrentUser(context),
    await parseJsonBody(
      context,
      emailNotificationSettingsUpdateSchema,
      () => new ValidationError("VALIDATION_ERROR"),
    ),
  );

  return context.json(emailNotificationSettingsSchema.parse(settings), 200);
});
