import { trpc } from "@/lib/trpc";
import { ArrowRight, CalendarCheck2, CircleAlert, Clock3, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { PageHeading, Panel, StatusPill, formatLocalLabel, fortalezaNowLocal } from "@/components/sfcc/common";

function SummaryCard({ icon: Icon, label, value, note }: { icon: typeof UsersRound; label: string; value: string; note: string }) {
  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{note}</p>
        </div>
        <div className="rounded-xl bg-teal-50 p-2.5 text-teal-800"><Icon className="h-5 w-5" /></div>
      </div>
    </Panel>
  );
}

export default function Home({ isAdmin }: { isAdmin: boolean }) {
  const participantsQuery = trpc.participants.activeCount.useQuery();
  const shiftsQuery = trpc.shifts.list.useQuery();
  const shifts = shiftsQuery.data ?? [];
  const activeParticipants = participantsQuery.data?.count ?? 0;
  const activeShifts = shifts.filter(shift => shift.status === "scheduled");
  const pendingShifts = activeShifts.filter(shift => shift.confirmationStatus === "pending");
  const now = fortalezaNowLocal();
  const currentShift = activeShifts.find(shift => shift.startsLocal <= now && shift.endsLocal > now);
  const futureShifts = activeShifts.filter(shift => shift.startsLocal > now);
  const nextShifts = currentShift ? [currentShift, ...futureShifts.slice(0, 3)] : futureShifts.slice(0, 4);
  const isLoading = participantsQuery.isLoading || shiftsQuery.isLoading;

  return (
    <div>
      <PageHeading
        eyebrow="Coordenação familiar · Fortaleza"
        title="A escala começa com clareza."
        description="Organize quem pode acompanhar, registre compromissos e planeje turnos sem confundir disponibilidade com confirmação."
      />

      <section className="mb-6 rounded-3xl bg-[var(--brand)] p-5 text-white sm:p-7">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusPill tone="neutral">Fase 1 · Base operacional</StatusPill>
              <span className="text-xs text-teal-50/90">Horário de Fortaleza</span>
            </div>
            <h2 className="text-xl font-semibold leading-snug sm:text-2xl">Cada turno começa com disponibilidade informada e autorização verificada.</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-teal-50/90">O SFCC cuida da coordenação administrativa. Informações clínicas e decisões assistenciais ficam fora do sistema.</p>
          </div>
          <Link href={isAdmin ? "/participants" : "/my-availability"} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl bg-white px-4 text-sm font-semibold text-teal-900 transition hover:bg-teal-50 sm:self-auto">
            {isAdmin ? "Organizar acompanhantes" : "Minha disponibilidade"} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <div className="mb-7 grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={UsersRound} label="Acompanhantes ativos" value={isLoading ? "—" : String(activeParticipants)} note="Total agregado, sem exibir o diretório" />
        <SummaryCard icon={CalendarCheck2} label="Turnos planejados" value={isLoading ? "—" : String(activeShifts.length)} note="Sugestões aguardam aceite" />
        <SummaryCard icon={CircleAlert} label="Confirmações pendentes" value={isLoading ? "—" : String(pendingShifts.length)} note="Disponível não significa confirmado" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <p className="text-sm font-semibold text-slate-900">{currentShift ? "Turno atual e próximos" : "Próximos turnos"}</p>
              <p className="mt-1 text-xs text-slate-500">Turnos planejados não contam como cobertura antes do aceite.</p>
            </div>
            <Link href="/shifts" className="text-xs font-semibold text-teal-800 hover:underline">Ver escala</Link>
          </div>
          {shiftsQuery.isLoading ? (
            <div className="p-6 text-sm text-slate-500">Carregando escala…</div>
          ) : nextShifts.length ? (
            <div className="divide-y divide-slate-100">
              {nextShifts.map(shift => (
                <div key={shift.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-slate-100 p-2 text-slate-600"><Clock3 className="h-4 w-4" /></div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{shift.participantName}</p>
                      <p className="mt-1 text-xs text-slate-600">{formatLocalLabel(shift.startsLocal)} → {shift.endsLocal.slice(11)} · {shift.classification}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {currentShift?.id === shift.id ? <StatusPill tone="neutral">Em andamento</StatusPill> : null}
                    <StatusPill tone={shift.confirmationStatus === "accepted" ? "good" : shift.confirmationStatus === "pending" ? "warn" : "neutral"}>{shift.confirmationStatus === "accepted" ? "Confirmado" : shift.confirmationStatus === "declined" ? "Recusado" : shift.confirmationStatus === "cancelled" ? "Cancelado" : "Aguardando confirmação"}</StatusPill>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 sm:px-6">
              <p className="text-sm font-semibold text-slate-800">Ainda não há turnos planejados.</p>
              <p className="mt-1 text-sm text-slate-500">Cadastre participantes, disponibilidades e compromissos antes de criar o primeiro turno.</p>
              <Link href={isAdmin ? "/availability" : "/my-availability"} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-800 hover:underline">{isAdmin ? "Registrar disponibilidade" : "Informar minha disponibilidade"} <ArrowRight className="h-4 w-4" /></Link>
            </div>
          )}
        </Panel>

        <Panel className="p-5 sm:p-6">
          <p className="text-sm font-semibold text-slate-900">Próximos passos</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">A base operacional mantém as regras importantes visíveis desde o início.</p>
          <div className="mt-5 space-y-3">
            {(isAdmin ? [
              { href: "/participants", number: "01", title: "Cadastrar acompanhantes", text: "Categorias, autorização e grupo emergencial." },
              { href: "/availability", number: "02", title: "Informar disponibilidades", text: "pessoa acompanhadalas disponíveis e explicitamente indisponíveis." },
              { href: "/commitments", number: "03", title: "Registrar compromissos", text: "Conflitos pontuais ou recorrentes." },
              { href: "/shifts", number: "04", title: "Planejar turnos", text: "Validação de cobertura pessoal e descanso." },
            ] : [
              { href: "/my-availability", number: "01", title: "Minha disponibilidade", text: "Declare janelas em que você pode acompanhar." },
              { href: "/shifts", number: "02", title: "Ver escala", text: "Consulte os turnos e estados de confirmação." },
            ]).map(item => (
              <Link key={item.href} href={item.href} className="group flex gap-3 rounded-xl border border-slate-100 p-3 transition hover:border-teal-200 hover:bg-teal-50/40">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600 group-hover:bg-teal-100 group-hover:text-teal-900">{item.number}</span>
                <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{item.title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{item.text}</span></span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
