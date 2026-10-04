import { describe, expect, it } from "vitest";

import { BrevoError, BrevoTimeoutError } from "@getbrevo/brevo";

import {
  EmailProviderError,
  FakeEmailProvider,
  buildBrevoSendPayload,
  classifyBrevoError,
} from "./provider";

describe("fake email provider", () => {
  it("stores the message in memory and never calls an external provider", async () => {
    const provider = new FakeEmailProvider();
    const message = {
      to: [{ email: "safe@example.com" }],
      subject: "今日の予定",
      htmlContent: "<p>予定</p>",
      textContent: "予定",
      idempotencyKey: "00000000-0000-4000-8000-000000000000",
    };

    await expect(provider.send(message)).resolves.toEqual({
      providerMessageId: "fake-1",
    });
    expect(provider.messages).toEqual([message]);
  });

  it("classifies official Brevo timeout and response categories", () => {
    const timeout = Object.create(BrevoTimeoutError.prototype);
    const tooManyRequests = Object.assign(Object.create(BrevoError.prototype), {
      statusCode: 429,
      message: "rate limited",
      body: {},
    });
    const quota = Object.assign(Object.create(BrevoError.prototype), {
      statusCode: 400,
      message: "daily sending limit exceeded",
      body: {},
    });

    expect(classifyBrevoError(timeout)).toMatchObject({ kind: "unknown" });
    expect(classifyBrevoError(tooManyRequests)).toMatchObject({
      kind: "rate_limited",
      statusCode: 429,
    });
    expect(classifyBrevoError(quota)).toMatchObject({
      kind: "quota",
      statusCode: 400,
    });
    expect(classifyBrevoError(timeout)).toBeInstanceOf(EmailProviderError);
  });

  it("uses the current Brevo Idempotency-Key payload header", () => {
    const payload = buildBrevoSendPayload(
      { name: "Schedule App", email: "sender@example.com" },
      {
        to: [{ email: "recipient@example.com" }],
        subject: "予定",
        htmlContent: "<p>予定</p>",
        textContent: "予定",
        idempotencyKey: "00000000-0000-4000-8000-000000000000",
      },
    );

    expect(payload.headers).toEqual({
      "Idempotency-Key": "00000000-0000-4000-8000-000000000000",
    });
  });
});
