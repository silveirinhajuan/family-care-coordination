import { and, asc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { availabilityWindows, caregiverBookings, commitments, emergencyActivations, participants, shiftAssignments, shifts } from "../../drizzle/schema";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { shiftInputSchema, shiftUpdateInputSchema } from "../domain/inputs";
import { validateShiftCandidate } from "../domain/scheduling";
import {
  insertedId,
  lockParticipant,
  lockParticipants,
  recordAudit,
  requireSfccDatabase,
  type SfccTransaction,
} from "../db/sfcc";
import { localDateTimeToEpoch } from "../domain/time";

async function validateForParticipant(
  tx: SfccTransaction,
  participantId: number,
  startsLocal: string,
  endsLocal: string,
  excludeShiftId?: number,
) {
  const [participant] = await tx.select({ active: participants.active, category: participants.category }).from(participants)
    .where(eq(participants.id, participantId)).limit(1);
  if (!participant) throw new TRPCError({ code: "NOT_FOUND", message: "Acompanhante não encontrado." });

  const availability = await tx.select().from(availabilityWindows)
    .where(eq(availabilityWindows.participantId, participantId));
  const participantCommitments = await tx.select().from(commitments)
    .where(eq(commitments.participantId, participantId));
  const existing = await tx.select({
    id: shifts.id,
    startsLocal: shifts.startsLocal,
    endsLocal: shifts.endsLocal,
    status: shifts.status,
  })
    .from(shifts)
    .innerJoin(shiftAssignments, eq(shiftAssignments.shiftId, shifts.id))
    .where(eq(shiftAssignments.participantId, participantId));
  const caregiverContracts = participant.category === "cuidadora"
    ? await tx.select({
      id: caregiverBookings.id,
      startsLocal: caregiverBookings.coverageStartsLocal,
      endsLocal: caregiverBookings.coverageEndsLocal,
    }).from(caregiverBookings)
      .where(and(
        eq(caregiverBookings.caregiverParticipantId, participantId),
        inArray(caregiverBookings.status, ["confirmada", "realizada"]),
      ))
    : [];
  const acceptedEmergencyWork = await tx.select({
    id: emergencyActivations.id,
    startsLocal: emergencyActivations.startsLocal,
    endsLocal: emergencyActivations.endsLocal,
  }).from(emergencyActivations)
    .where(and(
      eq(emergencyActivations.participantId, participantId),
      eq(emergencyActivations.status, "aceita"),
    ));

  try {
    return validateShiftCandidate({
      participant,
      availability,
      commitments: participantCommitments,
      existingShifts: [
        ...existing,
        ...caregiverContracts.map(booking => ({
          id: -booking.id,
          startsLocal: booking.startsLocal,
          endsLocal: booking.endsLocal,
          status: "scheduled" as const,
        })),
        ...acceptedEmergencyWork.map(activation => ({
          id: -activation.id,
          startsLocal: activation.startsLocal,
          endsLocal: activation.endsLocal,
          status: "scheduled" as const,
        })),
      ],
      startsLocal,
      endsLocal,
      excludeShiftId,
    });
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: error instanceof Error ? error.message : "Não foi possível validar o turno.",
    });
  }
}

export const shiftsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const database = await requireSfccDatabase();
    const [ownParticipant] = await database.select({ id: participants.id }).from(participants)
      .where(eq(participants.linkedUserId, ctx.user.id)).limit(1);
    const rows = await database
      .select({
        id: shifts.id,
        assignmentId: shiftAssignments.id,
        startsLocal: shifts.startsLocal,
        endsLocal: shifts.endsLocal,
        classification: shifts.classification,
        status: shifts.status,
        notes: shifts.notes,
        participantId: participants.id,
        participantName: participants.displayName,
        category: participants.category,
        participantActive: participants.active,
        confirmationStatus: shiftAssignments.confirmationStatus,
      })
      .from(shifts)
      .innerJoin(shiftAssignments, eq(shiftAssignments.shiftId, shifts.id))
      .innerJoin(participants, eq(shiftAssignments.participantId, participants.id))
      .orderBy(asc(shifts.startsLocal));
    const grouped = new Map<number, typeof rows>();
    for (const row of rows) {
      if (row.status !== "scheduled") continue;
      const group = grouped.get(row.participantId) ?? [];
      group.push(row);
      grouped.set(row.participantId, group);
    }
    const restByShift = new Map<number, { restBeforeMinutes: number | null; restAfterMinutes: number | null }>();
    for (const group of grouped.values()) {
      group.sort((a, b) => a.startsLocal.localeCompare(b.startsLocal));
      group.forEach((row, index) => {
        const previous = group[index - 1];
        const next = group[index + 1];
        restByShift.set(row.id, {
          restBeforeMinutes: previous
            ? Math.floor((localDateTimeToEpoch(row.startsLocal) - localDateTimeToEpoch(previous.endsLocal)) / 60_000)
            : null,
          restAfterMinutes: next
            ? Math.floor((localDateTimeToEpoch(next.startsLocal) - localDateTimeToEpoch(row.endsLocal)) / 60_000)
            : null,
        });
      });
    }
    return rows.map(row => ({
      ...row,
      isMine: row.participantId === ownParticipant?.id,
      notes: ctx.user.role === "admin" ? row.notes : null,
      ...(restByShift.get(row.id) ?? { restBeforeMinutes: null, restAfterMinutes: null }),
    }));
  }),

  respond: protectedProcedure.input(z.object({
    assignmentId: z.number().int().positive(),
    response: z.enum(["accepted", "declined", "cancelled"]),
  })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [header] = await tx.select({ shiftId: shiftAssignments.shiftId })
        .from(shiftAssignments).where(eq(shiftAssignments.id, input.assignmentId)).limit(1);
      if (!header) throw new TRPCError({ code: "NOT_FOUND", message: "A atribuição do turno não foi encontrada." });
      const [shift] = await tx.select().from(shifts).where(eq(shifts.id, header.shiftId)).limit(1).for("update");
      if (!shift || shift.status !== "scheduled") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este turno não está mais ativo." });
      }
      const [assignment] = await tx.select().from(shiftAssignments)
        .where(eq(shiftAssignments.id, input.assignmentId)).limit(1).for("update");
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "A atribuição do turno não foi encontrada." });
      await lockParticipant(tx, assignment.participantId);
      const [participant] = await tx.select({ id: participants.id, linkedUserId: participants.linkedUserId }).from(participants)
        .where(eq(participants.id, assignment.participantId)).limit(1);
      if (!participant || participant.linkedUserId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode responder ao próprio turno vinculado." });
      }
      const canAnswerPending = assignment.confirmationStatus === "pending" && input.response !== "cancelled";
      const canCancelAccepted = assignment.confirmationStatus === "accepted" && input.response === "cancelled";
      if (!canAnswerPending && !canCancelAccepted) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este turno já recebeu uma resposta ou não pode ser cancelado neste estado." });
      }
      if (input.response === "accepted") {
        await validateForParticipant(tx, participant.id, shift.startsLocal, shift.endsLocal, shift.id);
      }
      await tx.update(shiftAssignments).set({ confirmationStatus: input.response })
        .where(eq(shiftAssignments.id, assignment.id));
      await recordAudit(
        tx,
        ctx.user.id,
        input.response === "accepted"
          ? "shift.assignment_accepted"
          : input.response === "declined"
            ? "shift.assignment_declined"
            : "shift.assignment_cancelled",
        "shift_assignment",
        assignment.id,
      );
      return { assignmentId: assignment.id, confirmationStatus: input.response };
    });
  }),

  coordinatorRespond: adminProcedure.input(z.object({
    assignmentId: z.number().int().positive(),
    response: z.enum(["accepted", "declined", "cancelled"]),
    source: z.enum(["whatsapp", "telefone", "presencial", "outro"]),
  })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [header] = await tx.select({ shiftId: shiftAssignments.shiftId })
        .from(shiftAssignments).where(eq(shiftAssignments.id, input.assignmentId)).limit(1);
      if (!header) throw new TRPCError({ code: "NOT_FOUND", message: "A atribuição do turno não foi encontrada." });
      const [shift] = await tx.select().from(shifts).where(eq(shifts.id, header.shiftId)).limit(1).for("update");
      if (!shift || shift.status !== "scheduled") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este turno não está mais ativo." });
      }
      const [assignment] = await tx.select().from(shiftAssignments)
        .where(eq(shiftAssignments.id, input.assignmentId)).limit(1).for("update");
      if (!assignment) throw new TRPCError({ code: "NOT_FOUND", message: "A atribuição do turno não foi encontrada." });
      await lockParticipant(tx, assignment.participantId);
      const canAnswerPending = assignment.confirmationStatus === "pending" && input.response !== "cancelled";
      const canCancelAccepted = assignment.confirmationStatus === "accepted" && input.response === "cancelled";
      if (!canAnswerPending && !canCancelAccepted) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Este turno já recebeu uma resposta ou não pode ser cancelado neste estado." });
      }
      if (input.response === "accepted") {
        await validateForParticipant(tx, assignment.participantId, shift.startsLocal, shift.endsLocal, shift.id);
      }
      await tx.update(shiftAssignments).set({ confirmationStatus: input.response })
        .where(eq(shiftAssignments.id, assignment.id));
      await recordAudit(
        tx,
        ctx.user.id,
        `shift.assignment_coordinator_${input.response}_${input.source}`,
        "shift_assignment",
        assignment.id,
      );
      return { assignmentId: assignment.id, confirmationStatus: input.response };
    });
  }),

  create: adminProcedure.input(shiftInputSchema).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      await lockParticipant(tx, input.participantId);
      const validation = await validateForParticipant(tx, input.participantId, input.startsLocal, input.endsLocal);
      const result = await tx.insert(shifts).values({
        startsLocal: input.startsLocal,
        endsLocal: input.endsLocal,
        classification: validation.classification,
        status: "scheduled",
        notes: input.notes,
        createdBy: ctx.user.id,
      });
      const id = insertedId(result);
      await tx.insert(shiftAssignments).values({
        shiftId: id,
        participantId: input.participantId,
        confirmationStatus: "pending",
        assignedByUserId: ctx.user.id,
      });
      await recordAudit(tx, ctx.user.id, "shift.created", "shift", id);
      return { id, classification: validation.classification, confirmationStatus: "pending" as const };
    });
  }),

  update: adminProcedure.input(shiftUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [existingShift] = await tx.select().from(shifts)
        .where(eq(shifts.id, input.id)).limit(1).for("update");
      if (!existingShift) throw new TRPCError({ code: "NOT_FOUND", message: "Turno não encontrado." });
      if (existingShift.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Não é possível editar um turno cancelado." });
      }
      const [activeCaregiverBooking] = await tx.select({ id: caregiverBookings.id })
        .from(caregiverBookings)
        .where(and(
          eq(caregiverBookings.shiftId, input.id),
          inArray(caregiverBookings.status, ["solicitada", "disponível", "confirmada", "realizada"]),
        )).limit(1);
      if (activeCaregiverBooking) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Resolva a tentativa ou contratação da cuidadora antes de alterar este turno." });
      }
      const [assignment] = await tx.select().from(shiftAssignments)
        .where(eq(shiftAssignments.shiftId, input.id)).limit(1).for("update");
      if (!assignment) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "A atribuição do turno não foi encontrada." });
      await lockParticipants(tx, [assignment.participantId, input.participantId]);

      const validation = await validateForParticipant(
        tx,
        input.participantId,
        input.startsLocal,
        input.endsLocal,
        input.id,
      );
      await tx.update(shifts).set({
        startsLocal: input.startsLocal,
        endsLocal: input.endsLocal,
        classification: validation.classification,
        notes: input.notes,
      }).where(eq(shifts.id, input.id));
      await tx.update(shiftAssignments).set({
        participantId: input.participantId,
        confirmationStatus: "pending",
        assignedByUserId: ctx.user.id,
      }).where(eq(shiftAssignments.id, assignment.id));
      await recordAudit(tx, ctx.user.id, "shift.updated", "shift", input.id);
      return { id: input.id, classification: validation.classification, confirmationStatus: "pending" as const };
    });
  }),

  cancel: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [existing] = await tx.select({ id: shifts.id }).from(shifts)
        .where(eq(shifts.id, input.id)).limit(1).for("update");
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Turno não encontrado." });
      const [activeCaregiverBooking] = await tx.select({ id: caregiverBookings.id })
        .from(caregiverBookings)
        .where(and(
          eq(caregiverBookings.shiftId, input.id),
          inArray(caregiverBookings.status, ["solicitada", "disponível", "confirmada", "realizada"]),
        )).limit(1);
      if (activeCaregiverBooking) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Resolva ou cancele primeiro a tentativa/contratação da cuidadora vinculada a este turno." });
      }
      await tx.update(shifts).set({ status: "cancelled" }).where(eq(shifts.id, input.id));
      await tx.update(shiftAssignments).set({ confirmationStatus: "cancelled" })
        .where(eq(shiftAssignments.shiftId, input.id));
      await recordAudit(tx, ctx.user.id, "shift.cancelled", "shift", input.id);
      return { success: true };
    });
  }),
});
