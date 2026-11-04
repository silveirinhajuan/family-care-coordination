import { and, asc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { participants, users } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { insertedId, recordAudit, requireSfccDatabase, type SfccTransaction } from "../db/sfcc";
import { selfRegistrationInputSchema } from "../domain/inputs";
import { z } from "zod";

async function lockAccount(tx: SfccTransaction, userId: number) {
  const [account] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .for("update");
  if (!account) throw new TRPCError({ code: "UNAUTHORIZED", message: "Entre novamente para continuar." });
}

async function findLinkedParticipant(tx: SfccTransaction, userId: number) {
  const [participant] = await tx
    .select({ id: participants.id, displayName: participants.displayName })
    .from(participants)
    .where(eq(participants.linkedUserId, userId))
    .limit(1);
  return participant ?? null;
}

export const myProfileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const database = await requireSfccDatabase();
    const [participant] = await database
      .select({
        id: participants.id,
        displayName: participants.displayName,
        relationshipToCareRecipient: participants.relationshipToCareRecipient,
        category: participants.category,
        active: participants.active,
      })
      .from(participants)
      .where(eq(participants.linkedUserId, ctx.user.id))
      .limit(1);
    return participant ?? null;
  }),

  candidates: protectedProcedure.query(async ({ ctx }) => {
    const database = await requireSfccDatabase();
    const [linked] = await database
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.linkedUserId, ctx.user.id))
      .limit(1);
    if (linked) return [];
    return database
      .select({ id: participants.id, displayName: participants.displayName })
      .from(participants)
      .where(and(
        eq(participants.category, "familiar"),
        eq(participants.active, true),
        isNull(participants.linkedUserId),
      ))
      .orderBy(asc(participants.displayName));
  }),

  claim: protectedProcedure
    .input(z.object({
      participantId: z.number().int().positive(),
      relationshipToCareRecipient: selfRegistrationInputSchema.shape.relationshipToCareRecipient,
      confirmedWithCoordinator: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        await lockAccount(tx, ctx.user.id);
        if (await findLinkedParticipant(tx, ctx.user.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "Esta conta já está vinculada a um participante." });
        }
        const [candidate] = await tx
          .select({
            id: participants.id,
            category: participants.category,
            active: participants.active,
            linkedUserId: participants.linkedUserId,
          })
          .from(participants)
          .where(eq(participants.id, input.participantId))
          .limit(1)
          .for("update");
        if (!candidate || candidate.category !== "familiar" || !candidate.active || candidate.linkedUserId !== null) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Esse cadastro não está mais disponível para associação. Atualize a lista ou escolha cadastro novo.",
          });
        }
        await tx.update(participants).set({
          linkedUserId: ctx.user.id,
          relationshipToCareRecipient: input.relationshipToCareRecipient,
        }).where(eq(participants.id, candidate.id));
        await recordAudit(tx, ctx.user.id, "participant.self_claimed", "participant", candidate.id);
        return { id: candidate.id };
      });
    }),

  register: protectedProcedure
    .input(selfRegistrationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        await lockAccount(tx, ctx.user.id);
        if (await findLinkedParticipant(tx, ctx.user.id)) {
          throw new TRPCError({ code: "CONFLICT", message: "Esta conta já está vinculada a um participante." });
        }
        const result = await tx.insert(participants).values({
          linkedUserId: ctx.user.id,
          displayName: input.displayName,
          relationshipToCareRecipient: input.relationshipToCareRecipient,
          category: "familiar",
          contact: null,
          active: true,
          emergencyEligible: false,
        });
        const id = insertedId(result);
        await recordAudit(tx, ctx.user.id, "participant.self_registered", "participant", id);
        return { id };
      });
    }),
});
