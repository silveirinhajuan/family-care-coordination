import { describe, expect, it } from "vitest";
import { analyzeCoverage, type CoverageInterval } from "./coverage";

function interval(startsLocal: string, endsLocal: string, overrides: Partial<CoverageInterval> = {}): CoverageInterval {
  return {
    startsLocal,
    endsLocal,
    confirmed: true,
    reason: null,
    ...overrides,
  };
}

describe("SFCC coverage analysis", () => {
  it("allows a daytime gap of exactly 60 consecutive minutes", () => {
    const periods = analyzeCoverage("2026-11-04", "2026-11-04", [
      interval("2026-11-04T08:00", "2026-11-04T09:00"),
      interval("2026-11-04T10:00", "2026-11-04T20:00"),
    ]);
    const day = periods.find(period => period.period === "day");
    expect(day?.status).toBe("gap_allowed");
    expect(day?.gaps).toEqual([{
      startsLocal: "2026-11-04T09:00",
      endsLocal: "2026-11-04T10:00",
      minutes: 60,
      critical: false,
      reason: null,
    }]);
  });

  it("marks a daytime gap longer than 60 minutes as critical", () => {
    const periods = analyzeCoverage("2026-11-04", "2026-11-04", [
      interval("2026-11-04T08:00", "2026-11-04T09:00"),
      interval("2026-11-04T10:01", "2026-11-04T20:00"),
    ]);
    expect(periods.find(period => period.period === "day")?.status).toBe("critical");
    expect(periods.find(period => period.period === "day")?.gaps[0].minutes).toBe(61);
  });

  it("marks any uncovered night interval as critical across midnight", () => {
    const periods = analyzeCoverage("2026-11-04", "2026-11-04", [
      interval("2026-11-04T20:00", "2026-11-04T23:00"),
      interval("2026-11-04T23:01", "2026-11-05T08:00"),
    ]);
    const night = periods.find(period => period.period === "night");
    expect(night?.status).toBe("critical");
    expect(night?.gaps[0].minutes).toBe(1);
  });

  it("merges adjacent confirmed intervals without creating a gap", () => {
    const periods = analyzeCoverage("2026-11-04", "2026-11-04", [
      interval("2026-11-04T08:00", "2026-11-04T14:00"),
      interval("2026-11-04T14:00", "2026-11-04T20:00"),
    ]);
    expect(periods.find(period => period.period === "day")?.status).toBe("covered");
  });

  it("does not count pending intervals and explains the pending candidate", () => {
    const periods = analyzeCoverage("2026-11-04", "2026-11-04", [
      interval("2026-11-04T20:00", "2026-11-05T08:00", {
        confirmed: false,
        reason: "Aguardando confirmação de Felipe.",
      }),
    ]);
    const night = periods.find(period => period.period === "night");
    expect(night?.status).toBe("critical");
    expect(night?.gaps[0].reason).toBe("Aguardando confirmação de Felipe.");
  });

  it("limits a single analysis to 31 calendar days", () => {
    expect(() => analyzeCoverage("2026-11-01", "2026-12-02", [])).toThrow("no máximo 31 dias");
  });
});


describe("normal coverage overlap guard", () => {
  const candidate = (overrides: Partial<import("./coverage").NormalCoverageCandidate> = {}): import("./coverage").NormalCoverageCandidate => ({
    startsLocal: "2026-11-04T10:00",
    endsLocal: "2026-11-04T12:00",
    confirmationStatus: "accepted",
    category: "familiar",
    active: true,
    ...overrides,
  });

  it("blocks caregiver or emergency intervals that overlap accepted normal coverage", async () => {
    const { hasConfirmedNormalCoverageOverlap } = await import("./coverage");
    expect(hasConfirmedNormalCoverageOverlap("2026-11-04T11:00", "2026-11-04T13:00", [candidate()])).toBe(true);
  });

  it("ignores pending, inactive, caregiver-only and adjacent intervals", async () => {
    const { hasConfirmedNormalCoverageOverlap } = await import("./coverage");
    expect(hasConfirmedNormalCoverageOverlap("2026-11-04T11:00", "2026-11-04T13:00", [candidate({ confirmationStatus: "pending" })])).toBe(false);
    expect(hasConfirmedNormalCoverageOverlap("2026-11-04T11:00", "2026-11-04T13:00", [candidate({ active: false })])).toBe(false);
    expect(hasConfirmedNormalCoverageOverlap("2026-11-04T11:00", "2026-11-04T13:00", [candidate({ category: "cuidadora" })])).toBe(false);
    expect(hasConfirmedNormalCoverageOverlap("2026-11-04T12:00", "2026-11-04T13:00", [candidate()])).toBe(false);
  });
});
