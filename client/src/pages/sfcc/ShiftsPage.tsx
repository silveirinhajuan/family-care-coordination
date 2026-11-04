import { trpc } from "@/lib/trpc";
import { CalendarClock, Check, Edit3, Plus, Trash2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SFCC_RULES } from "@shared/sfccRules";
import {
  Field,
  PageHeading,
  Panel,
  StatusPill,
  addLocalHours,
  fieldClass,
  fortalezaNowLocal,
  formatLocalLabel,
} from "@/components/sfcc/common";

type ShiftItem = {
  id: number;
  assignmentId: number;
  startsLocal: string;
  endsLocal: string;
  classification: "diurno" | "noturno" | "misto";
  status: "scheduled" | "cancelled";
  notes: string | null;
  participantId: number;
  isMine: boolean;
  participantName: string;
  category: string;
  participantActive: boolean;
  confirmationStatus: "pending" | "accepted" | "declined" | "cancelled";
  restBeforeMinutes: number | null;
  restAfterMinutes: number | null;
};

type ShiftForm = {
  participantId: number | null;
  startsLocal: string;
  endsLocal: string;
  notes: string;
};
type ResponseSource = "whatsapp" | "telefone" | "presencial" | "outro";

function newStart() {
  return addLocalHours(fortalezaNowLocal(), 1);
}

function formatRest(minutes: number) {
  if (minutes < 0) return "sobreposição";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${String(remainingMinutes).padStart(2, "0")}`;
}

function RestIndicator({ minutes, label }: { minutes: number | null; label: string }) {
  if (minutes === null) return <StatusPill tone="neutral">Sem turno adjacente para comparar descanso</StatusPill>;
  const tone = minutes < SFCC_RULES.minimumRestHoursBetweenTurns * 60 ? "bad" : "good";
  return <StatusPill tone={tone}>Descanso {label}: {formatRest(minutes)}</StatusPill>;
}

export default function ShiftsPage({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const peopleQuery = trpc.participants.adminList.useQuery(undefined, { enabled: isAdmin });
  const people = peopleQuery.data?.filter(person => person.active) ?? [];
  const shiftsQuery = trpc.shifts.list.useQuery();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [responseSources, setResponseSources] = useState<Record<number, ResponseSource | "">>({});
  const [form, setForm] = useState<ShiftForm>(() => {
    const startsLocal = newStart();
    return { participantId: null, startsLocal, endsLocal: addLocalHours(startsLocal, 4), notes: "" };
  });

  useEffect(() => {
    if (form.participantId === null && people.length) {
      setForm(current => ({ ...current, participantId: people[0].id }));
    }
  }, [form.participantId, people]);

  const create = trpc.shifts.create.useMutation({ onSuccess: () => utils.shifts.list.invalidate() });
  const update = trpc.shifts.update.useMutation({ onSuccess: () => utils.shifts.list.invalidate() });
  const cancel = trpc.shifts.cancel.useMutation({ onSuccess: () => utils.shifts.list.invalidate() });
  const respond = trpc.shifts.respond.useMutation({ onSuccess: () => {
    void utils.shifts.list.invalidate();
    void utils.coverage.analyze.invalidate();
  } });
  const coordinatorRespond = trpc.shifts.coordinatorRespond.useMutation({
    onSuccess: result => {
      void utils.shifts.list.invalidate();
      void utils.coverage.analyze.invalidate();
      toast.success(result.confirmationStatus === "accepted" ? "Aceite informado registrado pela coordenação." : result.confirmationStatus === "declined" ? "Recusa informada registrada pela coordenação." : "Cancelamento informado registrado pela coordenação.");
    },
    onError: error => toast.error(error.message),
  });
  const pending = create.isPending || update.isPending;
  const list = (shiftsQuery.data ?? []) as ShiftItem[];

  const beginCreate = () => {
    const startsLocal = newStart();
    setEditing(null);
    setForm({ participantId: people[0]?.id ?? null, startsLocal, endsLocal: addLocalHours(startsLocal, 4), notes: "" });
    setFormError(null);
    setFormOpen(true);
  };

  const beginEdit = (item: ShiftItem) => {
    setEditing(item);
    setForm({ participantId: item.participantId, startsLocal: item.startsLocal, endsLocal: item.endsLocal, notes: item.notes ?? "" });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setFormError(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.participantId === null) return;
    setFormError(null);
    const value = {
      participantId: form.participantId,
      startsLocal: form.startsLocal,
      endsLocal: form.endsLocal,
      notes: form.notes || null,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...value });
      else await create.mutateAsync(value);
      toast.success(editing ? "Turno atualizado; aguarda confirmação." : "Turno planejado; aguarda confirmação.");
      closeForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar o turno.");
    }
  };

  return (
    <div>
      <PageHeading
        eyebrow="Fase 1 · Escala manual"
        title="Turnos planejados"
        description="O sistema valida disponibilidade, compromissos, sobreposição e descanso. Um turno planejado continua pendente até a resposta da pessoa ou o registro explícito da coordenação."
        action={isAdmin && people.length ? (
          <button onClick={beginCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-teal-900">
            <Plus className="h-4 w-4" /> Novo turno
          </button>
        ) : null}
      />

      {!isAdmin ? <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">A criação e edição de turnos estão restritas ao coordenador nesta etapa.</div> : null}

      {formOpen && isAdmin ? (
        <Panel className="mb-6 p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">{editing ? "Editar turno" : "Planejar turno"}</h2>
              <p className="mt-1 text-xs text-slate-500">Todos os horários são interpretados em {SFCC_RULES.timeZone}.</p>
            </div>
            <button onClick={closeForm} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Fechar</button>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Acompanhante">
              <select required className={fieldClass} value={form.participantId ?? ""} onChange={event => setForm(current => ({ ...current, participantId: Number(event.target.value) }))}>
                {people.map(person => <option key={person.id} value={person.id}>{person.displayName} · {person.category}</option>)}
              </select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Início · horário de Fortaleza">
                <input type="datetime-local" required className={fieldClass} value={form.startsLocal} onChange={event => setForm(current => ({ ...current, startsLocal: event.target.value }))} />
              </Field>
              <Field label="Fim · horário de Fortaleza" hint="Para turno que atravessa a meia-noite, selecione a data seguinte.">
                <input type="datetime-local" required className={fieldClass} value={form.endsLocal} onChange={event => setForm(current => ({ ...current, endsLocal: event.target.value }))} />
              </Field>
            </div>
            <Field label="Observação administrativa (opcional)">
              <textarea maxLength={1000} rows={2} className={fieldClass} value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Não inclua informações clínicas." />
            </Field>
            {formError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-5 text-rose-800">{formError}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeForm} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button disabled={pending || !people.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
                <Check className="h-4 w-4" />{pending ? "Validando…" : editing ? "Salvar alterações" : "Salvar turno pendente"}
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Escala registrada</h2>
        <span className="text-xs text-slate-500">Pendente ≠ cobertura confirmada</span>
      </div>

      {isAdmin && !people.length && !peopleQuery.isLoading ? (
        <Panel className="p-7">
          <p className="text-sm font-semibold text-slate-800">Cadastre um acompanhante primeiro</p>
          <p className="mt-1 text-sm text-slate-500">Para criar turno, será necessário ter disponibilidade informada para o período.</p>
        </Panel>
      ) : shiftsQuery.isLoading ? (
        <Panel className="p-6 text-sm text-slate-500">Carregando turnos…</Panel>
      ) : shiftsQuery.error ? (
        <Panel className="p-6 text-sm text-rose-700">{shiftsQuery.error.message}</Panel>
      ) : list.length === 0 ? (
        <Panel className="flex flex-col items-center p-9 text-center">
          <CalendarClock className="mb-3 h-6 w-6 text-teal-800" />
          <p className="text-sm font-semibold text-slate-800">Nenhum turno planejado</p>
          <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">Depois de cadastrar acompanhante e informar disponibilidade, você poderá registrar o primeiro turno manual.</p>
        </Panel>
      ) : (
        <div className="space-y-3">
          {list.map(item => {
            const restMinutes = item.restBeforeMinutes ?? item.restAfterMinutes;
            const restLabel = item.restBeforeMinutes !== null ? "desde o anterior" : "até o próximo";
            return (
              <Panel key={item.id} className={`p-4 sm:p-5 ${item.status === "cancelled" ? "opacity-60" : ""}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-0.5 rounded-xl bg-slate-100 p-2.5 text-slate-600"><CalendarClock className="h-4 w-4" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{item.participantName}</p>
                        <StatusPill tone={item.status === "cancelled" || item.confirmationStatus === "cancelled" || item.confirmationStatus === "declined" ? "neutral" : item.confirmationStatus === "accepted" ? "good" : "warn"}>
                          {item.status === "cancelled" || item.confirmationStatus === "cancelled" ? "Cancelado" : item.confirmationStatus === "accepted" ? "Confirmado" : item.confirmationStatus === "declined" ? "Recusado" : "Aguardando confirmação"}
                        </StatusPill>
                        {item.status === "scheduled" ? <RestIndicator minutes={restMinutes} label={restLabel} /> : null}
                      </div>
                      <p className="mt-1.5 text-xs text-slate-600">{formatLocalLabel(item.startsLocal)} → {formatLocalLabel(item.endsLocal)} · {item.classification}</p>
                      {item.notes ? <p className="mt-1 text-xs text-slate-500">{item.notes}</p> : null}
                    </div>
                  </div>
                  {isAdmin && item.status === "scheduled" ? (
                    <div className="flex shrink-0 flex-col gap-2">
                      <div className="flex gap-2">
                        <button onClick={() => beginEdit(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Editar</button>
                        <button onClick={() => cancel.mutate({ id: item.id }, { onSuccess: () => toast.success("Turno cancelado; a cobertura deve ser reavaliada."), onError: error => toast.error(error.message) })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Cancelar turno</button>
                      </div>
                      {item.confirmationStatus === "pending" || item.confirmationStatus === "accepted" ? <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50/50 p-3">
                        <label className="block text-[11px] font-semibold text-slate-700">Resposta recebida por
                          <select aria-label={`Canal da resposta de ${item.participantName}`} className={`${fieldClass} mt-1 min-h-9`} value={responseSources[item.assignmentId] ?? ""} onChange={event => setResponseSources(current => ({ ...current, [item.assignmentId]: event.target.value as ResponseSource | "" }))}>
                            <option value="">Selecione o canal</option><option value="whatsapp">WhatsApp</option><option value="telefone">Telefone</option><option value="presencial">Presencial</option><option value="outro">Outro</option>
                          </select>
                        </label>
                        {item.confirmationStatus === "pending" ? <div className="flex flex-wrap gap-2">
                          <button disabled={coordinatorRespond.isPending || !responseSources[item.assignmentId]} onClick={() => coordinatorRespond.mutate({ assignmentId: item.assignmentId, response: "accepted", source: responseSources[item.assignmentId] as ResponseSource })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-teal-800 px-3 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Registrar aceite informado</button>
                          <button disabled={coordinatorRespond.isPending || !responseSources[item.assignmentId]} onClick={() => coordinatorRespond.mutate({ assignmentId: item.assignmentId, response: "declined", source: responseSources[item.assignmentId] as ResponseSource })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" />Registrar recusa</button>
                        </div> : <button disabled={coordinatorRespond.isPending || !responseSources[item.assignmentId]} onClick={() => coordinatorRespond.mutate({ assignmentId: item.assignmentId, response: "cancelled", source: responseSources[item.assignmentId] as ResponseSource })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><XCircle className="h-3.5 w-3.5" />Registrar cancelamento informado</button>}
                        <p className="text-[10px] leading-4 text-slate-600">A auditoria identifica a coordenação como quem registrou a resposta, não como se a pessoa tivesse usado o app.</p>
                      </div> : null}
                    </div>
                  ) : null}
                  {!isAdmin && item.isMine && item.status === "scheduled" && item.confirmationStatus === "pending" ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button disabled={respond.isPending} onClick={() => respond.mutate({ assignmentId: item.assignmentId, response: "accepted" }, {
                        onSuccess: () => toast.success("Turno confirmado; a cobertura será recalculada."),
                        onError: error => toast.error(error.message),
                      })} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-teal-800 px-3 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
                        <Check className="h-4 w-4" /> Aceitar meu turno
                      </button>
                      <button disabled={respond.isPending} onClick={() => respond.mutate({ assignmentId: item.assignmentId, response: "declined" }, {
                        onSuccess: () => toast.success("Recusa registrada; a cobertura será recalculada."),
                        onError: error => toast.error(error.message),
                      })} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                        <XCircle className="h-4 w-4" /> Recusar
                      </button>
                    </div>
                  ) : null}
                  {!isAdmin && item.isMine && item.status === "scheduled" && item.confirmationStatus === "accepted" ? (
                    <button disabled={respond.isPending} onClick={() => {
                      if (!window.confirm("Cancelar seu turno pode deixar um intervalo sem cobertura. Deseja continuar?")) return;
                      respond.mutate({ assignmentId: item.assignmentId, response: "cancelled" }, {
                        onSuccess: () => toast.success("Cancelamento registrado; a cobertura deve ser resolvida novamente."),
                        onError: error => toast.error(error.message),
                      });
                    }} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                      <XCircle className="h-4 w-4" /> Cancelar meu turno
                    </button>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
