import { and, eq, gt, inArray, lt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { SFCC_RULES } from "../../shared/sfccRules";
import {
  caregiverBookings,
  emergencyActivations,
  participants,
  shiftAssignments,
  shifts,
} from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { analyzeCoverage, type CoverageInterval } from "../domain/coverage";
import { isCalendarDate } from "../domain/caregiverFinance";
import { addDaysToDate, daysBetweenDates } from "../domain/time";
import { requireSfccDatabase } from "../db/sfcc";

const inputSchema = z.object({
  dateFrom: z.string().refine(isCalendarDate, "Informe uma data inicial válida."),
  dateTo: z.string().refine(isCalendarDate, "Informe uma data final válida."),
}).superRefine((value, context) => {
  if (value.dateTo < value.dateFrom) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "A data final deve ser igual ou posterior à inicial." });
    return;
  }
  if (daysBetweenDates(value.dateFrom, value.dateTo) > 30) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "A análise pode abranger no máximo 31 dias por consulta." });
  }
});

function interval(
  startsLocal: string,
  endsLocal: string,
  confirmed: boolean,
  reason: string | null,
): CoverageInterval {
  return { startsLocal, endsLocal, confirmed, reason };
}

export const coverageRouter = router({
  analyze: protectedProcedure.input(inputSchema).query(async ({ input }) => {
    const database = await requireSfccDatabase();
    const rangeStart = `${input.dateFrom}T08:00`;
    const rangeEnd = `${addDaysToDate(input.dateTo, 1)}T08:00`;
    const intervals: CoverageInterval[] = [];

    const assignments = await database.select({
      startsLocal: shifts.startsLocal,
      endsLocal: shifts.endsLocal,
      confirmationStatus: shiftAssignments.confirmationStatus,
      participantName: participants.displayName,
      participantActive: participants.active,
    }).from(shifts)
      .innerJoin(shiftAssignments, eq(shiftAssignments.shiftId, shifts.id))
      .innerJoin(participants, eq(shiftAssignments.participantId, participants.id))
      .where(and(
        eq(shifts.status, "scheduled"),
        lt(shifts.startsLocal, rangeEnd),
        gt(shifts.endsLocal, rangeStart),
      ));

    for (const assignment of assignments) {
      const confirmed = assignment.participantActive && assignment.confirmationStatus === "accepted";
      const reason = !assignment.participantActive
        ? `${assignment.participantName} está inativo.`
        : confirmed
          ? null
        : assignment.confirmationStatus === "declined"
          ? `O turno de ${assignment.participantName} foi recusado.`
          : assignment.confirmationStatus === "cancelled"
            ? `A atribuição de ${assignment.participantName} foi cancelada.`
            : `Aguardando confirmação de ${assignment.participantName}.`;
      intervals.push(interval(
        assignment.startsLocal,
        assignment.endsLocal,
        confirmed,
        reason,
      ));
    }

    const bookings = await database.select({
      startsLocal: caregiverBookings.coverageStartsLocal,
      endsLocal: caregiverBookings.coverageEndsLocal,
      bookingStatus: caregiverBookings.status,
      caregiverName: participants.displayName,
      caregiverActive: participants.active,
    }).from(caregiverBookings)
      .innerJoin(shifts, eq(caregiverBookings.shiftId, shifts.id))
      .innerJoin(participants, eq(caregiverBookings.caregiverParticipantId, participants.id))
      .where(and(
        eq(shifts.status, "scheduled"),
        inArray(caregiverBookings.status, ["solicitada", "disponível", "indisponível", "recusada", "confirmada", "realizada"]),
        lt(caregiverBookings.coverageStartsLocal, rangeEnd),
        gt(caregiverBookings.coverageEndsLocal, rangeStart),
      ));

    for (const booking of bookings) {
      const confirmed = booking.caregiverActive && (booking.bookingStatus === "confirmada" || booking.bookingStatus === "realizada");
      const reason = !booking.caregiverActive
        ? `${booking.caregiverName} está inativa.`
        : confirmed ? null : `Contratação de ${booking.caregiverName}: ${booking.bookingStatus}.`;
      intervals.push(interval(
        booking.startsLocal,
        booking.endsLocal,
        confirmed,
        reason,
      ));
    }

    const activations = await database.select({
      startsLocal: emergencyActivations.startsLocal,
      endsLocal: emergencyActivations.endsLocal,
      status: emergencyActivations.status,
      participantName: participants.displayName,
      participantActive: participants.active,
    }).from(emergencyActivations)
      .innerJoin(participants, eq(emergencyActivations.participantId, participants.id))
      .where(and(
        inArray(emergencyActivations.status, ["solicitada", "aceita"]),
        lt(emergencyActivations.startsLocal, rangeEnd),
        gt(emergencyActivations.endsLocal, rangeStart),
      ));

    for (const activation of activations) {
      const confirmed = activation.participantActive && activation.status === "aceita";
      const reason = !activation.participantActive
        ? `${activation.participantName} está inativo.`
        : confirmed ? null : `Acionamento de ${activation.participantName} aguardando resposta.`;
      intervals.push(interval(
        activation.startsLocal,
        activation.endsLocal,
        confirmed,
        reason,
      ));
    }

    try {
      return {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        maxDayGapMinutes: SFCC_RULES.day.maxUncoveredMinutes,
        periods: analyzeCoverage(input.dateFrom, input.dateTo, intervals),
      };
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : "Não foi possível analisar a cobertura.",
      });
    }
  }),
});
