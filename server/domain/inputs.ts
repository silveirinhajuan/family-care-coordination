import { z } from "zod";
import { isLocalDateTime } from "./scheduling";
import { localDateTimeToEpoch } from "./time";

const dateTimeLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use data e hora no formato local.")
  .refine(value => isLocalDateTime(value), "Data/hora inválida no fuso America/Fortaleza.");

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Use uma data válida.");

export const participantFields = z.object({
  displayName: z.string().trim().min(1, "Informe o nome.").max(120),
  category: z.enum(["familiar", "cuidadora", "outros"]),
  contact: z.string().trim().max(255).nullable().optional().transform(value => value || null),
  emergencyEligible: z.boolean(),
});

function validateParticipant(value: z.infer<typeof participantFields>, context: z.RefinementCtx) {
  if (value.emergencyEligible && value.category !== "familiar") {
    context.addIssue({
      code: "custom",
      path: ["emergencyEligible"],
      message: "Somente familiares podem ser designados para emergência.",
    });
  }
}

export const participantInputSchema = participantFields.superRefine(validateParticipant);
export const participantUpdateInputSchema = z
  .object({ id: z.number().int().positive(), ...participantFields.shape })
  .superRefine(validateParticipant);

export const recurrenceFields = z.object({
  recurrence: z.enum(["once", "weekly"]),
  startsLocal: dateTimeLocal,
  endsLocal: dateTimeLocal,
  repeatDays: z.array(z.number().int().min(0).max(6)).max(7),
  repeatUntil: dateOnly.nullable(),
});

function validateRecurrence(value: z.infer<typeof recurrenceFields>, context: z.RefinementCtx) {
  let start: number;
  let end: number;
  try {
    start = localDateTimeToEpoch(value.startsLocal, "Início");
    end = localDateTimeToEpoch(value.endsLocal, "Fim");
  } catch (error) {
    context.addIssue({
      code: "custom",
      path: ["startsLocal"],
      message: error instanceof Error ? error.message : "Data/hora inválida.",
    });
    return;
  }
  if (end <= start) {
    context.addIssue({ code: "custom", path: ["endsLocal"], message: "O fim deve ser posterior ao início." });
  }
  if (new Set(value.repeatDays).size !== value.repeatDays.length) {
    context.addIssue({ code: "custom", path: ["repeatDays"], message: "Remova dias da semana duplicados." });
  }
  if (value.recurrence === "weekly" && value.repeatDays.length === 0) {
    context.addIssue({ code: "custom", path: ["repeatDays"], message: "Escolha pelo menos um dia da semana." });
  }
  if (value.recurrence === "once" && (value.repeatUntil || value.repeatDays.length > 0)) {
    context.addIssue({ code: "custom", path: ["repeatDays"], message: "Dias e data final só valem para recorrência semanal." });
  }
  if (value.recurrence === "weekly" && value.repeatUntil && value.repeatUntil < value.startsLocal.slice(0, 10)) {
    context.addIssue({ code: "custom", path: ["repeatUntil"], message: "A repetição termina antes de começar." });
  }
}

export const recurrenceInputSchema = recurrenceFields.superRefine(validateRecurrence);
export const availabilityInputSchema = z
  .object({ ...recurrenceFields.shape, participantId: z.number().int().positive(), status: z.enum(["available", "unavailable"]) })
  .superRefine(validateRecurrence);
export const ownAvailabilityInputSchema = z
  .object({ ...recurrenceFields.shape, status: z.enum(["available", "unavailable"]) })
  .superRefine(validateRecurrence);
export const ownAvailabilityUpdateInputSchema = z
  .object({ id: z.number().int().positive(), ...ownAvailabilityInputSchema.shape })
  .superRefine(validateRecurrence);
export const availabilityUpdateInputSchema = z
  .object({ id: z.number().int().positive(), ...availabilityInputSchema.shape })
  .superRefine(validateRecurrence);
export const commitmentInputSchema = z
  .object({ ...recurrenceFields.shape, participantId: z.number().int().positive(), description: z.string().trim().min(1, "Descreva o compromisso.").max(160) })
  .superRefine(validateRecurrence);
export const commitmentUpdateInputSchema = z
  .object({ id: z.number().int().positive(), ...commitmentInputSchema.shape })
  .superRefine(validateRecurrence);

export const shiftInputSchema = z.object({
  participantId: z.number().int().positive(),
  startsLocal: dateTimeLocal,
  endsLocal: dateTimeLocal,
  notes: z.string().trim().max(1000).nullable().optional().transform(value => value || null),
});
export const shiftUpdateInputSchema = shiftInputSchema.extend({ id: z.number().int().positive() });

export const selfRegistrationInputSchema = z.object({
  displayName: z.string().trim().min(1, "Informe seu nome.").max(120),
  relationshipToCareRecipient: z.string().trim().min(1, "Informe sua relação com pessoa acompanhada.").max(120),
});

export type ParticipantInput = z.infer<typeof participantInputSchema>;
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>;
export type CommitmentInput = z.infer<typeof commitmentInputSchema>;
export type ShiftInput = z.infer<typeof shiftInputSchema>;
export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;

export function toStoredRecurrence(input: RecurrenceInput) {
  return {
    recurrence: input.recurrence,
    startsLocal: input.startsLocal,
    endsLocal: input.endsLocal,
    repeatDays: input.recurrence === "weekly" ? [...input.repeatDays].sort((a, b) => a - b).join(",") : null,
    repeatUntil: input.recurrence === "weekly" ? input.repeatUntil : null,
  };
}
