/** Operational defaults shared by the client and server; change only with the coordinator's agreement. */
const DAY_START = "08:00";
const NIGHT_START = "20:00";

export const SFCC_RULES = {
  timeZone: "America/Fortaleza",
  day: {
    start: DAY_START,
    end: NIGHT_START,
    maxUncoveredMinutes: 60,
  },
  night: {
    start: NIGHT_START,
    end: DAY_START,
    requiresContinuousCoverage: true,
  },
  minimumRestHoursBetweenTurns: 24,
  /** Provisional technical value only; current validation uses exact intervals, not rounding. */
  provisionalGranularityMinutes: 15,
  currency: "BRL",
} as const;
