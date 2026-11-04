import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditEvents, participants } from "../../drizzle/schema";
import { getDb } from "../db";

export type SfccDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type SfccTransaction = Parameters<Parameters<SfccDatabase["transaction"]>[0]>[0];

export async function requireSfccDatabase(): Promise<SfccDatabase> {
  const database = await getDb();
  if (!database) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Banco de dados indisponível. Tente novamente mais tarde.",
    });
  }
  return database;
}

export async function lockParticipant(tx: SfccTransaction, participantId: number): Promise<void> {
  const [participant] = await tx
    .select({ id: participants.id })
    .from(participants)
    .where(eq(participants.id, participantId))
    .limit(1)
    .for("update");
  if (!participant) throw new TRPCError({ code: "NOT_FOUND", message: "Acompanhante não encontrado." });
}

export async function lockParticipants(tx: SfccTransaction, participantIds: number[]): Promise<void> {
  for (const participantId of [...new Set(participantIds)].sort((a, b) => a - b)) {
    await lockParticipant(tx, participantId);
  }
}

/** Serializes the small emergency roster while a designation is being added or changed. */
export async function lockParticipantRoster(tx: SfccTransaction): Promise<void> {
  await tx.select({ id: participants.id }).from(participants).orderBy(asc(participants.id)).for("update");
}

export async function recordAudit(
  tx: SfccTransaction,
  actorUserId: number,
  action: string,
  entityType: string,
  entityId: number,
): Promise<void> {
  await tx.insert(auditEvents).values({ actorUserId, action, entityType, entityId });
}

export function insertedId(result: unknown): number {
  const first = Array.isArray(result) ? result[0] : result;
  const value = (first as { insertId?: number | bigint } | undefined)?.insertId;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível identificar o registro criado." });
  }
  return id;
}
