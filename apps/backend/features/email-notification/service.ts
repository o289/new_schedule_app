import type {
  EmailNotificationSettings,
  EmailNotificationSettingsUpdate,
} from "#schemas/email-notification";
import type { User } from "../user/repository";
import { EmailNotificationRepository } from "./repository";

export class EmailNotificationService {
  constructor(
    private readonly repository = new EmailNotificationRepository(),
  ) {}

  async getSettings(user: User): Promise<EmailNotificationSettings> {
    return this.repository.getByUser(user.id);
  }

  async updateSettings(
    user: User,
    input: EmailNotificationSettingsUpdate,
  ): Promise<EmailNotificationSettings> {
    return this.repository.replace(user.id, input);
  }
}
