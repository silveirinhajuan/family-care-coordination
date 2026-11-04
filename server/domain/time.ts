import { SFCC_RULES } from "../../shared/sfccRules";

export const BUSINESS_TIME_ZONE = SFCC_RULES.timeZone;

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const zonedFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsAt(epochMilliseconds: number): LocalDateTimeParts {
  const parts = zonedFormatter.formatToParts(new Date(epochMilliseconds));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function pseudoUtc(parts: LocalDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

function sameMinute(a: LocalDateTimeParts, b: LocalDateTimeParts): boolean {
  return (
    a.year === b.year &&
    a.month === b.month &&
    a.day === b.day &&
    a.hour === b.hour &&
    a.minute === b.minute
  );
}

export function assertLocalDateTime(value: string, label = "Data e hora"): LocalDateTimeParts {
  const match = localDateTimePattern.exec(value);
  if (!match) throw new Error(`${label}: informe uma data e hora válidas.`);

  const [, year, month, day, hour, minute] = match;
  const parts: LocalDateTimeParts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: 0,
  };
  const check = new Date(pseudoUtc(parts));
  if (
    check.getUTCFullYear() !== parts.year ||
    check.getUTCMonth() + 1 !== parts.month ||
    check.getUTCDate() !== parts.day ||
    parts.hour > 23 ||
    parts.minute > 59
  ) {
    throw new Error(`${label}: informe uma data e hora válidas.`);
  }
  return parts;
}

export function localDateTimeToEpoch(value: string, label = "Data e hora"): number {
  const desired = assertLocalDateTime(value, label);
  const wantedAsUtc = pseudoUtc(desired);
  let guess = wantedAsUtc;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const observed = partsAt(guess);
    const correction = wantedAsUtc - pseudoUtc(observed);
    if (correction === 0 && sameMinute(observed, desired)) {
      // A second valid instant can occur during a daylight-saving fold. Reject
      // ambiguous wall times instead of silently choosing the wrong handoff.
      for (const delta of [-60 * 60_000, 60 * 60_000]) {
        if (sameMinute(partsAt(guess + delta), desired)) {
          throw new Error(`${label}: esse horário é ambíguo no fuso ${BUSINESS_TIME_ZONE}.`);
        }
      }
      return guess;
    }
    guess += correction;
  }

  throw new Error(`${label}: esse horário não existe no fuso ${BUSINESS_TIME_ZONE}.`);
}

export function isValidLocalDateTime(value: string): boolean {
  try {
    localDateTimeToEpoch(value);
    return true;
  } catch {
    return false;
  }
}

export function localDateTimeToIso(value: string, label = "Data e hora"): string {
  return new Date(localDateTimeToEpoch(value, label)).toISOString();
}

export function isoToLocalDateTime(value: string): string {
  const parts = partsAt(new Date(value).getTime());
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function localDateTimeLabel(value: string): string {
  const epoch = localDateTimeToEpoch(value);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(epoch));
}

export function localDateFromEpoch(epochMilliseconds: number): string {
  const parts = partsAt(epochMilliseconds);
  return `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function localDateTimeFromParts(date: string, time: string): string {
  if (!localDatePattern.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Data recorrente inválida.");
  }
  return `${date}T${time}`;
}

export function addDaysToDate(date: string, days: number): string {
  if (!localDatePattern.test(date)) throw new Error("Data inválida.");
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

export function daysBetweenDates(start: string, end: string): number {
  if (!localDatePattern.test(start) || !localDatePattern.test(end)) throw new Error("Data inválida.");
  const startEpoch = Date.parse(`${start}T00:00:00.000Z`);
  const endEpoch = Date.parse(`${end}T00:00:00.000Z`);
  return Math.round((endEpoch - startEpoch) / 86_400_000);
}

export function dayOfWeekForDate(date: string): number {
  if (!localDatePattern.test(date)) throw new Error("Data inválida.");
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function todayInBusinessTimeZone(now = new Date()): string {
  return localDateFromEpoch(now.getTime());
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}
