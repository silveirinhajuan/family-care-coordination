import type { ReactNode } from "react";
import { SFCC_RULES } from "@shared/sfccRules";

export const WEEKDAYS = [
  { value: 0, label: "Dom", full: "domingo" },
  { value: 1, label: "Seg", full: "segunda-feira" },
  { value: 2, label: "Ter", full: "terça-feira" },
  { value: 3, label: "Qua", full: "quarta-feira" },
  { value: 4, label: "Qui", full: "quinta-feira" },
  { value: 5, label: "Sex", full: "sexta-feira" },
  { value: 6, label: "Sáb", full: "sábado" },
] as const;

export type RecurrenceValue = {
  recurrence: "once" | "weekly";
  startsLocal: string;
  endsLocal: string;
  repeatDays: number[];
  repeatUntil: string;
};

export function fortalezaNowLocal(): string {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: SFCC_RULES.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date()).map(part => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

export function addLocalHours(value: string, hours: number): string {
  const date = new Date(`${value}:00.000Z`);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString().slice(0, 16);
}

export function freshRecurrenceValue(): RecurrenceValue {
  const startsLocal = fortalezaNowLocal();
  return {
    recurrence: "once",
    startsLocal,
    endsLocal: addLocalHours(startsLocal, 2),
    repeatDays: [],
    repeatUntil: "",
  };
}

export function fortalezaWeekday(value: string): number {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`).getUTCDay();
}

export function formatLocalLabel(value: string): string {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
  return `${dateLabel} · ${time}`;
}

export function recurrenceLabel(value: {
  recurrence: "once" | "weekly";
  startsLocal: string;
  endsLocal: string;
  repeatDays: string | null;
  repeatUntil: string | null;
}): string {
  if (value.recurrence === "once") {
    return `${formatLocalLabel(value.startsLocal)}–${value.endsLocal.slice(11)}`;
  }
  const days = (value.repeatDays ?? "")
    .split(",")
    .map(Number)
    .filter(day => Number.isInteger(day))
    .map(day => WEEKDAYS.find(item => item.value === day)?.label)
    .filter(Boolean)
    .join(", ");
  const until = value.repeatUntil ? ` até ${value.repeatUntil}` : " sem data final";
  return `Semanal (${days || "dias não definidos"}) · ${value.startsLocal.slice(11)}–${value.endsLocal.slice(11)}${until}`;
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">{eyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Panel({ children, className = "", role }: { children: ReactNode; className?: string; role?: "alert" | "status" }) {
  return <section role={role} className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_-24px_rgba(18,52,49,0.4)] ${className}`}>{children}</section>;
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const fieldClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-[var(--brand)] focus:ring-4 focus:ring-teal-900/10 disabled:cursor-not-allowed disabled:bg-slate-100";

export function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "brand" }) {
  const tones = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    bad: "border-rose-200 bg-rose-50 text-rose-800",
    brand: "border-teal-200 bg-teal-50 text-teal-800",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone]}`}>{children}</span>;
}

export function RecurrenceFields({ value, onChange }: { value: RecurrenceValue; onChange: (value: RecurrenceValue) => void }) {
  const update = (changes: Partial<RecurrenceValue>) => onChange({ ...value, ...changes });
  const updateDateTime = (field: "startsLocal" | "endsLocal", next: string) => {
    const changes: Partial<RecurrenceValue> = { [field]: next };
    if (field === "startsLocal" && value.recurrence === "weekly" && value.repeatDays.length === 0 && next) {
      changes.repeatDays = [fortalezaWeekday(next)];
    }
    update(changes);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Início · horário de Fortaleza">
          <input type="datetime-local" required className={fieldClass} value={value.startsLocal} onChange={event => updateDateTime("startsLocal", event.target.value)} />
        </Field>
        <Field label="Fim · horário de Fortaleza" hint="Para atravessar a meia-noite, escolha a data seguinte.">
          <input type="datetime-local" required className={fieldClass} value={value.endsLocal} onChange={event => updateDateTime("endsLocal", event.target.value)} />
        </Field>
      </div>
      <Field label="Recorrência">
        <select className={fieldClass} value={value.recurrence} onChange={event => {
          const recurrence = event.target.value as RecurrenceValue["recurrence"];
          update({ recurrence, repeatDays: recurrence === "weekly" && value.repeatDays.length === 0 ? [fortalezaWeekday(value.startsLocal)] : value.repeatDays });
        }}>
          <option value="once">Uma vez</option>
          <option value="weekly">Semanal</option>
        </select>
      </Field>
      {value.recurrence === "weekly" ? (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3.5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Repetir nos dias</legend>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {WEEKDAYS.map(day => {
                const checked = value.repeatDays.includes(day.value);
                return (
                  <label key={day.value} className={`flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition ${checked ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600"}`}>
                    <input
                      type="checkbox"
                      className="accent-teal-800"
                      checked={checked}
                      aria-label={day.full}
                      onChange={() => update({ repeatDays: checked ? value.repeatDays.filter(item => item !== day.value) : [...value.repeatDays, day.value].sort((a, b) => a - b) })}
                    />
                    {day.label}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Field label="Repetir até (opcional)" hint="Deixe em branco para manter a regra semanal sem data final.">
            <input type="date" className={fieldClass} value={value.repeatUntil} min={value.startsLocal.slice(0, 10)} onChange={event => update({ repeatUntil: event.target.value })} />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
