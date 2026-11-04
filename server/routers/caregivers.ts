import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  caregiverBookings,
  caregiverPayments,
  caregiverRates,
  participants,
  shiftAssignments,
  shifts,
  users,
} from "../../drizzle/schema";
import { adminProcedure, router } from "../_core/trpc";
import {
  coverageFitsWithinShift,
  isCalendarDate,
  ratePeriodsOverlap,
  summarizeCaregiverFinances,
} from "../domain/caregiverFinance";
import { hasConfirmedNormalCoverageOverlap } from "../domain/coverage";
import { validateNoOverlapAndRest } from "../domain/scheduling";
import { isoToLocalDateTime, isValidLocalDateTime, todayInBusinessTimeZone } from "../domain/time";
import {
  insertedId,
  recordAudit,
  requireSfccDatabase,
  type SfccTransaction,
} from "../db/sfcc";

const dateSchema = z.string().refine(isCalendarDate, "Informe uma data válida.");
const centsSchema = z.number().int().min(0).max(2_000_000_000);
const rateTypeSchema = z.enum(["diurno", "noturno"]);
const localDateTimeSchema = z.string().refine(isValidLocalDateTime, "Informe uma data e hora válidas em Fortaleza.");
const bookingStatusSchema = z.enum([
  "solicitada",
  "disponível",
  "indisponível",
  "recusada",
  "confirmada",
  "cancelada",
  "realizada",
]);
const paymentStatusSchema = z.enum(["pendente", "pago"]);
const bookedCaregiver = alias(participants, "booked_caregiver");

const rateInputSchema = z.object({
  caregiverParticipantId: z.number().int().positive(),
  shiftType: rateTypeSchema,
  amountCents: centsSchema,
  effectiveFrom: dateSchema,
  effectiveUntil: dateSchema.nullable().optional(),
}).superRefine((value, context) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveUntil"], message: "A data final deve ser igual ou posterior à inicial." });
  }
});

const rateUpdateInputSchema = z.object({
  id: z.number().int().positive(),
  amountCents: centsSchema,
  effectiveFrom: dateSchema,
  effectiveUntil: dateSchema.nullable().optional(),
}).superRefine((value, context) => {
  if (value.effectiveUntil && value.effectiveUntil < value.effectiveFrom) {
    context.addIssue({ code: "custom", path: ["effectiveUntil"], message: "A data final deve ser igual ou posterior à inicial." });
  }
});

const bookingCreateSchema = z.object({
  shiftId: z.number().int().positive(),
  caregiverParticipantId: z.number().int().positive(),
  coverageStartsLocal: localDateTimeSchema,
  coverageEndsLocal: localDateTimeSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
});

const bookingUpdateSchema = z.object({
  id: z.number().int().positive(),
  status: bookingStatusSchema,
  amountCents: centsSchema.nullable().optional(),
  cancellationFeeCents: centsSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const paymentCreateSchema = z.object({
  caregiverBookingId: z.number().int().positive(),
  amountCents: z.number().int().positive().max(2_000_000_000),
  status: paymentStatusSchema,
  paidOn: dateSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).superRefine((value, context) => {
  if (value.status === "pago" && !value.paidOn) {
    context.addIssue({ code: "custom", path: ["paidOn"], message: "Informe a data do pagamento." });
  }
  if (value.status === "pendente" && value.paidOn) {
    context.addIssue({ code: "custom", path: ["paidOn"], message: "Pagamento pendente não deve ter data de quitação." });
  }
});

const paymentUpdateSchema = z.object({
  id: z.number().int().positive(),
  status: paymentStatusSchema,
  paidOn: dateSchema.nullable().optional(),
}).superRefine((value, context) => {
  if (value.status === "pago" && !value.paidOn) {
    context.addIssue({ code: "custom", path: ["paidOn"], message: "Informe a data do pagamento." });
  }
  if (value.status === "pendente" && value.paidOn) {
    context.addIssue({ code: "custom", path: ["paidOn"], message: "Pagamento pendente não deve ter data de quitação." });
  }
});

const reportInputSchema = z.object({
  dateFrom: dateSchema,
  dateTo: dateSchema,
  caregiverParticipantId: z.number().int().positive().nullable().optional(),
  shiftType: z.enum(["diurno", "noturno", "misto"]).nullable().optional(),
}).superRefine((value, context) => {
  if (value.dateTo < value.dateFrom) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "O fim do período deve ser igual ou posterior ao início." });
  }
});

async function lockCaregiver(tx: SfccTransaction, id: number, requireActive = true) {
  const [caregiver] = await tx.select({
    id: participants.id,
    category: participants.category,
    active: participants.active,
  })
    .from(participants)
    .where(eq(participants.id, id))
    .limit(1)
    .for("update");
  if (!caregiver || caregiver.category !== "cuidadora") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Cuidadora não encontrada." });
  }
  if (requireActive && !caregiver.active) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A cuidadora está inativa e não pode receber novas tarifas ou contratações." });
  }
  return caregiver;
}

async function lockShift(tx: SfccTransaction, id: number, requireScheduled = true) {
  const [shift] = await tx.select({
    id: shifts.id,
    startsLocal: shifts.startsLocal,
    endsLocal: shifts.endsLocal,
    classification: shifts.classification,
    status: shifts.status,
  }).from(shifts).where(eq(shifts.id, id)).limit(1).for("update");
  if (!shift) throw new TRPCError({ code: "NOT_FOUND", message: "Turno não encontrado." });
  if (requireScheduled && shift.status !== "scheduled") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível contratar cuidadora para um turno cancelado." });
  }
  return shift;
}

async function assertRateHasNoOverlap(
  tx: SfccTransaction,
  caregiverParticipantId: number,
  shiftType: "diurno" | "noturno",
  period: { effectiveFrom: string; effectiveUntil: string | null; id?: number },
): Promise<void> {
  const existing = await tx.select({ id: caregiverRates.id, effectiveFrom: caregiverRates.effectiveFrom, effectiveUntil: caregiverRates.effectiveUntil })
    .from(caregiverRates)
    .where(and(
      eq(caregiverRates.caregiverParticipantId, caregiverParticipantId),
      eq(caregiverRates.shiftType, shiftType),
    ));
  if (existing.some(rate => rate.id !== period.id && ratePeriodsOverlap(rate, period))) {
    throw new TRPCError({ code: "CONFLICT", message: "Essa vigência se sobrepõe a outra tarifa da mesma cuidadora e período." });
  }
}

const allowedTransitions: Record<z.infer<typeof bookingStatusSchema>, readonly z.infer<typeof bookingStatusSchema>[]> = {
  solicitada: ["disponível", "indisponível", "recusada", "confirmada", "cancelada"],
  disponível: ["indisponível", "recusada", "confirmada", "cancelada"],
  indisponível: [],
  recusada: [],
  confirmada: ["cancelada", "realizada"],
  cancelada: [],
  realizada: [],
};

export const caregiversRouter = router({
  directory: adminProcedure.query(async () => {
    const database = await requireSfccDatabase();
    return database.select({
      id: participants.id,
      displayName: participants.displayName,
      active: participants.active,
    }).from(participants).where(and(
      eq(participants.category, "cuidadora"),
      eq(participants.active, true),
    )).orderBy(asc(participants.displayName));
  }),

  bookableShifts: adminProcedure.query(async () => {
    const database = await requireSfccDatabase();
    const rows = await database.select({
      id: shifts.id,
      startsLocal: shifts.startsLocal,
      endsLocal: shifts.endsLocal,
      classification: shifts.classification,
      status: shifts.status,
    }).from(shifts)
      .where(eq(shifts.status, "scheduled"))
      .orderBy(asc(shifts.startsLocal))
      .limit(500);
    if (rows.length === 0) return [];
    const assignmentRows = await database.select({
      shiftId: shiftAssignments.shiftId,
      participantName: participants.displayName,
    }).from(shiftAssignments)
      .innerJoin(participants, eq(shiftAssignments.participantId, participants.id))
      .where(inArray(shiftAssignments.shiftId, rows.map(row => row.id)));
    const namesByShift = new Map<number, string[]>();
    for (const assignment of assignmentRows) {
      const names = namesByShift.get(assignment.shiftId) ?? [];
      names.push(assignment.participantName);
      namesByShift.set(assignment.shiftId, names);
    }
    return rows.map(row => ({ ...row, assignedParticipantNames: namesByShift.get(row.id) ?? [] }));
  }),

  rates: router({
    list: adminProcedure.query(async () => {
      const database = await requireSfccDatabase();
      return database.select({
        id: caregiverRates.id,
        caregiverParticipantId: caregiverRates.caregiverParticipantId,
        caregiverName: participants.displayName,
        caregiverActive: participants.active,
        shiftType: caregiverRates.shiftType,
        amountCents: caregiverRates.amountCents,
        effectiveFrom: caregiverRates.effectiveFrom,
        effectiveUntil: caregiverRates.effectiveUntil,
        createdAt: caregiverRates.createdAt,
        createdByName: users.name,
      }).from(caregiverRates)
        .innerJoin(participants, eq(caregiverRates.caregiverParticipantId, participants.id))
        .innerJoin(users, eq(caregiverRates.createdBy, users.id))
        .orderBy(asc(participants.displayName), asc(caregiverRates.shiftType), desc(caregiverRates.effectiveFrom));
    }),

    create: adminProcedure.input(rateInputSchema).mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        await lockCaregiver(tx, input.caregiverParticipantId);
        const period = { effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil ?? null };
        await assertRateHasNoOverlap(tx, input.caregiverParticipantId, input.shiftType, period);
        const result = await tx.insert(caregiverRates).values({
          caregiverParticipantId: input.caregiverParticipantId,
          shiftType: input.shiftType,
          amountCents: input.amountCents,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil ?? null,
          createdBy: ctx.user.id,
        });
        const id = insertedId(result);
        await recordAudit(tx, ctx.user.id, "caregiver_rate.created", "caregiver_rate", id);
        return { id };
      });
    }),

    update: adminProcedure.input(rateUpdateInputSchema).mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        const [existing] = await tx.select().from(caregiverRates)
          .where(eq(caregiverRates.id, input.id)).limit(1).for("update");
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tarifa não encontrada." });
        await lockCaregiver(tx, existing.caregiverParticipantId, false);
        const period = { id: existing.id, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil ?? null };
        await assertRateHasNoOverlap(tx, existing.caregiverParticipantId, existing.shiftType, period);
        await tx.update(caregiverRates).set({
          amountCents: input.amountCents,
          effectiveFrom: input.effectiveFrom,
          effectiveUntil: input.effectiveUntil ?? null,
        }).where(eq(caregiverRates.id, input.id));
        await recordAudit(tx, ctx.user.id, "caregiver_rate.updated", "caregiver_rate", input.id);
        return { id: input.id };
      });
    }),
  }),

  bookings: router({
    list: adminProcedure.query(async () => {
      const database = await requireSfccDatabase();
      const rows = await database.select({
        id: caregiverBookings.id,
        shiftId: caregiverBookings.shiftId,
        startsLocal: shifts.startsLocal,
        endsLocal: shifts.endsLocal,
        coverageStartsLocal: caregiverBookings.coverageStartsLocal,
        coverageEndsLocal: caregiverBookings.coverageEndsLocal,
        shiftClassification: shifts.classification,
        shiftStatus: shifts.status,
        caregiverParticipantId: caregiverBookings.caregiverParticipantId,
        caregiverName: bookedCaregiver.displayName,
        createdByName: users.name,
        status: caregiverBookings.status,
        amountCents: caregiverBookings.amountCents,
        cancellationFeeCents: caregiverBookings.cancellationFeeCents,
        notes: caregiverBookings.notes,
        createdAt: caregiverBookings.createdAt,
      }).from(caregiverBookings)
        .innerJoin(shifts, eq(caregiverBookings.shiftId, shifts.id))
        .innerJoin(bookedCaregiver, eq(caregiverBookings.caregiverParticipantId, bookedCaregiver.id))
        .innerJoin(users, eq(caregiverBookings.createdBy, users.id))
        .orderBy(desc(shifts.startsLocal), desc(caregiverBookings.createdAt))
        .limit(500);
      if (rows.length === 0) return [];
      const assignmentRows = await database.select({
        shiftId: shiftAssignments.shiftId,
        participantName: participants.displayName,
      }).from(shiftAssignments)
        .innerJoin(participants, eq(shiftAssignments.participantId, participants.id))
        .where(inArray(shiftAssignments.shiftId, [...new Set(rows.map(row => row.shiftId))]));
      const namesByShift = new Map<number, string[]>();
      for (const assignment of assignmentRows) {
        const names = namesByShift.get(assignment.shiftId) ?? [];
        names.push(assignment.participantName);
        namesByShift.set(assignment.shiftId, names);
      }
      return rows.map(row => ({ ...row, assignedParticipantNames: namesByShift.get(row.shiftId) ?? [] }));
    }),

    createAttempt: adminProcedure.input(bookingCreateSchema).mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        const shift = await lockShift(tx, input.shiftId);
        await lockCaregiver(tx, input.caregiverParticipantId);
        if (!coverageFitsWithinShift(shift.startsLocal, shift.endsLocal, input.coverageStartsLocal, input.coverageEndsLocal)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A cobertura da cuidadora deve ficar integralmente dentro do turno e ter início antes do fim." });
        }
        const normalAssignments = await tx.select({
          startsLocal: shifts.startsLocal,
          endsLocal: shifts.endsLocal,
          confirmationStatus: shiftAssignments.confirmationStatus,
          category: participants.category,
          active: participants.active,
        }).from(shiftAssignments)
          .innerJoin(shifts, eq(shiftAssignments.shiftId, shifts.id))
          .innerJoin(participants, eq(shiftAssignments.participantId, participants.id))
          .where(eq(shiftAssignments.shiftId, shift.id));
        if (hasConfirmedNormalCoverageOverlap(input.coverageStartsLocal, input.coverageEndsLocal, normalAssignments)) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Já há acompanhante confirmado cobrindo parte deste intervalo. Ajuste a tentativa para cobrir somente a lacuna." });
        }
        const [confirmed] = await tx.select({ id: caregiverBookings.id }).from(caregiverBookings)
          .where(and(eq(caregiverBookings.shiftId, input.shiftId), eq(caregiverBookings.status, "confirmada")))
          .limit(1);
        if (confirmed) throw new TRPCError({ code: "CONFLICT", message: "Esse turno já tem uma cuidadora confirmada." });
        const [existing] = await tx.select({ id: caregiverBookings.id }).from(caregiverBookings)
          .where(and(
            eq(caregiverBookings.shiftId, input.shiftId),
            eq(caregiverBookings.caregiverParticipantId, input.caregiverParticipantId),
          )).limit(1);
        if (existing) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma tentativa registrada para essa cuidadora e esse turno." });
        const result = await tx.insert(caregiverBookings).values({
          shiftId: shift.id,
          coverageStartsLocal: input.coverageStartsLocal,
          coverageEndsLocal: input.coverageEndsLocal,
          caregiverParticipantId: input.caregiverParticipantId,
          status: "solicitada",
          notes: input.notes ?? null,
          createdBy: ctx.user.id,
        });
        const id = insertedId(result);
        await recordAudit(tx, ctx.user.id, "caregiver_booking.requested", "caregiver_booking", id);
        return { id };
      });
    }),

    update: adminProcedure.input(bookingUpdateSchema).mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        const [header] = await tx.select({ shiftId: caregiverBookings.shiftId }).from(caregiverBookings)
          .where(eq(caregiverBookings.id, input.id)).limit(1);
        if (!header) throw new TRPCError({ code: "NOT_FOUND", message: "Tentativa ou contratação não encontrada." });
        const shift = await lockShift(tx, header.shiftId, false);
        const [existing] = await tx.select().from(caregiverBookings)
          .where(eq(caregiverBookings.id, input.id)).limit(1).for("update");
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Tentativa ou contratação não encontrada." });
        if (existing.status !== input.status && !allowedTransitions[existing.status].includes(input.status)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Não é possível mudar de “${existing.status}” para “${input.status}”.` });
        }
        const nextAmount = input.amountCents === undefined ? existing.amountCents : input.amountCents;
        const nextCancellationFee = input.cancellationFeeCents === undefined
          ? existing.cancellationFeeCents
          : input.cancellationFeeCents;
        const nextNotes = input.notes === undefined ? existing.notes : input.notes;

        const isLateCancellationFee = input.status === "cancelada"
          && existing.status === "cancelada"
          && existing.cancellationFeeCents === null
          && input.cancellationFeeCents !== undefined
          && input.cancellationFeeCents !== null;
        if (input.status === "cancelada" && existing.status !== "confirmada" && !isLateCancellationFee
          && input.cancellationFeeCents !== undefined && input.cancellationFeeCents !== existing.cancellationFeeCents) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O custo só pode ser informado ao cancelar uma contratação ou quando um custo ainda desconhecido for confirmado posteriormente." });
        }

        if (input.status === "confirmada") {
          await lockCaregiver(tx, existing.caregiverParticipantId);
          const assignedShifts = await tx.select({
            id: shifts.id,
            startsLocal: shifts.startsLocal,
            endsLocal: shifts.endsLocal,
            status: shifts.status,
          }).from(shifts)
            .innerJoin(shiftAssignments, eq(shiftAssignments.shiftId, shifts.id))
            .where(and(eq(shiftAssignments.participantId, existing.caregiverParticipantId), eq(shifts.status, "scheduled")));
          const otherBookings = await tx.select({
            id: caregiverBookings.id,
            startsLocal: caregiverBookings.coverageStartsLocal,
            endsLocal: caregiverBookings.coverageEndsLocal,
          }).from(caregiverBookings)
            .where(and(
              eq(caregiverBookings.caregiverParticipantId, existing.caregiverParticipantId),
              inArray(caregiverBookings.status, ["confirmada", "realizada"]),
            ));
          try {
            validateNoOverlapAndRest(existing.coverageStartsLocal, existing.coverageEndsLocal, [
              ...assignedShifts,
              ...otherBookings.filter(booking => booking.id !== existing.id).map(booking => ({
                id: -booking.id,
                startsLocal: booking.startsLocal,
                endsLocal: booking.endsLocal,
                status: "scheduled" as const,
              })),
            ]);
          } catch (error) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: error instanceof Error ? error.message : "Não foi possível validar o descanso da cuidadora.",
            });
          }
          if (nextAmount === null) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o valor efetivamente combinado antes de confirmar a contratação." });
          }
          const [otherConfirmed] = await tx.select({ id: caregiverBookings.id }).from(caregiverBookings)
            .where(and(
              eq(caregiverBookings.shiftId, existing.shiftId),
              eq(caregiverBookings.status, "confirmada"),
            )).limit(1);
          if (otherConfirmed && otherConfirmed.id !== existing.id) {
            throw new TRPCError({ code: "CONFLICT", message: "Esse turno já tem outra cuidadora confirmada." });
          }
        }

        if (input.status === "realizada") {
          if (isoToLocalDateTime(new Date().toISOString()) < existing.coverageEndsLocal) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Só marque como realizada depois do fim da cobertura da cuidadora." });
          }
        }

        if (input.status === "cancelada" && existing.status === "confirmada") {
          const payments = await tx.select().from(caregiverPayments)
            .where(eq(caregiverPayments.caregiverBookingId, existing.id)).for("update");
          if (payments.some(payment => payment.status === "pago")) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Há pagamento já registrado. Regularize esse pagamento antes de cancelar a contratação." });
          }
          for (const payment of payments.filter(item => item.status === "pendente")) {
            await tx.update(caregiverPayments).set({ status: "cancelado", paidOn: null })
              .where(eq(caregiverPayments.id, payment.id));
            await recordAudit(tx, ctx.user.id, "caregiver_payment.cancelled_with_booking", "caregiver_payment", payment.id);
          }
          if (nextCancellationFee !== null && nextCancellationFee > 0) {
            const result = await tx.insert(caregiverPayments).values({
              caregiverBookingId: existing.id,
              amountCents: nextCancellationFee,
              status: "pendente",
              paidOn: null,
              notes: "Custo de cancelamento informado pela coordenação.",
              createdBy: ctx.user.id,
            });
            const paymentId = insertedId(result);
            await recordAudit(tx, ctx.user.id, "caregiver_payment.cancellation_fee_recorded", "caregiver_payment", paymentId);
          }
        } else if (isLateCancellationFee && nextCancellationFee !== null && nextCancellationFee > 0) {
          const result = await tx.insert(caregiverPayments).values({
            caregiverBookingId: existing.id,
            amountCents: nextCancellationFee,
            status: "pendente",
            paidOn: null,
            notes: "Custo de cancelamento informado posteriormente pela coordenação.",
            createdBy: ctx.user.id,
          });
          const paymentId = insertedId(result);
          await recordAudit(tx, ctx.user.id, "caregiver_payment.late_cancellation_fee_recorded", "caregiver_payment", paymentId);
        } else if (input.cancellationFeeCents !== undefined && input.status !== "cancelada") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O custo de cancelamento só pode ser informado ao cancelar uma contratação." });
        }

        if (input.status !== "confirmada" && input.amountCents !== undefined
          && input.amountCents !== existing.amountCents && input.status !== "realizada") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O valor combinado só pode ser alterado ao confirmar a contratação." });
        }

        await tx.update(caregiverBookings).set({
          status: input.status,
          amountCents: nextAmount,
          cancellationFeeCents: input.status === "cancelada" ? nextCancellationFee : existing.cancellationFeeCents,
          notes: nextNotes,
        }).where(eq(caregiverBookings.id, existing.id));
        await recordAudit(tx, ctx.user.id, `caregiver_booking.${input.status}`, "caregiver_booking", existing.id);
        return { id: existing.id, status: input.status };
      });
    }),
  }),

  payments: router({
    list: adminProcedure.query(async () => {
      const database = await requireSfccDatabase();
      return database.select({
        id: caregiverPayments.id,
        caregiverBookingId: caregiverPayments.caregiverBookingId,
        amountCents: caregiverPayments.amountCents,
        status: caregiverPayments.status,
        paidOn: caregiverPayments.paidOn,
        notes: caregiverPayments.notes,
        createdAt: caregiverPayments.createdAt,
        bookingStatus: caregiverBookings.status,
        startsLocal: shifts.startsLocal,
        endsLocal: shifts.endsLocal,
        coverageStartsLocal: caregiverBookings.coverageStartsLocal,
        coverageEndsLocal: caregiverBookings.coverageEndsLocal,
        shiftClassification: shifts.classification,
        caregiverName: participants.displayName,
      }).from(caregiverPayments)
        .innerJoin(caregiverBookings, eq(caregiverPayments.caregiverBookingId, caregiverBookings.id))
        .innerJoin(shifts, eq(caregiverBookings.shiftId, shifts.id))
        .innerJoin(participants, eq(caregiverBookings.caregiverParticipantId, participants.id))
        .orderBy(desc(caregiverPayments.createdAt))
        .limit(500);
    }),

    create: adminProcedure.input(paymentCreateSchema).mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        const [booking] = await tx.select().from(caregiverBookings)
          .where(eq(caregiverBookings.id, input.caregiverBookingId)).limit(1).for("update");
        if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Contratação não encontrada." });
        let amountDue: number;
        if (booking.status === "cancelada") {
          if (booking.cancellationFeeCents === null) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "O custo de cancelamento ainda não foi informado." });
          }
          amountDue = booking.cancellationFeeCents;
        } else if (booking.status === "confirmada" || booking.status === "realizada") {
          if (booking.amountCents === null) throw new TRPCError({ code: "BAD_REQUEST", message: "A contratação não tem valor combinado registrado." });
          amountDue = booking.amountCents;
        } else {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível registrar pagamento de uma contratação confirmada ou realizada, ou de custo de cancelamento informado." });
        }
        const existingPayments = await tx.select({ amountCents: caregiverPayments.amountCents, status: caregiverPayments.status })
          .from(caregiverPayments).where(eq(caregiverPayments.caregiverBookingId, booking.id));
        const activeTotal = existingPayments
          .filter(payment => payment.status !== "cancelado")
          .reduce((total, payment) => total + payment.amountCents, 0);
        if (activeTotal + input.amountCents > amountDue) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O total dos pagamentos excede o valor devido registrado." });
        }
        const result = await tx.insert(caregiverPayments).values({
          caregiverBookingId: booking.id,
          amountCents: input.amountCents,
          status: input.status,
          paidOn: input.status === "pago" ? input.paidOn! : null,
          notes: input.notes ?? null,
          createdBy: ctx.user.id,
        });
        const id = insertedId(result);
        await recordAudit(tx, ctx.user.id, "caregiver_payment.created", "caregiver_payment", id);
        return { id };
      });
    }),

    update: adminProcedure.input(paymentUpdateSchema).mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        const [existing] = await tx.select().from(caregiverPayments)
          .where(eq(caregiverPayments.id, input.id)).limit(1).for("update");
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Pagamento não encontrado." });
        if (existing.status === "cancelado") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Pagamento cancelado não pode ser reaberto." });
        }
        await tx.update(caregiverPayments).set({
          status: input.status,
          paidOn: input.status === "pago" ? input.paidOn! : null,
        }).where(eq(caregiverPayments.id, input.id));
        await recordAudit(tx, ctx.user.id, `caregiver_payment.${input.status}`, "caregiver_payment", input.id);
        return { id: input.id, status: input.status };
      });
    }),
  }),

  report: adminProcedure.input(reportInputSchema).query(async ({ input }) => {
    const database = await requireSfccDatabase();
    const filters: SQL[] = [
      gte(shifts.startsLocal, `${input.dateFrom}T00:00`),
      lte(shifts.startsLocal, `${input.dateTo}T23:59`),
    ];
    if (input.caregiverParticipantId) filters.push(eq(caregiverBookings.caregiverParticipantId, input.caregiverParticipantId));
    if (input.shiftType) filters.push(eq(shifts.classification, input.shiftType));

    const bookingRows = await database.select({
      bookingId: caregiverBookings.id,
      shiftId: shifts.id,
      startsLocal: shifts.startsLocal,
      endsLocal: shifts.endsLocal,
      coverageStartsLocal: caregiverBookings.coverageStartsLocal,
      coverageEndsLocal: caregiverBookings.coverageEndsLocal,
      shiftType: shifts.classification,
      shiftStatus: shifts.status,
      caregiverParticipantId: caregiverBookings.caregiverParticipantId,
      caregiverName: participants.displayName,
      bookingStatus: caregiverBookings.status,
      amountCents: caregiverBookings.amountCents,
      cancellationFeeCents: caregiverBookings.cancellationFeeCents,
      notes: caregiverBookings.notes,
    }).from(caregiverBookings)
      .innerJoin(shifts, eq(caregiverBookings.shiftId, shifts.id))
      .innerJoin(participants, eq(caregiverBookings.caregiverParticipantId, participants.id))
      .where(and(...filters))
      .orderBy(asc(shifts.startsLocal), asc(participants.displayName));

    const bookingIds = bookingRows.map(row => row.bookingId);
    const paymentRows = bookingIds.length === 0 ? [] : await database.select({
      id: caregiverPayments.id,
      caregiverBookingId: caregiverPayments.caregiverBookingId,
      amountCents: caregiverPayments.amountCents,
      status: caregiverPayments.status,
      paidOn: caregiverPayments.paidOn,
      notes: caregiverPayments.notes,
    }).from(caregiverPayments)
      .where(inArray(caregiverPayments.caregiverBookingId, bookingIds))
      .orderBy(asc(caregiverPayments.createdAt));

    const paymentsByBooking = new Map<number, typeof paymentRows>();
    for (const payment of paymentRows) {
      const list = paymentsByBooking.get(payment.caregiverBookingId) ?? [];
      list.push(payment);
      paymentsByBooking.set(payment.caregiverBookingId, list);
    }
    const rows = bookingRows.map(row => ({
      ...row,
      payments: paymentsByBooking.get(row.bookingId) ?? [],
    }));
    const paymentDateFilters: SQL[] = [
      eq(caregiverPayments.status, "pago"),
      gte(caregiverPayments.paidOn, input.dateFrom),
      lte(caregiverPayments.paidOn, input.dateTo),
    ];
    if (input.caregiverParticipantId) {
      paymentDateFilters.push(eq(caregiverBookings.caregiverParticipantId, input.caregiverParticipantId));
    }
    if (input.shiftType) paymentDateFilters.push(eq(shifts.classification, input.shiftType));
    const paymentDateRows = await database.select({ amountCents: caregiverPayments.amountCents })
      .from(caregiverPayments)
      .innerJoin(caregiverBookings, eq(caregiverPayments.caregiverBookingId, caregiverBookings.id))
      .innerJoin(shifts, eq(caregiverBookings.shiftId, shifts.id))
      .where(and(...paymentDateFilters));
    const paidOnDateRangeCents = paymentDateRows.reduce((total, payment) => total + payment.amountCents, 0);
    const summary = summarizeCaregiverFinances(rows.map(row => ({
      status: row.bookingStatus,
      shiftStatus: row.shiftStatus,
      startsLocal: row.startsLocal,
      amountCents: row.amountCents,
      payments: row.payments,
    })), isoToLocalDateTime(new Date().toISOString()));

    const daily = new Map<string, {
      date: string;
      paidCents: number;
      pendingCents: number;
      contractedNotPerformedCents: number;
      futureConfirmedCents: number;
    }>();
    for (const row of rows) {
      const date = row.startsLocal.slice(0, 10);
      const value = daily.get(date) ?? {
        date,
        paidCents: 0,
        pendingCents: 0,
        contractedNotPerformedCents: 0,
        futureConfirmedCents: 0,
      };
      for (const payment of row.payments) {
        if (payment.status === "pago") value.paidCents += payment.amountCents;
        if (payment.status === "pendente") value.pendingCents += payment.amountCents;
      }
      if (row.bookingStatus === "confirmada" && row.shiftStatus === "scheduled" && row.amountCents !== null) {
        value.contractedNotPerformedCents += row.amountCents;
        if (row.startsLocal > isoToLocalDateTime(new Date().toISOString())) {
          value.futureConfirmedCents += row.amountCents;
        }
      }
      daily.set(date, value);
    }

    return {
      filters: input,
      periodBasis: "Contratações e previsão pela data de início do turno; total pago no período pela data de quitação.",
      summary: { ...summary, paidOnDateRangeCents },
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
      rows,
      generatedOn: todayInBusinessTimeZone(),
    };
  }),
});
