import { asc, count, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditEvents, participants, users } from "../../drizzle/schema";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { participantInputSchema } from "../domain/inputs";
import {
  insertedId,
  lockParticipantRoster,
  recordAudit,
  requireSfccDatabase,
  type SfccTransaction,
} from "../db/sfcc";

async function ensureEmergencyCapacity(
  tx: SfccTransaction,
  requested: boolean,
  category: "familiar" | "cuidadora" | "outros",
  excludeId?: number,
) {
  if (!requested) return;
  if (category !== "familiar") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Somente familiares podem ser designados para emergência." });
  }
  const assigned = await tx
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.emergencyEligible, true))
    .for("update");
  const count = assigned.filter(participant => participant.id !== excludeId).length;
  if (count >= 3) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "O grupo de emergência já tem três familiares designados." });
  }
}

export const participantsRouter = router({
  /** Participant names and categories are restricted to the coordination role. */
  list: adminProcedure.query(async () => {
    const database = await requireSfccDatabase();
    return database
      .select({
        id: participants.id,
        displayName: participants.displayName,
        category: participants.category,
        active: participants.active,
      })
      .from(participants)
      .orderBy(desc(participants.active), asc(participants.displayName));
  }),

  activeCount: protectedProcedure.query(async () => {
    const database = await requireSfccDatabase();
    const [result] = await database
      .select({ count: count() })
      .from(participants)
      .where(eq(participants.active, true));
    return { count: Number(result?.count ?? 0) };
  }),

  adminList: adminProcedure.query(async () => {
    const database = await requireSfccDatabase();
    return database.select({
      id: participants.id,
      displayName: participants.displayName,
      relationshipToCareRecipient: participants.relationshipToCareRecipient,
      linkedUserId: participants.linkedUserId,
      category: participants.category,
      contact: participants.contact,
      active: participants.active,
      emergencyEligible: participants.emergencyEligible,
    }).from(participants)
      .orderBy(desc(participants.active), asc(participants.displayName));
  }),

  create: adminProcedure.input(participantInputSchema).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      if (input.emergencyEligible) await lockParticipantRoster(tx);
      await ensureEmergencyCapacity(tx, input.emergencyEligible, input.category);
      const result = await tx.insert(participants).values(input);
      const id = insertedId(result);
      await recordAudit(tx, ctx.user.id, "participant.created", "participant", id);
      return { id };
    });
  }),

  update: adminProcedure
    .input(z.object({ id: z.number().int().positive(), ...participantInputSchema.shape }))
    .mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        if (input.emergencyEligible) await lockParticipantRoster(tx);
        const [existing] = await tx.select({ id: participants.id, linkedUserId: participants.linkedUserId }).from(participants)
          .where(eq(participants.id, input.id)).limit(1).for("update");
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Acompanhante não encontrado." });
        await ensureEmergencyCapacity(tx, input.emergencyEligible, input.category, input.id);
        if (existing.linkedUserId !== null && input.category !== "familiar") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Desvincule o perfil familiar antes de alterar sua categoria." });
        }
        const { id, ...values } = input;
        await tx.update(participants).set(values).where(eq(participants.id, id));
        await recordAudit(tx, ctx.user.id, "participant.updated", "participant", id);
        return { id };
      });
    }),

  deactivate: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [existing] = await tx.select({ id: participants.id }).from(participants)
        .where(eq(participants.id, input.id)).limit(1).for("update");
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Acompanhante não encontrado." });
      await tx.update(participants).set({ active: false, emergencyEligible: false }).where(eq(participants.id, input.id));
      await recordAudit(tx, ctx.user.id, "participant.deactivated", "participant", input.id);
      return { success: true };
    });
  }),

  reactivate: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [existing] = await tx.select({ id: participants.id }).from(participants)
        .where(eq(participants.id, input.id)).limit(1).for("update");
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Acompanhante não encontrado." });
      await tx.update(participants).set({ active: true }).where(eq(participants.id, input.id));
      await recordAudit(tx, ctx.user.id, "participant.reactivated", "participant", input.id);
      return { success: true };
    });
  }),

  unlinkAccount: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [existing] = await tx.select({ id: participants.id, linkedUserId: participants.linkedUserId })
        .from(participants).where(eq(participants.id, input.id)).limit(1).for("update");
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Acompanhante não encontrado." });
      if (existing.linkedUserId === null) return { success: true, unlinked: false };
      await tx.update(participants).set({ linkedUserId: null, relationshipToCareRecipient: null })
        .where(eq(participants.id, input.id));
      await recordAudit(tx, ctx.user.id, "participant.account_unlinked", "participant", input.id);
      return { success: true, unlinked: true };
    });
  }),
});

export const auditRouter = router({
  list: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ input }) => {
      const database = await requireSfccDatabase();
      return database
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          entityType: auditEvents.entityType,
          entityId: auditEvents.entityId,
          createdAt: auditEvents.createdAt,
          actorName: users.name,
        })
        .from(auditEvents)
        .leftJoin(users, eq(auditEvents.actorUserId, users.id))
        .orderBy(desc(auditEvents.createdAt))
        .limit(input?.limit ?? 50);
    }),
});
