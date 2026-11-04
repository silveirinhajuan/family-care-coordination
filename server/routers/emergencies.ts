import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  caregiverBookings,
  emergencyActivations,
  participants,
  shiftAssignments,
  shifts,
  users,
} from "../../drizzle/schema";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { hasConfirmedNormalCoverageOverlap } from "../domain/coverage";
import { findScheduleConflict, requiredPeriodsForLocalInterval, type ExistingShift } from "../domain/scheduling";
import {
  insertedId,
  lockParticipant,
  lockParticipantRoster,
  recordAudit,
  requireSfccDatabase,
  type SfccTransaction,
} from "../db/sfcc";

const emergencyCaregiver = alias(participants, "emergency_caregiver");
const emergencyRequester = alias(users, "emergency_requester");
const emergencyResponder = alias(users, "emergency_responder");

const createInput = z.object({
  caregiverBookingId: z.number().int().positive(),
  participantId: z.number().int().positive(),
  restExceptionRequested: z.boolean().default(false),
  restExceptionJustification: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (value.restExceptionRequested && !value.restExceptionJustification?.trim()) {
    context.addIssue({ code: "custom", path: ["restExceptionJustification"], message: "Justifique a exceção de descanso solicitada." });
  }
});

const existingEmergencyWork = async (tx: SfccTransaction, participantId: number): Promise<ExistingShift[]> => {
  const assigned = await tx.select({
    id: shifts.id,
    startsLocal: shifts.startsLocal,
    endsLocal: shifts.endsLocal,
    status: shifts.status,
  }).from(shifts)
    .innerJoin(shiftAssignments, eq(shiftAssignments.shiftId, shifts.id))
    .where(and(eq(shiftAssignments.participantId, participantId), eq(shifts.status, "scheduled")));
  const acceptedEmergency = await tx.select({
    id: emergencyActivations.id,
    startsLocal: emergencyActivations.startsLocal,
    endsLocal: emergencyActivations.endsLocal,
  }).from(emergencyActivations)
    .where(and(
      eq(emergencyActivations.participantId, participantId),
      eq(emergencyActivations.status, "aceita"),
    ));
  return [
    ...assigned,
    ...acceptedEmergency.map(activation => ({
      id: -activation.id,
      startsLocal: activation.startsLocal,
      endsLocal: activation.endsLocal,
      status: "scheduled" as const,
    })),
  ];
};

async function exactEmergencyRoster(tx: SfccTransaction) {
  const roster = await tx.select({
    id: participants.id,
    displayName: participants.displayName,
    linkedUserId: participants.linkedUserId,
    active: participants.active,
    category: participants.category,
    emergencyEligible: participants.emergencyEligible,
  }).from(participants)
    .where(and(
      eq(participants.category, "familiar"),
      eq(participants.active, true),
      eq(participants.emergencyEligible, true),
    ));
  if (roster.length !== 3) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "O grupo de emergência precisa ter exatamente três familiares ativos designados antes de iniciar acionamentos." });
  }
  return roster;
}

async function validateEmergencyAcceptance(
  tx: SfccTransaction,
  activation: typeof emergencyActivations.$inferSelect,
  participantId: number,
  acceptRestException: boolean,
): Promise<boolean> {
  const [participant] = await tx.select({
    id: participants.id,
    category: participants.category,
    active: participants.active,
    emergencyEligible: participants.emergencyEligible,
  }).from(participants).where(eq(participants.id, participantId)).limit(1).for("update");
  if (!participant || !participant.active || participant.category !== "familiar" || !participant.emergencyEligible) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este perfil não está mais ativo e designado para o grupo de emergência." });
  }
  await exactEmergencyRoster(tx);
  const conflict = findScheduleConflict(
    activation.startsLocal,
    activation.endsLocal,
    await existingEmergencyWork(tx, participant.id),
  );
  if (conflict === "overlap") {
    throw new TRPCError({ code: "CONFLICT", message: "Há um turno sobreposto. A exceção emergencial permite somente exceção de descanso, não sobreposição." });
  }
  if (conflict === "rest" && !activation.restExceptionRequested) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A coordenação precisa registrar a solicitação de exceção de descanso antes do aceite." });
  }
  if ((activation.restExceptionRequested || conflict === "rest") && !acceptRestException) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Confirme que o familiar aceitou explicitamente a exceção à regra de 24 horas para registrar o aceite." });
  }
  if (activation.restExceptionRequested && !activation.restExceptionJustification) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "A exceção de descanso está sem justificativa administrativa." });
  }
  return activation.restExceptionRequested && acceptRestException;
}

export const emergenciesRouter = router({
  roster: adminProcedure.query(async () => {
    const database = await requireSfccDatabase();
    return database.select({
      id: participants.id,
      displayName: participants.displayName,
      linked: participants.linkedUserId,
    }).from(participants)
      .where(and(
        eq(participants.category, "familiar"),
        eq(participants.active, true),
        eq(participants.emergencyEligible, true),
      ))
      .orderBy(asc(participants.displayName));
  }),

  list: adminProcedure.query(async () => {
    const database = await requireSfccDatabase();
    return database.select({
      id: emergencyActivations.id,
      caregiverBookingId: emergencyActivations.caregiverBookingId,
      startsLocal: emergencyActivations.startsLocal,
      endsLocal: emergencyActivations.endsLocal,
      status: emergencyActivations.status,
      participantId: emergencyActivations.participantId,
      participantName: participants.displayName,
      caregiverName: emergencyCaregiver.displayName,
      caregiverAttemptStatus: caregiverBookings.status,
      restExceptionRequested: emergencyActivations.restExceptionRequested,
      restExceptionAccepted: emergencyActivations.restExceptionAccepted,
      restExceptionJustification: emergencyActivations.restExceptionJustification,
      requestedByName: emergencyRequester.name,
      respondedByName: emergencyResponder.name,
      createdAt: emergencyActivations.createdAt,
      respondedAt: emergencyActivations.respondedAt,
    }).from(emergencyActivations)
      .innerJoin(participants, eq(emergencyActivations.participantId, participants.id))
      .innerJoin(caregiverBookings, eq(emergencyActivations.caregiverBookingId, caregiverBookings.id))
      .innerJoin(emergencyCaregiver, eq(caregiverBookings.caregiverParticipantId, emergencyCaregiver.id))
      .innerJoin(emergencyRequester, eq(emergencyActivations.requestedByUserId, emergencyRequester.id))
      .leftJoin(emergencyResponder, eq(emergencyActivations.respondedByUserId, emergencyResponder.id))
      .orderBy(desc(emergencyActivations.createdAt))
      .limit(500);
  }),

  myRequests: protectedProcedure.query(async ({ ctx }) => {
    const database = await requireSfccDatabase();
    const [participant] = await database.select({ id: participants.id })
      .from(participants)
      .where(eq(participants.linkedUserId, ctx.user.id))
      .limit(1);
    if (!participant) return [];
    return database.select({
      id: emergencyActivations.id,
      startsLocal: emergencyActivations.startsLocal,
      endsLocal: emergencyActivations.endsLocal,
      status: emergencyActivations.status,
      caregiverName: emergencyCaregiver.displayName,
      caregiverAttemptStatus: caregiverBookings.status,
      restExceptionRequested: emergencyActivations.restExceptionRequested,
      restExceptionAccepted: emergencyActivations.restExceptionAccepted,
      restExceptionJustification: emergencyActivations.restExceptionJustification,
      createdAt: emergencyActivations.createdAt,
      respondedAt: emergencyActivations.respondedAt,
    }).from(emergencyActivations)
      .innerJoin(caregiverBookings, eq(emergencyActivations.caregiverBookingId, caregiverBookings.id))
      .innerJoin(emergencyCaregiver, eq(caregiverBookings.caregiverParticipantId, emergencyCaregiver.id))
      .where(eq(emergencyActivations.participantId, participant.id))
      .orderBy(desc(emergencyActivations.createdAt))
      .limit(100);
  }),

  create: adminProcedure.input(createInput).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [bookingHeader] = await tx.select({ shiftId: caregiverBookings.shiftId })
        .from(caregiverBookings)
        .where(eq(caregiverBookings.id, input.caregiverBookingId))
        .limit(1);
      if (!bookingHeader) throw new TRPCError({ code: "NOT_FOUND", message: "Tentativa de cuidadora não encontrada." });
      const [shift] = await tx.select({ id: shifts.id, status: shifts.status })
        .from(shifts).where(eq(shifts.id, bookingHeader.shiftId)).limit(1).for("update");
      if (!shift || shift.status !== "scheduled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O turno relacionado foi cancelado ou não está disponível para contingência." });
      }
      const [booking] = await tx.select().from(caregiverBookings)
        .where(eq(caregiverBookings.id, input.caregiverBookingId)).limit(1).for("update");
      if (!booking || (booking.status !== "indisponível" && booking.status !== "recusada")) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Só é possível acionar a contingência após uma tentativa de cuidadora marcada como indisponível ou recusada." });
      }
      const otherAttempts = await tx.select({
        id: caregiverBookings.id,
        startsLocal: caregiverBookings.coverageStartsLocal,
        endsLocal: caregiverBookings.coverageEndsLocal,
        status: caregiverBookings.status,
      })
        .from(caregiverBookings)
        .where(and(
          eq(caregiverBookings.shiftId, booking.shiftId),
          inArray(caregiverBookings.status, ["solicitada", "disponível", "confirmada", "realizada"]),
        ));
      const conflictingAttempt = otherAttempts.find(attempt =>
        attempt.id !== booking.id
        && attempt.startsLocal < booking.coverageEndsLocal
        && attempt.endsLocal > booking.coverageStartsLocal,
      );
      if (conflictingAttempt) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Há outra tentativa ainda ativa ou cobertura já confirmada/realizada para este intervalo. Resolva-a antes de acionar familiares." });
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
      if (hasConfirmedNormalCoverageOverlap(booking.coverageStartsLocal, booking.coverageEndsLocal, normalAssignments)) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Já há acompanhante confirmado cobrindo parte deste intervalo. Não é necessário acionar a contingência." });
      }
      const required = requiredPeriodsForLocalInterval(booking.coverageStartsLocal, booking.coverageEndsLocal);
      if (required.length !== 1 || required[0] !== "night") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "O acionamento emergencial só pode cobrir um intervalo integralmente noturno (20:00–08:00)." });
      }

      await lockParticipantRoster(tx);
      const roster = await exactEmergencyRoster(tx);
      const participant = roster.find(item => item.id === input.participantId);
      if (!participant) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione um dos três familiares ativos designados para emergência." });
      }
      await lockParticipant(tx, participant.id);

      const activeActivations = await tx.select({
        id: emergencyActivations.id,
        startsLocal: emergencyActivations.startsLocal,
        endsLocal: emergencyActivations.endsLocal,
      }).from(emergencyActivations)
        .innerJoin(caregiverBookings, eq(emergencyActivations.caregiverBookingId, caregiverBookings.id))
        .where(and(
          eq(caregiverBookings.shiftId, booking.shiftId),
          inArray(emergencyActivations.status, ["solicitada", "aceita"]),
        ));
      const duplicate = activeActivations.find(activation =>
        activation.startsLocal < booking.coverageEndsLocal
        && activation.endsLocal > booking.coverageStartsLocal,
      );
      if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "Já existe um acionamento pendente ou aceito neste intervalo. Aguarde a resposta antes de acionar outro familiar." });

      const conflict = findScheduleConflict(
        booking.coverageStartsLocal,
        booking.coverageEndsLocal,
        await existingEmergencyWork(tx, participant.id),
      );
      if (conflict === "overlap") {
        throw new TRPCError({ code: "CONFLICT", message: "O familiar já tem um turno sobreposto; exceção emergencial não permite sobreposição." });
      }
      if (conflict === "rest" && !input.restExceptionRequested) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este acionamento reduziria o descanso abaixo de 24 horas. Marque a exceção solicitada e registre uma justificativa." });
      }
      if (input.restExceptionRequested && conflict !== "rest") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não há violação de descanso que justifique esta exceção." });
      }

      const result = await tx.insert(emergencyActivations).values({
        caregiverBookingId: booking.id,
        participantId: participant.id,
        startsLocal: booking.coverageStartsLocal,
        endsLocal: booking.coverageEndsLocal,
        status: "solicitada",
        restExceptionRequested: input.restExceptionRequested,
        restExceptionAccepted: false,
        restExceptionJustification: input.restExceptionJustification?.trim() || null,
        requestedByUserId: ctx.user.id,
      });
      const id = insertedId(result);
      await recordAudit(tx, ctx.user.id, "emergency.activation_requested", "emergency_activation", id);
      return { id, status: "solicitada" as const };
    });
  }),

  respond: protectedProcedure.input(z.object({
    id: z.number().int().positive(),
    response: z.enum(["aceita", "recusada", "cancelada"]),
    acceptRestException: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [header] = await tx.select({ participantId: emergencyActivations.participantId })
        .from(emergencyActivations)
        .where(eq(emergencyActivations.id, input.id))
        .limit(1);
      if (!header) throw new TRPCError({ code: "NOT_FOUND", message: "Acionamento não encontrado." });
      await lockParticipantRoster(tx);
      await lockParticipant(tx, header.participantId);
      const [activation] = await tx.select().from(emergencyActivations)
        .where(eq(emergencyActivations.id, input.id)).limit(1).for("update");
      if (!activation) throw new TRPCError({ code: "NOT_FOUND", message: "Acionamento não encontrado." });
      const canAnswerPending = activation.status === "solicitada" && input.response !== "cancelada";
      const canCancelAccepted = activation.status === "aceita" && input.response === "cancelada";
      if (!canAnswerPending && !canCancelAccepted) {
        throw new TRPCError({ code: "CONFLICT", message: "Este acionamento já recebeu uma resposta ou não pode ser cancelado neste estado." });
      }
      const [participant] = await tx.select({
        id: participants.id,
        category: participants.category,
        active: participants.active,
        emergencyEligible: participants.emergencyEligible,
        linkedUserId: participants.linkedUserId,
      }).from(participants)
        .where(and(eq(participants.id, activation.participantId), eq(participants.linkedUserId, ctx.user.id)))
        .limit(1).for("update");
      if (!participant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode responder aos próprios acionamentos vinculados ao seu perfil." });
      }
      if (!participant.active || participant.category !== "familiar" || !participant.emergencyEligible) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este perfil não está mais ativo e designado para o grupo de emergência." });
      }

      const restExceptionAccepted = input.response === "aceita"
        ? await validateEmergencyAcceptance(tx, activation, participant.id, input.acceptRestException)
        : input.response === "cancelada" ? activation.restExceptionAccepted : false;

      await tx.update(emergencyActivations).set({
        status: input.response,
        restExceptionAccepted,
        respondedByUserId: ctx.user.id,
        respondedAt: new Date(),
      }).where(eq(emergencyActivations.id, activation.id));
      await recordAudit(tx, ctx.user.id, `emergency.activation_${input.response}`, "emergency_activation", activation.id);
      if (restExceptionAccepted) {
        await recordAudit(tx, ctx.user.id, "emergency.rest_exception_accepted", "emergency_activation", activation.id);
      }
      return { id: activation.id, status: input.response, restExceptionAccepted };
    });
  }),

  coordinatorRespond: adminProcedure.input(z.object({
    id: z.number().int().positive(),
    response: z.enum(["aceita", "recusada", "cancelada"]),
    source: z.enum(["whatsapp", "telefone", "presencial", "outro"]),
    acceptRestException: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [header] = await tx.select({ participantId: emergencyActivations.participantId })
        .from(emergencyActivations).where(eq(emergencyActivations.id, input.id)).limit(1);
      if (!header) throw new TRPCError({ code: "NOT_FOUND", message: "Acionamento não encontrado." });
      await lockParticipantRoster(tx);
      await lockParticipant(tx, header.participantId);
      const [activation] = await tx.select().from(emergencyActivations)
        .where(eq(emergencyActivations.id, input.id)).limit(1).for("update");
      const canAnswerPending = activation?.status === "solicitada" && input.response !== "cancelada";
      const canCancelAccepted = activation?.status === "aceita" && input.response === "cancelada";
      if (!activation || (!canAnswerPending && !canCancelAccepted)) {
        throw new TRPCError({ code: "CONFLICT", message: "Este acionamento já recebeu uma resposta ou não pode ser cancelado neste estado." });
      }
      const restExceptionAccepted = input.response === "aceita"
        ? await validateEmergencyAcceptance(tx, activation, activation.participantId, input.acceptRestException)
        : input.response === "cancelada" ? activation.restExceptionAccepted : false;
      await tx.update(emergencyActivations).set({
        status: input.response,
        restExceptionAccepted,
        respondedByUserId: ctx.user.id,
        respondedAt: new Date(),
      }).where(eq(emergencyActivations.id, activation.id));
      await recordAudit(tx, ctx.user.id, `emergency.coordinator_${input.response}_${input.source}`, "emergency_activation", activation.id);
      if (restExceptionAccepted) {
        await recordAudit(tx, ctx.user.id, "emergency.rest_exception_coordinator_recorded", "emergency_activation", activation.id);
      }
      return { id: activation.id, status: input.response, restExceptionAccepted };
    });
  }),

  cancel: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [activation] = await tx.select().from(emergencyActivations)
        .where(eq(emergencyActivations.id, input.id)).limit(1).for("update");
      if (!activation) throw new TRPCError({ code: "NOT_FOUND", message: "Acionamento não encontrado." });
      if (activation.status !== "solicitada") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Só é possível cancelar um acionamento ainda pendente." });
      }
      await tx.update(emergencyActivations).set({
        status: "cancelada",
      }).where(eq(emergencyActivations.id, activation.id));
      await recordAudit(tx, ctx.user.id, "emergency.activation_cancelled", "emergency_activation", activation.id);
      return { id: activation.id, status: "cancelada" as const };
    });
  }),
});
