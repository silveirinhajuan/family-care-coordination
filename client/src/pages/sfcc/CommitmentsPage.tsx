import { trpc } from "@/lib/trpc";
import { CalendarX2, Edit3, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field, PageHeading, Panel, RecurrenceFields, RecurrenceValue, fieldClass, freshRecurrenceValue, recurrenceLabel } from "@/components/sfcc/common";

type CommitmentItem = {
  id: number;
  participantId: number;
  description: string;
  recurrence: "once" | "weekly";
  startsLocal: string;
  endsLocal: string;
  repeatDays: string | null;
  repeatUntil: string | null;
};

export default function CommitmentsPage({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const peopleQuery = trpc.participants.adminList.useQuery(undefined, { enabled: isAdmin });
  const people = peopleQuery.data?.filter(person => person.active) ?? [];
  const [participantId, setParticipantId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CommitmentItem | null>(null);
  const [description, setDescription] = useState("");
  const [rule, setRule] = useState<RecurrenceValue>(freshRecurrenceValue());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (participantId === null && people.length) setParticipantId(people[0].id);
  }, [participantId, people]);

  const listQuery = trpc.commitments.list.useQuery({ participantId: participantId ?? 0 }, { enabled: isAdmin && participantId !== null });
  const create = trpc.commitments.create.useMutation({ onSuccess: () => utils.commitments.list.invalidate() });
  const update = trpc.commitments.update.useMutation({ onSuccess: () => utils.commitments.list.invalidate() });
  const remove = trpc.commitments.delete.useMutation({ onSuccess: () => utils.commitments.list.invalidate() });
  const items = listQuery.data ?? [];
  const pending = create.isPending || update.isPending;

  const beginCreate = () => { setEditing(null); setDescription(""); setRule(freshRecurrenceValue()); setError(null); setFormOpen(true); };
  const beginEdit = (item: CommitmentItem) => {
    setEditing(item);
    setDescription(item.description);
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
    const value = { participantId, description, ...rule, repeatUntil: rule.repeatUntil || null };
    setError(null);
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...value });
      else await create.mutateAsync(value);
      toast.success(editing ? "Compromisso atualizado." : "Compromisso registrado.");
      closeForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    }
  };

  if (!isAdmin) {
    return <div role="status"><Panel className="p-5 text-sm text-amber-900">Compromissos são informações administrativas e podem ser consultados ou alterados somente pelo coordenador.</Panel></div>;
  }

  return (
    <div>
      <PageHeading
        eyebrow="Fase 1 · Compromissos"
        title="O que impede um turno"
        description="Registre períodos em que a pessoa não pode acompanhar. Compromissos e indisponibilidades sempre prevalecem sobre disponibilidade declarada."
        action={isAdmin && people.length ? <button onClick={beginCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-teal-900"><Plus className="h-4 w-4" /> Novo compromisso</button> : null}
      />
      {!isAdmin ? <div role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Compromissos são gerenciados pelo coordenador nesta etapa.</div> : null}
      <Panel className="mb-5 p-4 sm:p-5"><Field label="Acompanhante"><select disabled={!people.length} className={fieldClass} value={participantId ?? ""} onChange={event => setParticipantId(Number(event.target.value))}>{!people.length ? <option value="">Cadastre primeiro um acompanhante</option> : null}{people.map(person => <option key={person.id} value={person.id}>{person.displayName} · {person.category}</option>)}</select></Field></Panel>

      {formOpen && isAdmin ? <Panel className="mb-5 p-5 sm:p-6"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">{editing ? "Editar compromisso" : "Novo compromisso"}</h2><p className="mt-1 text-xs text-slate-500">Registre apenas detalhes administrativos necessários; não inclua informações clínicas.</p></div><button onClick={closeForm} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Fechar</button></div><form onSubmit={submit} className="space-y-5"><Field label="Descrição administrativa"><input required maxLength={160} className={fieldClass} value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: trabalho, compromisso familiar" /></Field><RecurrenceFields value={rule} onChange={setRule} />{error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p> : null}<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeForm} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button><button disabled={pending} className="min-h-11 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">{pending ? "Salvando…" : editing ? "Salvar alterações" : "Salvar compromisso"}</button></div></form></Panel> : null}

      <h2 className="mb-3 text-sm font-semibold text-slate-800">Compromissos registrados</h2>
      {!people.length ? <Panel className="p-8 text-center"><CalendarX2 className="mx-auto mb-3 h-6 w-6 text-slate-500" /><p className="text-sm font-semibold text-slate-800">Cadastre um acompanhante primeiro</p><p className="mt-1 text-sm text-slate-500">Depois você poderá registrar compromissos pontuais ou semanais.</p></Panel> : listQuery.isLoading ? <Panel className="p-6 text-sm text-slate-500">Carregando compromissos…</Panel> : listQuery.error ? <Panel className="p-6 text-sm text-rose-700">{listQuery.error.message}</Panel> : items.length === 0 ? <Panel className="p-7"><p className="text-sm font-semibold text-slate-800">Nenhum compromisso informado para {people.find(person => person.id === participantId)?.displayName}.</p><p className="mt-1 text-sm text-slate-500">Sem registro, o sistema não presume indisponibilidade.</p></Panel> : <div className="space-y-3">{items.map(item => <Panel key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{item.description}</p><p className="mt-1 text-xs text-slate-500">{recurrenceLabel(item)}</p></div>{isAdmin ? <div className="flex shrink-0 gap-2"><button onClick={() => beginEdit(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Editar</button><button onClick={() => remove.mutate({ id: item.id }, { onSuccess: () => toast.success("Compromisso removido."), onError: cause => toast.error(cause.message) })} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /> Remover</button></div> : null}</Panel>)}</div>}
    </div>
  );
}
