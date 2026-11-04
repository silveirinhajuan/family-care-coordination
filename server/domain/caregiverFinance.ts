import { formatBrlCents, parseBrlToCents } from "../../shared/caregiverFinance";

import { localDateTimeToEpoch } from "./time";

export { formatBrlCents, parseBrlToCents };

export type RatePeriod = {
  id?: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
};

export type FinancialBooking = {
  status: "solicitada" | "disponível" | "indisponível" | "recusada" | "confirmada" | "cancelada" | "realizada";
  shiftStatus: "scheduled" | "cancelled";
  startsLocal: string;
  amountCents: number | null;
  payments: Array<{ amountCents: number; status: "pendente" | "pago" | "cancelado" }>;
};

export type CaregiverFinancialSummary = {
  paidCents: number;
  pendingCents: number;
  contractedNotPerformedCents: number;
  futureConfirmedCents: number;
};

export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

export function ratePeriodsOverlap(a: RatePeriod, b: RatePeriod): boolean {
  // effectiveUntil is inclusive. null means no planned end.
  const aBeforeB = a.effectiveUntil !== null && a.effectiveUntil < b.effectiveFrom;
  const bBeforeA = b.effectiveUntil !== null && b.effectiveUntil < a.effectiveFrom;
  return !aBeforeB && !bBeforeA;
}

export function coverageFitsWithinShift(
  shiftStartsLocal: string,
  shiftEndsLocal: string,
  coverageStartsLocal: string,
  coverageEndsLocal: string,
): boolean {
  const shiftStart = localDateTimeToEpoch(shiftStartsLocal, "Início do turno");
  const shiftEnd = localDateTimeToEpoch(shiftEndsLocal, "Fim do turno");
  const coverageStart = localDateTimeToEpoch(coverageStartsLocal, "Início da cobertura da cuidadora");
  const coverageEnd = localDateTimeToEpoch(coverageEndsLocal, "Fim da cobertura da cuidadora");
  return coverageStart < coverageEnd && coverageStart >= shiftStart && coverageEnd <= shiftEnd;
}

export function summarizeCaregiverFinances(
  bookings: FinancialBooking[],
  nowLocal: string,
): CaregiverFinancialSummary {
  const summary: CaregiverFinancialSummary = {
    paidCents: 0,
    pendingCents: 0,
    contractedNotPerformedCents: 0,
    futureConfirmedCents: 0,
  };

  for (const booking of bookings) {
    for (const payment of booking.payments) {
      if (payment.status === "pago") summary.paidCents += payment.amountCents;
      if (payment.status === "pendente") summary.pendingCents += payment.amountCents;
    }

    if (booking.status !== "confirmada" || booking.shiftStatus !== "scheduled" || booking.amountCents === null) continue;
    summary.contractedNotPerformedCents += booking.amountCents;
    if (booking.startsLocal > nowLocal) summary.futureConfirmedCents += booking.amountCents;
  }

  return summary;
}
