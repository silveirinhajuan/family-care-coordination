import { useState } from "react";
import { ArrowRight, CircleAlert, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { SFCC_RULES } from "@shared/sfccRules";
import { trpc } from "@/lib/trpc";
import { Field, PageHeading, Panel, StatusPill, fieldClass, fortalezaNowLocal, formatLocalLabel } from "@/components/sfcc/common";

function addCalendarDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export default function CoveragePage() {
  const today = fortalezaNowLocal().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(() => addCalendarDays(today, 6));
  const validRange = dateFrom !== "" && dateTo !== "" && dateTo >= dateFrom;
  const report = trpc.coverage.analyze.useQuery({ dateFrom, dateTo }, { enabled: validRange });
  const periods = report.data?.periods ?? [];
  const critical = periods.filter(period => period.status === "critical").length;
  const allowedGaps = periods.filter(period => period.status === "gap_allowed").length;
  const covered = periods.filter(period => period.status === "covered").length;

  return (
    <div>
      <PageHeading
        eyebrow="Fase 2 · Análise de cobertura"
        title="Onde ainda há lacunas?"
        description="A análise conta coberturas confirmadas pela pessoa ou registradas pela coordenação. Escalas pendentes, tentativas de cuidadora e acionamentos sem resposta registrada não fecham a lacuna."
        action={<Link href="/contingencies" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Contingências <ArrowRight className="h-4 w-4" /></Link>}
      />

      <Panel className="mb-5 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="De · horário de Fortaleza"><input type="date" className={fieldClass} value={dateFrom} onChange={event => setDateFrom(event.target.value)} /></Field>
          <Field label="Até · inclusive"><input type="date" className={fieldClass} value={dateTo} min={dateFrom} onChange={event => setDateTo(event.target.value)} /></Field>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Período diurno {SFCC_RULES.day.start}–{SFCC_RULES.day.end}: lacunas de até {SFCC_RULES.day.maxUncoveredMinutes} minutos consecutivos são permitidas. Período noturno {SFCC_RULES.night.start}–{SFCC_RULES.night.end}: qualquer lacuna é crítica.</p>
      </Panel>

      {!validRange ? <Panel className="p-5 text-sm text-rose-700">A data final deve ser igual ou posterior à inicial.</Panel> : null}
      {report.isLoading ? <Panel className="p-6 text-sm text-slate-500">Calculando períodos e confirmações…</Panel> : null}
      {report.error ? <Panel role="alert" className="p-5 text-sm leading-6 text-rose-800">{report.error.message}</Panel> : null}

      {report.data ? <>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Panel className="flex items-center gap-3 p-4"><div className="rounded-xl bg-rose-50 p-2 text-rose-800"><CircleAlert className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Períodos críticos</p><p className="mt-1 text-2xl font-semibold text-slate-900">{critical}</p></div></Panel>
          <Panel className="flex items-center gap-3 p-4"><div className="rounded-xl bg-amber-50 p-2 text-amber-800"><CircleAlert className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lacunas diurnas permitidas</p><p className="mt-1 text-2xl font-semibold text-slate-900">{allowedGaps}</p></div></Panel>
          <Panel className="flex items-center gap-3 p-4"><div className="rounded-xl bg-emerald-50 p-2 text-emerald-800"><ShieldCheck className="h-5 w-5" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Períodos sem lacunas</p><p className="mt-1 text-2xl font-semibold text-slate-900">{covered}</p></div></Panel>
        </div>

        {critical > 0 ? <div role="alert" className="mb-5 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm leading-6 text-rose-900"><strong>Há períodos sem cobertura confirmada dentro das regras.</strong> Revise as lacunas abaixo. Turnos pendentes não são tratados como cobertura.</div> : null}

        <div className="space-y-3">
          {periods.map(period => {
            const heading = period.period === "day" ? "Diurno" : "Noturno";
            const label = period.status === "covered"
              ? "Cobertura confirmada"
              : period.status === "critical"
                ? "Sem cobertura válida"
                : "Lacuna dentro do limite";
            const tone = period.status === "covered" ? "good" : period.status === "critical" ? "bad" : "warn";
            return (
              <Panel key={`${period.date}-${period.period}`} className="overflow-hidden">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <div><p className="text-sm font-semibold text-slate-900">{heading} · {formatLocalLabel(period.startsLocal)}</p><p className="mt-1 text-xs text-slate-500">{period.startsLocal.slice(11)}–{period.endsLocal.slice(11)} · fim {formatLocalLabel(period.endsLocal)}</p></div>
                  <StatusPill tone={tone}>{label}</StatusPill>
                </div>
                {period.status === "critical" ? <p role="status" className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950 sm:px-5"><strong>Ação recomendada:</strong> {period.period === "night" ? "verifique primeiro a cobertura familiar autorizada; se a família não puder cobrir, registre tentativa de cuidadora e, após indisponibilidade/recusa, acione manualmente um familiar designado. O intervalo só conta após aceite explícito." : "solicite disponibilidade familiar e ajuste a escala; se não houver solução para reduzir esta lacuna acima de 60 minutos, avalie uma tentativa de cuidadora."}</p> : null}
                {period.gaps.length ? <ul className="divide-y divide-slate-100">
                  {period.gaps.map((gap, index) => <li key={`${gap.startsLocal}-${index}`} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                    <div><p className="text-sm font-semibold text-slate-800">Sem cobertura · {gap.startsLocal.slice(11)}–{gap.endsLocal.slice(11)} ({gap.minutes} min)</p>{gap.reason ? <p className="mt-1 text-xs leading-5 text-slate-600">{gap.reason}</p> : <p className="mt-1 text-xs leading-5 text-slate-500">Nenhuma atribuição confirmada cobre este intervalo.</p>}</div>
                    <StatusPill tone={gap.critical ? "bad" : "warn"}>{gap.critical ? "Exige resolução" : "Dentro do limite diurno"}</StatusPill>
                  </li>)}
                </ul> : <p className="px-4 py-3 text-xs text-emerald-800 sm:px-5">Sem intervalos descobertos neste período.</p>}
              </Panel>
            );
          })}
        </div>
      </> : null}
    </div>
  );
}
