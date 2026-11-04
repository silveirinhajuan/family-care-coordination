import { describe, expect, it } from "vitest";
import { ownAvailabilityInputSchema, selfRegistrationInputSchema } from "./inputs";

describe("self-service family registration", () => {
  it("trims the user's name and requires a relationship to pessoa acompanhada", () => {
    expect(selfRegistrationInputSchema.parse({
      displayName: "  Ana Souza  ",
      relationshipToCareRecipient: " filha ",
    })).toEqual({ displayName: "Ana Souza", relationshipToCareRecipient: "filha" });

    expect(selfRegistrationInputSchema.safeParse({
      displayName: "Ana Souza",
      relationshipToCareRecipient: "   ",
    }).success).toBe(false);
  });

  it("accepts a complete personal availability window but strips any forged participant id", () => {
    const parsed = ownAvailabilityInputSchema.parse({
      status: "available",
      recurrence: "once",
      startsLocal: "2026-11-05T10:00",
      endsLocal: "2026-11-05T12:00",
      repeatDays: [],
      repeatUntil: null,
      participantId: 999,
    });

    expect(parsed).not.toHaveProperty("participantId");
    expect(parsed.status).toBe("available");
  });
});
