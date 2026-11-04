import { describe, expect, it } from "vitest";
import { findScheduleConflict, requiredPeriodsForLocalInterval, validateNoOverlapAndRest, validateShiftCandidate, type AvailabilityRule, type CommitmentRule } from "./scheduling";
import { localDateTimeToIso } from "./time";

const participant = {
  active: true,
};

function available(startsLocal: string, endsLocal: string): AvailabilityRule {
  return { status: "available", recurrence: "once", startsLocal, endsLocal, repeatDays: null, repeatUntil: null };
}

function validate(overrides: Partial<Parameters<typeof validateShiftCandidate>[0]> = {}) {
  return validateShiftCandidate({
    participant,
    availability: [available("2026-11-04T07:00", "2026-11-04T14:00")],
    commitments: [],
    existingShifts: [],
    startsLocal: "2026-11-04T08:00",
    endsLocal: "2026-11-04T12:00",
    ...overrides,
  });
}

describe("SFCC scheduling rules", () => {
  it("classifies day/night periods for integral or partial coverage", () => {
    expect(requiredPeriodsForLocalInterval("2026-11-04T19:00", "2026-11-04T20:00")).toEqual(["day"]);
    expect(requiredPeriodsForLocalInterval("2026-11-04T19:00", "2026-11-04T21:00")).toEqual(["day", "night"]);
    expect(requiredPeriodsForLocalInterval("2026-11-04T23:00", "2026-11-05T03:00")).toEqual(["night"]);
  });

  it("enforces overlap and 24-hour rest for partial caregiver coverage intervals", () => {
    expect(() => validateNoOverlapAndRest("2026-11-04T10:00", "2026-11-04T12:00", [{
      id: 11,
      startsLocal: "2026-11-04T08:00",
      endsLocal: "2026-11-04T10:30",
      status: "scheduled",
    }])).toThrow("sobreposto");
    expect(() => validateNoOverlapAndRest("2026-11-04T14:00", "2026-11-04T15:00", [{
      id: 12,
      startsLocal: "2026-11-04T11:00",
      endsLocal: "2026-11-04T13:00",
      status: "scheduled",
    }])).toThrow("24 horas");
  });

  it("interprets wall time explicitly in Fortaleza", () => {
    expect(localDateTimeToIso("2026-11-04T08:00")).toBe("2026-11-04T11:00:00.000Z");
  });

  it("accepts a shift covered by adjacent availability windows", () => {
    const result = validate({
      availability: [
        available("2026-11-04T08:00", "2026-11-04T10:00"),
        available("2026-11-04T10:00", "2026-11-04T12:00"),
      ],
    });
    expect(result.classification).toBe("diurno");
  });

  it("rejects any explicit unavailable overlap even if availability overlaps too", () => {
    expect(() => validate({
      availability: [
        available("2026-11-04T07:00", "2026-11-04T14:00"),
        { ...available("2026-11-04T10:30", "2026-11-04T11:00"), status: "unavailable" },
      ],
    })).toThrow("declarou indisponibilidade");
  });

  it("distinguishes no availability from a declared availability window", () => {
    expect(() => validate({ availability: [] })).toThrow("Não há disponibilidade informada");
    expect(() => validate({ availability: [available("2026-11-04T09:00", "2026-11-04T13:00")] }))
      .toThrow("não está integralmente contido");
  });

  it("expands a recurring weekly commitment and rejects a conflict", () => {
    const recurring: CommitmentRule = {
      description: "Aula",
      recurrence: "weekly",
      startsLocal: "2026-11-04T09:00",
      endsLocal: "2026-11-04T10:00",
      repeatDays: "3",
      repeatUntil: null,
    };
    expect(() => validate({ commitments: [recurring] })).toThrow("Aula");
  });

  it("does not require hospital authorization data to validate an otherwise eligible shift", () => {
    expect(() => validate({
      startsLocal: "2026-11-04T19:00",
      endsLocal: "2026-11-04T21:00",
      availability: [available("2026-11-04T18:00", "2026-11-04T22:00")],
    })).not.toThrow();
  });

  it("rejects overlapping shifts and less than 24 hours of rest", () => {
    expect(() => validate({
      existingShifts: [{
        id: 8,
        startsLocal: "2026-11-04T11:00",
        endsLocal: "2026-11-04T13:00",
        status: "scheduled",
      }],
    })).toThrow("sobreposto");

    expect(() => validate({
      existingShifts: [{
        id: 9,
        startsLocal: "2026-11-03T16:00",
        endsLocal: "2026-11-03T18:00",
        status: "scheduled",
      }],
    })).toThrow("24 horas");
  });

  it("accepts exactly 24 hours of rest between sequential shifts", () => {
    const result = validate({
      startsLocal: "2026-11-04T12:00",
      endsLocal: "2026-11-04T16:00",
      availability: [available("2026-11-04T12:00", "2026-11-04T16:00")],
      existingShifts: [{
        id: 10,
        startsLocal: "2026-11-03T08:00",
        endsLocal: "2026-11-03T12:00",
        status: "scheduled",
      }],
    });
    expect(result.classification).toBe("diurno");
  });

  it("prioritizes overlap over a rest exception", () => {
    expect(findScheduleConflict("2026-11-04T12:00", "2026-11-04T13:00", [
      { id: 13, startsLocal: "2026-11-03T12:00", endsLocal: "2026-11-03T13:00", status: "scheduled" },
      { id: 14, startsLocal: "2026-11-04T12:30", endsLocal: "2026-11-04T13:30", status: "scheduled" },
    ])).toBe("overlap");
  });

  it("classifies a shift crossing midnight as night and checks its full interval", () => {
    const result = validate({
      startsLocal: "2026-11-04T22:00",
      endsLocal: "2026-11-05T04:00",
      availability: [available("2026-11-04T21:00", "2026-11-05T05:00")],
    });
    expect(result.classification).toBe("noturno");
  });
});
