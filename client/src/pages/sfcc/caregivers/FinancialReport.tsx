import { useState } from "react";
import { BarChart3, CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Field, Panel, fieldClass } from "../../../components/sfcc/common";
import { formatBrlCents } from "@shared/caregiverFinance";
import { SFCC_RULES } from "@shared/sfccRules";
import { BookingStatusPill, formatDate, formatShiftRange, PaymentStatusPill } from "./shared";

function todayInFortaleza(): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: SFCC_RULES.timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthEnd(date: string): string {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;
}

export default function FinancialReport() {
  const today = todayInFortaleza();
  const monthStart = `${today.slice(0, 7)}-01`;
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(monthEnd(today));
  const [caregiverParticipantId, setCaregiverParticipantId] = useState("");
  const [shiftType, setShiftType] = useState("");
  const caregivers = trpc.caregivers.directory.useQuery();
  const query = trpc.caregivers.report.useQuery({
    dateFrom,
    dateTo,
    caregiverParticipantId: caregiverParticipantId ? Number(caregiverParticipantId) : null,
    shiftType: shiftType ? shiftType as "diurno" | "noturno" | "misto" : null,
  }, { enabled: dateFrom <= dateTo });

  const result = query.data;
  const summary = result?.summary;
  const totalPayments = (result?.rows ?? []).flatMap(row => row.payments);

  return (
    <div className="space-y-5">
      <Panel className="p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-teal-800" /><h2 className="text-sm font-semibold text-slate-900">Filtros do relatório</h2></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Data inicial do período"><input type="date" className={fieldClass} value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></Field>
          <Field label="Data final do período"><input type="date" min={dateFrom} className={fieldClass} value={dateTo} onChange={event => setDateTo(event.target.value)} /></Field>
          <Field label="Cuidadora"><select className={fieldClass} value={caregiverParticipantId} onChange={event => setCaregiverParticipantId(event.target.value)}><option value="">Todas</option>{(caregivers.data ?? []).map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select></Field>
          <Field label="Tipo de turno"><select className={fieldClass} value={shiftType} onChange={event => setShiftType(event.target.value)}><option value="">Todos</option><option value="diurno">Diurno</option><option value="noturno">Noturno</option><option value="misto">Misto</option></select></Field>
        </div>
        <p className="mt-3 text-xs text-slate-500">Pagamentos feitos no período são filtrados pela data de quitação; contratações, pendências e previsões usam a data de início do turno. Nenhum preço de referência é tratado como valor contratado.</p>
      </Panel>

      {dateTo < dateFrom ? <Panel className="p-4 text-sm text-rose-700">A data final deve ser igual ou posterior à inicial.</Panel> : null}
      {query.isLoading ? <Panel className="p-5 text-sm text-slate-500">Calculando relatório…</Panel> : query.error ? <Panel className="p-5 text-sm text-rose-700">{query.error.message}</Panel> : summary ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <SummaryCard label="Pagamentos feitos no período" value={formatBrlCents(summary.paidOnDateRangeCents)} detail="Filtrado pela data efetiva de quitação." tone="good" />
          <SummaryCard label="Pagos em turnos iniciados no período" value={formatBrlCents(summary.paidCents)} detail="Vinculado à data do turno, ainda que quitado em outra data." tone="neutral" />
          <SummaryCard label="Pagamentos pendentes registrados" value={formatBrlCents(summary.pendingCents)} detail="Soma de parcelas Pendentes; não inclui previsão." tone="warn" />
          <SummaryCard label="Contratado, ainda não marcado realizado" value={formatBrlCents(summary.contractedNotPerformedCents)} detail="Valor de contratações confirmadas em turnos ativos." tone="neutral" />
          <SummaryCard label="Previsão de turnos futuros confirmados" value={formatBrlCents(summary.futureConfirmedCents)} detail="Compromissos futuros, não despesas pagas." tone="brand" />
        </div>

        <Panel className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-teal-800" /><h2 className="text-sm font-semibold text-slate-900">Totais por dia do turno</h2></div></div>
          {!result.daily.length ? <p className="p-5 text-sm text-slate-500">Nenhuma tentativa ou contratação no período selecionado.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Dia</th><th className="px-5 py-3">Pago</th><th className="px-5 py-3">Pendente</th><th className="px-5 py-3">Contratado não realizado</th><th className="px-5 py-3">Futuro confirmado</th></tr></thead><tbody className="divide-y divide-slate-100">{result.daily.map(day => <tr key={day.date}><td className="px-5 py-3 font-medium text-slate-800">{formatDate(day.date)}</td><td className="px-5 py-3 tabular-nums">{formatBrlCents(day.paidCents)}</td><td className="px-5 py-3 tabular-nums">{formatBrlCents(day.pendingCents)}</td><td className="px-5 py-3 tabular-nums">{formatBrlCents(day.contractedNotPerformedCents)}</td><td className="px-5 py-3 tabular-nums">{formatBrlCents(day.futureConfirmedCents)}</td></tr>)}</tbody></table></div>}
        </Panel>

        <Panel className="overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Detalhamento por cuidadora e turno</h2></div>
          {!result.rows.length ? <p className="p-5 text-sm text-slate-500">Nenhum dado para os filtros escolhidos.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Cuidadora / turno</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Contratação</th><th className="px-4 py-3">Valor combinado</th><th className="px-4 py-3">Pago / data</th><th className="px-4 py-3">Pendente</th><th className="px-4 py-3">Cancelamento</th></tr></thead><tbody className="divide-y divide-slate-100">{result.rows.map(row => <tr key={row.bookingId}><td className="px-4 py-3"><p className="font-semibold text-slate-800">{row.caregiverName}</p><p className="mt-1 text-xs text-slate-500">Turno: {formatShiftRange(row.startsLocal, row.endsLocal)}</p><p className="mt-1 text-xs text-slate-500">Cobertura: {formatShiftRange(row.coverageStartsLocal, row.coverageEndsLocal)}</p></td><td className="px-4 py-3 capitalize text-slate-600">{row.shiftType}</td><td className="px-4 py-3"><BookingStatusPill status={row.bookingStatus} /></td><td className="px-4 py-3 tabular-nums">{formatBrlCents(row.amountCents)}</td><td className="px-4 py-3 tabular-nums">{formatBrlCents(row.payments.filter(p => p.status === "pago").reduce((n, p) => n + p.amountCents, 0))}{row.payments.filter(p => p.status === "pago").map(payment => <p key={payment.id} className="mt-1 text-xs font-normal text-slate-500">{payment.paidOn ? formatDate(payment.paidOn) : "Data ausente"} · {formatBrlCents(payment.amountCents)}</p>)}</td><td className="px-4 py-3 tabular-nums">{formatBrlCents(row.payments.filter(p => p.status === "pendente").reduce((n, p) => n + p.amountCents, 0))}</td><td className="px-4 py-3 tabular-nums">{formatBrlCents(row.cancellationFeeCents)}</td></tr>)}</tbody></table></div>}
          {totalPayments.some(payment => payment.status === "cancelado") ? <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Pagamentos cancelados durante cancelamento da contratação permanecem no histórico e não entram nos totais.</p> : null}
        </Panel>
      </> : null}
    </div>
  );
}

function SummaryCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "good" | "warn" | "neutral" | "brand" }) {
  const border = { good: "border-emerald-200", warn: "border-amber-200", neutral: "border-slate-200", brand: "border-teal-200" }[tone];
  const valueColor = { good: "text-emerald-900", warn: "text-amber-900", neutral: "text-slate-900", brand: "text-teal-900" }[tone];
  return <Panel className={`border ${border} p-4 sm:p-5`}><p className="text-xs font-semibold leading-5 text-slate-600">{label}</p><p className={`mt-2 text-xl font-semibold tabular-nums ${valueColor}`}>{value}</p><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p></Panel>;
}
