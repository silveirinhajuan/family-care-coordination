import { trpc } from "@/lib/trpc";
import { CalendarClock, Edit3, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, PageHeading, Panel, RecurrenceFields, RecurrenceValue, StatusPill, fieldClass, freshRecurrenceValue, recurrenceLabel } from "@/components/sfcc/common";

type AvailabilityItem = {
  id: number;
  participantId: number;
  status: "available" | "unavailable";
  recurrence: "once" | "weekly";
  startsLocal: string;
  endsLocal: string;
  repeatDays: string | null;
  repeatUntil: string | null;
};

export default function AvailabilityPage({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const peopleQuery = trpc.participants.adminList.useQuery(undefined, { enabled: isAdmin });
  const people = peopleQuery.data?.filter(person => person.active) ?? [];
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AvailabilityItem | null>(null);
  const [state, setState] = useState<"available" | "unavailable">("available");
  const [rule, setRule] = useState<RecurrenceValue>(freshRecurrenceValue());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (participantId === null && people.length) setParticipantId(people[0].id);
  }, [participantId, people]);

  const listQuery = trpc.availability.list.useQuery({ participantId: participantId ?? 0 }, { enabled: isAdmin && participantId !== null });
  const create = trpc.availability.create.useMutation({ onSuccess: () => utils.availability.list.invalidate() });
  const update = trpc.availability.update.useMutation({ onSuccess: () => utils.availability.list.invalidate() });
  const remove = trpc.availability.delete.useMutation({ onSuccess: () => utils.availability.list.invalidate() });
  const items = listQuery.data ?? [];
  const pending = create.isPending || update.isPending;

  const beginCreate = () => { setEditing(null); setState("available"); setRule(freshRecurrenceValue()); setError(null); setFormOpen(true); };
  const beginEdit = (item: AvailabilityItem) => {
    setEditing(item);
    setState(item.status);
    setRule({
      recurrence: item.recurrence,
      startsLocal: item.startsLocal,
      endsLocal: item.endsLocal,
      repeatDays: (item.repeatDays ?? "").split(",").filter(Boolean).map(Number),
      repeatUntil: item.repeatUntil ?? "",
    });
    setError(null);
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditing(null); setError(null); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (participantId === null) return;
    const value = { participantId, status: state, ...rule, repeatUntil: rule.repeatUntil || null };
    setError(null);
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...value });
      else await create.mutateAsync(value);
      toast.success(editing ? "Disponibilidade atualizada." : "Disponibilidade registrada.");
      closeForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    }
  };

  if (!isAdmin) {
    return <div role="status"><Panel className="p-5 text-sm text-amber-900">Disponibilidades são informações administrativas e podem ser consultadas ou alteradas somente pelo coordenador.</Panel></div>;
  }

  return (
    <div>
      <PageHeading
        eyebrow="Fase 1 · Disponibilidade"
        title="Quando cada pessoa pode acompanhar"
        description="Uma janela disponível não é um aceite. Ausência de informação continua diferente de indisponibilidade. Os horários são sempre de Fortaleza."
        action={isAdmin && people.length ? <button onClick={beginCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-teal-900"><Plus className="h-4 w-4" /> Registrar janela</button> : null}
      />
      {!isAdmin ? <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Disponibilidades são gerenciadas pelo coordenador nesta etapa.</div> : null}

      <Panel className="mb-5 p-4 sm:p-5">
        <Field label="Acompanhante">
          <select disabled={peopleQuery.isLoading || !people.length} className={fieldClass} value={participantId ?? ""} onChange={event => setParticipantId(Number(event.target.value))}>
            {!people.length ? <option value="">Cadastre primeiro um acompanhante</option> : null}
            {people.map(person => <option key={person.id} value={person.id}>{person.displayName} · {person.category}</option>)}
          </select>
        </Field>
      </Panel>

      {formOpen && isAdmin ? (
        <Panel className="mb-5 p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">{editing ? "Editar janela" : "Nova janela"}</h2><p className="mt-1 text-xs text-slate-500">Registre explicitamente se a pessoa está disponível ou indisponível nesse intervalo.</p></div><button onClick={closeForm} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Fechar</button></div>
          <form onSubmit={submit} className="space-y-5">
            <Field label="Estado da janela">
              <select className={fieldClass} value={state} onChange={event => setState(event.target.value as typeof state)}>
                <option value="available">Disponível</option><option value="unavailable">Indisponível</option>
              </select>
            </Field>
            <RecurrenceFields value={rule} onChange={setRule} />
            {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeForm} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button><button disabled={pending} className="min-h-11 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">{pending ? "Salvando…" : editing ? "Salvar alterações" : "Salvar janela"}</button></div>
          </form>
        </Panel>
      ) : null}

      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">pessoa acompanhadalas registradas</h2><span className="text-xs text-slate-500">Sem janela = não informado</span></div>
      {people.length === 0 ? <Panel className="p-8 text-center"><CalendarClock className="mx-auto mb-3 h-6 w-6 text-teal-800" /><p className="text-sm font-semibold text-slate-800">Cadastre um acompanhante primeiro</p><p className="mt-1 text-sm text-slate-500">Depois você poderá registrar janelas disponíveis e indisponíveis.</p></Panel> : listQuery.isLoading ? <Panel className="p-6 text-sm text-slate-500">Carregando janelas…</Panel> : listQuery.error ? <Panel className="p-6 text-sm text-rose-700">{listQuery.error.message}</Panel> : items.length === 0 ? <Panel className="p-7"><p className="text-sm font-semibold text-slate-800">Nenhuma janela informada para {people.find(person => person.id === participantId)?.displayName}.</p><p className="mt-1 text-sm text-slate-500">O sistema manterá o estado como “não informado”, não como indisponível.</p></Panel> : (
        <div className="space-y-3">{items.map(item => <Panel key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="min-w-0"><div className="mb-2 flex items-center gap-2"><StatusPill tone={item.status === "available" ? "good" : "neutral"}>{item.status === "available" ? "Disponível" : "Indisponível"}</StatusPill>{item.recurrence === "weekly" ? <StatusPill tone="brand">Recorrente</StatusPill> : null}</div><p className="text-sm font-semibold text-slate-800">{recurrenceLabel(item)}</p></div>{isAdmin ? <div className="flex shrink-0 gap-2"><button onClick={() => beginEdit(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Editar</button><button onClick={() => remove.mutate({ id: item.id }, { onSuccess: () => toast.success("pessoa acompanhadala removida."), onError: cause => toast.error(cause.message) })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Remover</button></div> : null}</Panel>)}</div>
      )}
    </div>
  );
}
