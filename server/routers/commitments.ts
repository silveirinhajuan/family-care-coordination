import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { commitments } from "../../drizzle/schema";
import { adminProcedure, router } from "../_core/trpc";
import { commitmentInputSchema, toStoredRecurrence } from "../domain/inputs";
import { insertedId, lockParticipant, lockParticipants, recordAudit, requireSfccDatabase } from "../db/sfcc";

export const commitmentsRouter = router({
  list: adminProcedure.input(z.object({ participantId: z.number().int().positive() })).query(async ({ input }) => {
    const database = await requireSfccDatabase();
    return database.select().from(commitments)
      .where(eq(commitments.participantId, input.participantId))
      .orderBy(asc(commitments.startsLocal));
  }),

  create: adminProcedure.input(commitmentInputSchema).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      await lockParticipant(tx, input.participantId);
      const { participantId, description, ...recurrence } = input;
      const result = await tx.insert(commitments).values({
        participantId,
        description,
        ...toStoredRecurrence(recurrence),
        createdBy: ctx.user.id,
      });
      const id = insertedId(result);
      await recordAudit(tx, ctx.user.id, "commitment.created", "commitment", id);
      return { id };
    });
  }),

  update: adminProcedure.input(z.object({ id: z.number().int().positive(), ...commitmentInputSchema.shape }))
    .mutation(async ({ ctx, input }) => {
      const database = await requireSfccDatabase();
      return database.transaction(async tx => {
        const [initial] = await tx.select().from(commitments)
          .where(eq(commitments.id, input.id)).limit(1);
        if (!initial) throw new TRPCError({ code: "NOT_FOUND", message: "Compromisso não encontrado." });
        await lockParticipants(tx, [initial.participantId, input.participantId]);
        const [existing] = await tx.select().from(commitments)
          .where(eq(commitments.id, input.id)).limit(1).for("update");
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Compromisso não encontrado." });
        if (existing.participantId !== initial.participantId) {
          throw new TRPCError({ code: "CONFLICT", message: "O compromisso foi alterado por outra ação. Atualize a tela e tente novamente." });
        }
        const { id, participantId, description, ...recurrence } = input;
        await tx.update(commitments).set({
          participantId,
          description,
          ...toStoredRecurrence(recurrence),
        }).where(eq(commitments.id, id));
        await recordAudit(tx, ctx.user.id, "commitment.updated", "commitment", id);
        return { id };
      });
    }),

  delete: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const database = await requireSfccDatabase();
    return database.transaction(async tx => {
      const [initial] = await tx.select({ participantId: commitments.participantId })
        .from(commitments).where(eq(commitments.id, input.id)).limit(1);
      if (!initial) throw new TRPCError({ code: "NOT_FOUND", message: "Compromisso não encontrado." });
      await lockParticipant(tx, initial.participantId);
      const [existing] = await tx.select({ id: commitments.id, participantId: commitments.participantId })
        .from(commitments).where(eq(commitments.id, input.id)).limit(1).for("update");
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Compromisso não encontrado." });
      if (existing.participantId !== initial.participantId) {
        throw new TRPCError({ code: "CONFLICT", message: "O compromisso foi alterado por outra ação. Atualize a tela e tente novamente." });
      }
      await tx.delete(commitments).where(eq(commitments.id, input.id));
      await recordAudit(tx, ctx.user.id, "commitment.deleted", "commitment", input.id);
      return { success: true };
    });
  }),
});
