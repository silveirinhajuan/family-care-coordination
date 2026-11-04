import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { availabilityWindows, participants } from "../../drizzle/schema";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { availabilityInputSchema, ownAvailabilityInputSchema, ownAvailabilityUpdateInputSchema, toStoredRecurrence } from "../domain/inputs";
import { insertedId, lockParticipant, lockParticipants, recordAudit, requireSfccDatabase } from "../db/sfcc";

export const availabilityRouter = router({
  mine: protectedProcedure.query(async ({ ctx }) => {
    const database = await requireSfccDatabase();
    return database
      .select({
        id: availabilityWindows.id,
        status: availabilityWindows.status,
        recurrence: availabilityWindows.recurrence,
        startsLocal: availabilityWindows.startsLocal,
        endsLocal: availabilityWindows.endsLocal,
        repeatDays: availabilityWindows.repeatDays,
        repeatUntil: availabilityWindows.repeatUntil,
        createdAt: availabilityWindows.createdAt,
      })
      .from(availabilityWindows)
      .innerJoin(participants, eq(participants.id, availabilityWindows.participantId))
      .where(eq(participants.linkedUserId, ctx.user.id))
      .orderBy(asc(availabilityWindows.startsLocal));
  }),

  createMine: protectedProcedure.input(ownAvailabilityInputSchema).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [participant] = await tx.select({ id: participants.id, active: participants.active, category: participants.category })
        .from(participants).where(eq(participants.linkedUserId, ctx.user.id)).limit(1).for("update");
      if (!participant) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Cadastre ou associe seu perfil antes de informar disponibilidade." });
      if (participant.category !== "familiar") throw new TRPCError({ code: "FORBIDDEN", message: "Somente perfis familiares podem usar esta área." });
      if (!participant.active) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Seu cadastro está inativo. Peça ajuda à coordenação." });
      const { status, ...recurrence } = input;
      const result = await tx.insert(availabilityWindows).values({
        participantId: participant.id,
        status,
        ...toStoredRecurrence(recurrence),
        createdBy: ctx.user.id,
      });
      const id = insertedId(result);
      await recordAudit(tx, ctx.user.id, "availability.self_created", "availability", id);
      return { id };
    });
  }),

  updateMine: protectedProcedure.input(ownAvailabilityUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [participant] = await tx.select({ id: participants.id, active: participants.active, category: participants.category })
        .from(participants).where(eq(participants.linkedUserId, ctx.user.id)).limit(1).for("update");
      if (!participant || !participant.active) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil ativo não encontrado." });
      if (participant.category !== "familiar") throw new TRPCError({ code: "FORBIDDEN", message: "Somente perfis familiares podem usar esta área." });
      const [window] = await tx.select({ id: availabilityWindows.id, participantId: availabilityWindows.participantId })
        .from(availabilityWindows)
        .where(eq(availabilityWindows.id, input.id))
        .limit(1)
        .for("update");
      if (!window) throw new TRPCError({ code: "NOT_FOUND", message: "Disponibilidade não encontrada." });
      if (window.participantId !== participant.id) throw new TRPCError({ code: "FORBIDDEN", message: "Você só pode alterar suas próprias disponibilidades." });
      const { id, status, ...recurrence } = input;
      await tx.update(availabilityWindows).set({ status, ...toStoredRecurrence(recurrence) })
        .where(eq(availabilityWindows.id, id));
      await recordAudit(tx, ctx.user.id, "availability.self_updated", "availability", id);
      return { id };
    });
  }),

  deleteMine: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [participant] = await tx.select({ id: participants.id, active: participants.active, category: participants.category })
        .from(participants).where(eq(participants.linkedUserId, ctx.user.id)).limit(1).for("update");
      if (!participant || !participant.active) throw new TRPCError({ code: "NOT_FOUND", message: "Perfil ativo não encontrado." });
      if (participant.category !== "familiar") throw new TRPCError({ code: "FORBIDDEN", message: "Somente perfis familiares podem usar esta área." });
      const [window] = await tx.select({ id: availabilityWindows.id, participantId: availabilityWindows.participantId })
        .from(availabilityWindows).where(eq(availabilityWindows.id, input.id)).limit(1).for("update");
      if (!window || window.participantId !== participant.id) throw new TRPCError({ code: "NOT_FOUND", message: "Disponibilidade não encontrada." });
      await tx.delete(availabilityWindows).where(eq(availabilityWindows.id, input.id));
      await recordAudit(tx, ctx.user.id, "availability.self_deleted", "availability", input.id);
      return { success: true };
    });
  }),

  list: adminProcedure.input(z.object({ participantId: z.number().int().positive() })).query(async ({ input }) => {
    const database = await requireSfccDatabase();
    return database
      .select()
      .from(availabilityWindows)
      .where(eq(availabilityWindows.participantId, input.participantId))
      .orderBy(asc(availabilityWindows.startsLocal));
  }),

  create: adminProcedure.input(availabilityInputSchema).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      await lockParticipant(tx, input.participantId);
      const { participantId, status, ...recurrence } = input;
      const result = await tx.insert(availabilityWindows).values({
        participantId,
        status,
        ...toStoredRecurrence(recurrence),
        createdBy: ctx.user.id,
      });
      const id = insertedId(result);
      await recordAudit(tx, ctx.user.id, "availability.created", "availability", id);
      return { id };
    });
  }),

  update: adminProcedure.input(z.object({ id: z.number().int().positive(), ...availabilityInputSchema.shape }))
    .mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        const [initial] = await tx.select().from(availabilityWindows)
          .where(eq(availabilityWindows.id, input.id)).limit(1);
        if (!initial) throw new TRPCError({ code: "NOT_FOUND", message: "pessoa acompanhadala de disponibilidade não encontrada." });
        await lockParticipants(tx, [initial.participantId, input.participantId]);
        const [existing] = await tx.select().from(availabilityWindows)
          .where(eq(availabilityWindows.id, input.id)).limit(1).for("update");
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "pessoa acompanhadala de disponibilidade não encontrada." });
        if (existing.participantId !== initial.participantId) {
          throw new TRPCError({ code: "CONFLICT", message: "A janela foi alterada por outra ação. Atualize a tela e tente novamente." });
        }
        const { id, participantId, status, ...recurrence } = input;
        await tx.update(availabilityWindows).set({
          participantId,
          status,
          ...toStoredRecurrence(recurrence),
        }).where(eq(availabilityWindows.id, id));
        await recordAudit(tx, ctx.user.id, "availability.updated", "availability", id);
        return { id };
      });
    }),

  delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [initial] = await tx.select({ participantId: availabilityWindows.participantId })
        .from(availabilityWindows).where(eq(availabilityWindows.id, input.id)).limit(1);
      if (!initial) throw new TRPCError({ code: "NOT_FOUND", message: "pessoa acompanhadala de disponibilidade não encontrada." });
      await lockParticipant(tx, initial.participantId);
      const [existing] = await tx.select({ id: availabilityWindows.id, participantId: availabilityWindows.participantId })
        .from(availabilityWindows).where(eq(availabilityWindows.id, input.id)).limit(1).for("update");
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "pessoa acompanhadala de disponibilidade não encontrada." });
      if (existing.participantId !== initial.participantId) {
        throw new TRPCError({ code: "CONFLICT", message: "A janela foi alterada por outra ação. Atualize a tela e tente novamente." });
      }
      await tx.delete(availabilityWindows).where(eq(availabilityWindows.id, input.id));
      await recordAudit(tx, ctx.user.id, "availability.deleted", "availability", input.id);
      return { success: true };
    });
  }),
});
