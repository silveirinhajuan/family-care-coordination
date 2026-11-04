import { describe, expect, it } from "vitest";
import {
  coverageFitsWithinShift,
  isCalendarDate,
  parseBrlToCents,
  ratePeriodsOverlap,
  summarizeCaregiverFinances,
} from "./caregiverFinance";

describe("caregiver finance domain", () => {
  it("validates real calendar dates rather than only the YYYY-MM-DD shape", () => {
    expect(isCalendarDate("2026-11-04")).toBe(true);
    expect(isCalendarDate("2026-02-29")).toBe(false);
    expect(isCalendarDate("04-11-2026")).toBe(false);
  });

  it("parses BRL input exactly into integer cents without rounding", () => {
    expect(parseBrlToCents("1250.50")).toBe(125050);
    expect(parseBrlToCents("1250,5")).toBe(125050);
    expect(parseBrlToCents("0")).toBe(0);
    expect(parseBrlToCents("12.345")).toBeNull();
    expect(parseBrlToCents("R$ 10,00")).toBeNull();
  });

  it("treats vigency ends as inclusive and null as open-ended", () => {
    expect(ratePeriodsOverlap(
      { effectiveFrom: "2026-01-01", effectiveUntil: "2026-03-31" },
      { effectiveFrom: "2026-04-01", effectiveUntil: null },
    )).toBe(false);
    expect(ratePeriodsOverlap(
      { effectiveFrom: "2026-01-01", effectiveUntil: "2026-03-31" },
      { effectiveFrom: "2026-03-31", effectiveUntil: null },
    )).toBe(true);
    expect(ratePeriodsOverlap(
      { effectiveFrom: "2026-01-01", effectiveUntil: null },
      { effectiveFrom: "2027-01-01", effectiveUntil: null },
    )).toBe(true);
  });

  it("accepts full or partial coverage only when it fits within the shift", () => {
    expect(coverageFitsWithinShift(
      "2026-11-04T20:00", "2026-11-05T08:00",
      "2026-11-04T20:00", "2026-11-05T08:00",
    )).toBe(true);
    expect(coverageFitsWithinShift(
      "2026-11-04T20:00", "2026-11-05T08:00",
      "2026-11-04T22:00", "2026-11-05T04:00",
    )).toBe(true);
    expect(coverageFitsWithinShift(
      "2026-11-04T20:00", "2026-11-05T08:00",
      "2026-11-04T19:00", "2026-11-05T04:00",
    )).toBe(false);
  });

  it("keeps paid, pending, future confirmed and unperformed commitments distinct", () => {
    const summary = summarizeCaregiverFinances([
      {
        status: "confirmada",
        shiftStatus: "scheduled",
        startsLocal: "2026-11-06T08:00",
        amountCents: 20000,
        payments: [
          { amountCents: 5000, status: "pago" },
          { amountCents: 3000, status: "pendente" },
          { amountCents: 1000, status: "cancelado" },
        ],
      },
      {
        status: "realizada",
        shiftStatus: "scheduled",
        startsLocal: "2026-11-03T08:00",
        amountCents: 12000,
        payments: [{ amountCents: 12000, status: "pago" }],
      },
      {
        status: "solicitada",
        shiftStatus: "scheduled",
        startsLocal: "2026-11-07T08:00",
        amountCents: null,
        payments: [],
      },
      {
        status: "confirmada",
        shiftStatus: "cancelled",
        startsLocal: "2026-11-08T08:00",
        amountCents: 30000,
        payments: [],
      },
    ], "2026-11-05T12:00");

    expect(summary).toEqual({
      paidCents: 17000,
      pendingCents: 3000,
      contractedNotPerformedCents: 20000,
      futureConfirmedCents: 20000,
    });
  });
});
