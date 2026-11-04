import { SFCC_RULES } from "../../shared/sfccRules";
import { addDaysToDate, daysBetweenDates, isoToLocalDateTime, localDateTimeToEpoch } from "./time";

export type CoverageInterval = {
  startsLocal: string;
  endsLocal: string;
  confirmed: boolean;
  reason?: string | null;
};

export type CoverageGap = {
  startsLocal: string;
  endsLocal: string;
  minutes: number;
  critical: boolean;
  reason: string | null;
};

export type CoveragePeriodReport = {
  date: string;
  period: "day" | "night";
  startsLocal: string;
  endsLocal: string;
  status: "covered" | "gap_allowed" | "critical";
  gaps: CoverageGap[];
};

export type NormalCoverageCandidate = {
  startsLocal: string;
  endsLocal: string;
  confirmationStatus: "pending" | "accepted" | "declined" | "cancelled";
  category: "familiar" | "cuidadora" | "outros";
  active: boolean;
};

type EpochInterval = CoverageInterval & { start: number; end: number };
type RequiredPeriod = { date: string; period: "day" | "night"; startsLocal: string; endsLocal: string };

function asLocalDateTime(epoch: number): string {
  return isoToLocalDateTime(new Date(epoch).toISOString());
}

function requiredPeriods(dateFrom: string, dateTo: string): RequiredPeriod[] {
  const days = daysBetweenDates(dateFrom, dateTo);
  if (days < 0) throw new Error("A data final deve ser igual ou posterior à data inicial.");
  if (days > 30) throw new Error("A análise de cobertura pode abranger no máximo 31 dias por consulta.");

  const periods: RequiredPeriod[] = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const date = addDaysToDate(dateFrom, offset);
    const nextDate = addDaysToDate(date, 1);
    periods.push({
      date,
      period: "day",
      startsLocal: `${date}T${SFCC_RULES.day.start}`,
      endsLocal: `${date}T${SFCC_RULES.day.end}`,
    });
    periods.push({
      date,
      period: "night",
      startsLocal: `${date}T${SFCC_RULES.night.start}`,
      endsLocal: `${nextDate}T${SFCC_RULES.night.end}`,
    });
  }
  return periods;
}

export function hasConfirmedNormalCoverageOverlap(
  startsLocal: string,
  endsLocal: string,
  candidates: NormalCoverageCandidate[],
): boolean {
  const intervalStart = localDateTimeToEpoch(startsLocal, "Início da cobertura solicitada");
  const intervalEnd = localDateTimeToEpoch(endsLocal, "Fim da cobertura solicitada");
  if (intervalEnd <= intervalStart) throw new Error("O fim da cobertura deve ser posterior ao início.");

  return candidates.some(candidate => {
    if (candidate.confirmationStatus !== "accepted" || !candidate.active || candidate.category === "cuidadora") {
      return false;
    }
    const start = Math.max(intervalStart, localDateTimeToEpoch(candidate.startsLocal));
    const end = Math.min(intervalEnd, localDateTimeToEpoch(candidate.endsLocal));
    if (end <= start) return false;

    return true;
  });
}

export function analyzeCoverage(
  dateFrom: string,
  dateTo: string,
  intervals: CoverageInterval[],
): CoveragePeriodReport[] {
  const normalized: EpochInterval[] = intervals.map(interval => {
    const start = localDateTimeToEpoch(interval.startsLocal, "Início da cobertura");
    const end = localDateTimeToEpoch(interval.endsLocal, "Fim da cobertura");
    if (end <= start) throw new Error("O fim de uma cobertura deve ser posterior ao início.");
    return { ...interval, start, end };
  });

  return requiredPeriods(dateFrom, dateTo).map(period => {
    const periodStart = localDateTimeToEpoch(period.startsLocal, "Início do período");
    const periodEnd = localDateTimeToEpoch(period.endsLocal, "Fim do período");
    const candidates = normalized.filter(interval => interval.end > periodStart && interval.start < periodEnd);
    const confirmed = candidates
      .filter(interval => interval.confirmed)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    const gaps: CoverageGap[] = [];
    let cursor = periodStart;

    const appendGap = (start: number, end: number) => {
      if (end <= start) return;
      const minutes = (end - start) / 60_000;
      const cause = candidates.find(interval =>
        !interval.confirmed
        && interval.reason
        && interval.start < end
        && interval.end > start,
      );
      gaps.push({
        startsLocal: asLocalDateTime(start),
        endsLocal: asLocalDateTime(end),
        minutes,
        critical: period.period === "night" || minutes > SFCC_RULES.day.maxUncoveredMinutes,
        reason: cause?.reason ?? null,
      });
    };

    for (const interval of confirmed) {
      const start = Math.max(interval.start, periodStart);
      const end = Math.min(interval.end, periodEnd);
      if (start > cursor) appendGap(cursor, start);
      cursor = Math.max(cursor, end);
      if (cursor >= periodEnd) break;
    }
    if (cursor < periodEnd) appendGap(cursor, periodEnd);

    const status = gaps.some(gap => gap.critical)
      ? "critical"
      : gaps.length > 0
        ? "gap_allowed"
        : "covered";
    return { ...period, status, gaps };
  });
}
