import { SFCC_RULES } from "../../shared/sfccRules";
import {
  addDaysToDate,
  dayOfWeekForDate,
  daysBetweenDates,
  localDateFromEpoch,
  localDateTimeFromParts,
  localDateTimeToEpoch,
  BUSINESS_TIME_ZONE,
} from "./time";

export type RecurrenceRule = {
  recurrence: "once" | "weekly";
  startsLocal: string;
  endsLocal: string;
  repeatDays: string | null;
  repeatUntil: string | null;
};

export type AvailabilityRule = RecurrenceRule & { status: "available" | "unavailable" };
export type CommitmentRule = RecurrenceRule & { description: string };
export type ExistingShift = {
  id: number;
  startsLocal: string;
  endsLocal: string;
  status: "scheduled" | "cancelled";
};

export type ParticipantEligibility = {
  active: boolean;
};

export type ShiftValidationInput = {
  participant: ParticipantEligibility;
  availability: AvailabilityRule[];
  commitments: CommitmentRule[];
  existingShifts: ExistingShift[];
  startsLocal: string;
  endsLocal: string;
  excludeShiftId?: number;
};

export type ShiftClassification = "diurno" | "noturno" | "misto";
type Interval = { start: number; end: number };
export type RequiredPeriod = "day" | "night";

const REST_PERIOD_MS = SFCC_RULES.minimumRestHoursBetweenTurns * 60 * 60 * 1000;

/** Convert a one-off or weekly wall-time rule into occurrences near a requested interval. */
function occurrencesFor(
  rule: RecurrenceRule,
  rangeStart: number,
  rangeEnd: number,
): Interval[] {
  const anchorStart = localDateTimeToEpoch(rule.startsLocal, "Início da disponibilidade/compromisso");
  const anchorEnd = localDateTimeToEpoch(rule.endsLocal, "Fim da disponibilidade/compromisso");
  if (anchorEnd <= anchorStart) return [];

  if (rule.recurrence === "once") return [{ start: anchorStart, end: anchorEnd }];

  const anchorDate = rule.startsLocal.slice(0, 10);
  const anchorEndDate = rule.endsLocal.slice(0, 10);
  const dayOffset = daysBetweenDates(anchorDate, anchorEndDate);
  const days = new Set(
    (rule.repeatDays ?? "")
      .split(",")
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value >= 0 && value <= 6),
  );
  if (days.size === 0) return [];

  const requestedStartDate = localDateFromEpoch(rangeStart);
  const requestedEndDate = localDateFromEpoch(rangeEnd);
  const firstDate = addDaysToDate(requestedStartDate, -Math.max(7, dayOffset));
  let date = firstDate < anchorDate ? anchorDate : firstDate;
  const intervals: Interval[] = [];

  while (date <= requestedEndDate) {
    const beforeAnchor = date < anchorDate;
    const afterLimit = Boolean(rule.repeatUntil && date > rule.repeatUntil);
    if (!beforeAnchor && !afterLimit && days.has(dayOfWeekForDate(date))) {
      const occurrenceStartLocal = localDateTimeFromParts(date, rule.startsLocal.slice(11));
      const occurrenceEndDate = addDaysToDate(date, dayOffset);
      const occurrenceEndLocal = localDateTimeFromParts(occurrenceEndDate, rule.endsLocal.slice(11));
      const start = localDateTimeToEpoch(occurrenceStartLocal, "Início recorrente");
      const end = localDateTimeToEpoch(occurrenceEndLocal, "Fim recorrente");
      if (end > rangeStart && start < rangeEnd) intervals.push({ start, end });
    }
    date = addDaysToDate(date, 1);
  }
  return intervals;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && a.end > b.start;
}

function continuouslyCovered(candidate: Interval, intervals: Interval[]): boolean {
  const sorted = intervals
    .filter(interval => interval.end > candidate.start && interval.start < candidate.end)
    .sort((a, b) => a.start - b.start);
  let cursor = candidate.start;
  for (const interval of sorted) {
    if (interval.end <= cursor) continue;
    if (interval.start > cursor) return false;
    cursor = Math.max(cursor, interval.end);
    if (cursor >= candidate.end) return true;
  }
  return false;
}

function clockToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function periodAt(epoch: number): RequiredPeriod {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epoch));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const minuteOfDay = Number(values.hour) * 60 + Number(values.minute);
  return minuteOfDay >= clockToMinutes(SFCC_RULES.day.start) && minuteOfDay < clockToMinutes(SFCC_RULES.day.end)
    ? "day"
    : "night";
}

function periodsFor(candidate: Interval): Set<RequiredPeriod> {
  const boundaries = new Set<number>([candidate.start, candidate.end]);
  const startDate = localDateFromEpoch(candidate.start);
  const endDate = localDateFromEpoch(candidate.end);
  let date = startDate;
  while (date <= endDate) {
    for (const time of [SFCC_RULES.day.start, SFCC_RULES.day.end]) {
      const boundary = localDateTimeToEpoch(`${date}T${time}`, "Limite do período");
      if (boundary > candidate.start && boundary < candidate.end) boundaries.add(boundary);
    }
    date = addDaysToDate(date, 1);
  }

  const ordered = [...boundaries].sort((a, b) => a - b);
  const periods = new Set<RequiredPeriod>();
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const midpoint = ordered[index] + Math.floor((ordered[index + 1] - ordered[index]) / 2);
    periods.add(periodAt(midpoint));
  }
  return periods;
}

export function requiredPeriodsForLocalInterval(startsLocal: string, endsLocal: string): RequiredPeriod[] {
  const start = localDateTimeToEpoch(startsLocal, "Início da cobertura");
  const end = localDateTimeToEpoch(endsLocal, "Fim da cobertura");
  if (end <= start) throw new Error("O fim da cobertura deve ser posterior ao início.");
  return [...periodsFor({ start, end })];
}

export type ScheduleConflict = "overlap" | "rest";

export function findScheduleConflict(
  startsLocal: string,
  endsLocal: string,
  existingShifts: ExistingShift[],
  excludeShiftId?: number,
): ScheduleConflict | null {
  const candidate = {
    start: localDateTimeToEpoch(startsLocal, "Início do turno"),
    end: localDateTimeToEpoch(endsLocal, "Fim do turno"),
  };
  if (candidate.end <= candidate.start) throw new Error("O fim do turno deve ser posterior ao início.");

  const existing = existingShifts.filter(shift => shift.status === "scheduled" && shift.id !== excludeShiftId);
  let restConflict = false;
  for (const shift of existing) {
    const prior = {
      start: localDateTimeToEpoch(shift.startsLocal, "Início do turno existente"),
      end: localDateTimeToEpoch(shift.endsLocal, "Fim do turno existente"),
    };
    if (overlaps(candidate, prior)) return "overlap";
    const rest = candidate.start >= prior.end ? candidate.start - prior.end : prior.start - candidate.end;
    if (rest < REST_PERIOD_MS) restConflict = true;
  }
  return restConflict ? "rest" : null;
}

export function validateNoOverlapAndRest(
  startsLocal: string,
  endsLocal: string,
  existingShifts: ExistingShift[],
  excludeShiftId?: number,
): void {
  const conflict = findScheduleConflict(startsLocal, endsLocal, existingShifts, excludeShiftId);
  if (conflict === "overlap") throw new Error("O participante já tem outro turno sobreposto neste intervalo.");
  if (conflict === "rest") {
    throw new Error(`O intervalo de descanso entre turnos precisa ser de pelo menos ${SFCC_RULES.minimumRestHoursBetweenTurns} horas.`);
  }
}

export function validateShiftCandidate(input: ShiftValidationInput): {
  startEpoch: number;
  endEpoch: number;
  classification: ShiftClassification;
} {
  const startEpoch = localDateTimeToEpoch(input.startsLocal, "Início do turno");
  const endEpoch = localDateTimeToEpoch(input.endsLocal, "Fim do turno");
  if (endEpoch <= startEpoch) throw new Error("O fim do turno deve ser posterior ao início.");
  if (!input.participant.active) throw new Error("Não é possível escalar um participante inativo.");

  const candidate = { start: startEpoch, end: endEpoch };
  const requiredPeriods = periodsFor(candidate);
  const unavailable = input.availability
    .filter(window => window.status === "unavailable")
    .flatMap(window => occurrencesFor(window, startEpoch, endEpoch));
  if (unavailable.some(interval => overlaps(candidate, interval))) {
    throw new Error("O participante declarou indisponibilidade durante parte deste turno.");
  }

  const available = input.availability
    .filter(window => window.status === "available")
    .flatMap(window => occurrencesFor(window, startEpoch, endEpoch));
  if (!continuouslyCovered(candidate, available)) {
    if (available.length === 0) {
      throw new Error("Não há disponibilidade informada que cubra este turno.");
    }
    throw new Error("O turno não está integralmente contido em uma janela de disponibilidade.");
  }

  const conflictingCommitment = input.commitments.find(commitment =>
    occurrencesFor(commitment, startEpoch, endEpoch).some(interval => overlaps(candidate, interval)),
  );
  if (conflictingCommitment) {
    throw new Error(`Conflito com o compromisso “${conflictingCommitment.description}”.`);
  }

  validateNoOverlapAndRest(input.startsLocal, input.endsLocal, input.existingShifts, input.excludeShiftId);

  const classification: ShiftClassification =
    requiredPeriods.size > 1 ? "misto" : requiredPeriods.has("day") ? "diurno" : "noturno";
  return { startEpoch, endEpoch, classification };
}

export function isLocalDateTime(value: string): boolean {
  try {
    localDateTimeToEpoch(value);
    return true;
  } catch {
    return false;
  }
}
