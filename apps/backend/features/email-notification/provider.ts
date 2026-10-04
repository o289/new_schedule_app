import { BrevoClient, BrevoError, BrevoTimeoutError } from "@getbrevo/brevo";

import { env } from "#backend/config/env";
import type { EmailMessage } from "./template";

export type EmailProviderErrorKind =
  "quota" | "rate_limited" | "temporary" | "permanent" | "unknown";

export class EmailProviderError extends Error {
  constructor(
    readonly kind: EmailProviderErrorKind,
    readonly statusCode?: number,
  ) {
    super(`Email provider ${kind} failure`);
    this.name = "EmailProviderError";
  }
}

export type EmailProviderResult = { providerMessageId: string | null };

export function buildBrevoSendPayload(
  sender: { name: string; email: string },
  message: EmailMessage,
) {
  return {
    sender,
    to: message.to,
    subject: message.subject,
    htmlContent: message.htmlContent,
    textContent: message.textContent,
    headers: { "Idempotency-Key": message.idempotencyKey },
  };
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailProviderResult>;
}

export class FakeEmailProvider implements EmailProvider {
  readonly messages: EmailMessage[] = [];
  private sentCount = 0;

  constructor(private readonly maxRecordedMessages = 100) {}

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    this.sentCount += 1;
    this.messages.push(message);
    if (this.messages.length > this.maxRecordedMessages) {
      this.messages.splice(0, this.messages.length - this.maxRecordedMessages);
    }
    return { providerMessageId: `fake-${this.sentCount}` };
  }
}

export function classifyBrevoError(error: unknown): EmailProviderError {
  if (error instanceof BrevoTimeoutError) {
    return new EmailProviderError("unknown");
  }
  if (!(error instanceof BrevoError)) {
    return new EmailProviderError("unknown");
  }

  const statusCode = error.statusCode;
  const errorText =
    `${error.message} ${String(error.body ?? "")}`.toLowerCase();
  if (
    [400, 402, 429].includes(statusCode ?? 0) &&
    /quota|daily/.test(errorText)
  ) {
    return new EmailProviderError("quota", statusCode);
  }
  if (statusCode === 429) {
    return new EmailProviderError("rate_limited", statusCode);
  }
  if (
    statusCode !== undefined &&
    [408, 500, 502, 503, 504].includes(statusCode)
  ) {
    return new EmailProviderError("temporary", statusCode);
  }
  if (
    statusCode !== undefined &&
    [400, 401, 403, 404, 422].includes(statusCode)
  ) {
    return new EmailProviderError("permanent", statusCode);
  }
  return new EmailProviderError("unknown", statusCode);
}

export class BrevoEmailProvider implements EmailProvider {
  private readonly client: BrevoClient;

  constructor(
    private readonly configuration: {
      apiKey: string;
      sender: { name: string; email: string };
    },
  ) {
    this.client = new BrevoClient({ apiKey: configuration.apiKey });
  }

  async send(message: EmailMessage): Promise<EmailProviderResult> {
    try {
      const response = await this.client.transactionalEmails.sendTransacEmail(
        buildBrevoSendPayload(this.configuration.sender, message),
        { maxRetries: 0 },
      );
      return { providerMessageId: response.messageId ?? null };
    } catch (error) {
      throw classifyBrevoError(error);
    }
  }
}

export function createEmailProvider(): EmailProvider {
  if (env.EMAIL_PROVIDER === "fake") {
    return new FakeEmailProvider();
  }

  if (!env.BREVO_API_KEY || !env.EMAIL_SENDER_NAME || !env.EMAIL_SENDER_EMAIL) {
    throw new Error("Brevo email provider configuration is incomplete");
  }

  return new BrevoEmailProvider({
    apiKey: env.BREVO_API_KEY,
    sender: {
      name: env.EMAIL_SENDER_NAME,
      email: env.EMAIL_SENDER_EMAIL,
    },
  });
}
