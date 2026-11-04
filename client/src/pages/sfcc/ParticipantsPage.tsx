import { trpc } from "@/lib/trpc";
import { Check, Edit3, Plus, ShieldCheck, UserRound, UserRoundX, Unlink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field, PageHeading, Panel, StatusPill, fieldClass } from "@/components/sfcc/common";

type Category = "familiar" | "cuidadora" | "outros";
type Participant = {
  id: number;
  displayName: string;
  relationshipToCareRecipient: string | null;
  linkedUserId: number | null;
  category: Category;
  contact: string | null;
  active: boolean;
  emergencyEligible: boolean;
};
type ParticipantSummary = Pick<Participant, "id" | "displayName" | "category" | "active">;
type ParticipantRow = Participant | ParticipantSummary;

function hasAdminDetails(person: ParticipantRow): person is Participant {
  return "contact" in person && "emergencyEligible" in person &&
    "relationshipToCareRecipient" in person && "linkedUserId" in person;
}

type ParticipantFormValue = Omit<Participant, "id" | "active" | "relationshipToCareRecipient" | "linkedUserId">;

const emptyForm: ParticipantFormValue = {
  displayName: "",
  category: "familiar",
  contact: "",
  emergencyEligible: false,
};

const categoryLabel: Record<Category, string> = { familiar: "Familiar", cuidadora: "Cuidadora", outros: "Outros" };

function ParticipantForm({
  initial,
  editing,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  initial: ParticipantFormValue;
  editing: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (value: ParticipantFormValue) => void;
}) {
  const [value, setValue] = useState<ParticipantFormValue>(initial);
  const update = (changes: Partial<ParticipantFormValue>) => setValue(current => ({ ...current, ...changes }));
  return (
    <Panel className="mb-6 p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><h2 className="text-base font-semibold text-slate-900">{editing ? "Editar acompanhante" : "Novo acompanhante"}</h2><p className="mt-1 text-xs text-slate-500">Não inclua dados clínicos. O contato é opcional.</p></div>
        <button type="button" onClick={onCancel} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">Fechar</button>
      </div>
      <form className="space-y-5" onSubmit={event => { event.preventDefault(); onSubmit({ ...value, contact: value.contact || null }); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome de exibição">
            <input autoFocus required maxLength={120} className={fieldClass} value={value.displayName} onChange={event => update({ displayName: event.target.value })} placeholder="Ex.: Ana Souza" />
          </Field>
          <Field label="Categoria">
            <select className={fieldClass} value={value.category} onChange={event => {
              const category = event.target.value as Category;
              update({ category, emergencyEligible: category === "familiar" ? value.emergencyEligible : false });
            }}>
              <option value="familiar">Familiar</option><option value="cuidadora">Cuidadora</option><option value="outros">Outros</option>
            </select>
          </Field>
          <Field label="Contato (opcional)" hint="Use somente informação necessária para coordenação.">
            <input maxLength={255} className={fieldClass} value={value.contact ?? ""} onChange={event => update({ contact: event.target.value })} placeholder="Telefone ou e-mail" />
          </Field>
          <div className="flex items-end pb-1">
            <label className={`flex min-h-11 items-center gap-3 rounded-xl border px-3.5 text-sm ${value.category === "familiar" ? "border-slate-200 bg-white text-slate-700" : "border-slate-100 bg-slate-50 text-slate-400"}`}>
              <input type="checkbox" disabled={value.category !== "familiar"} checked={value.emergencyEligible} className="h-4 w-4 accent-teal-800" onChange={event => update({ emergencyEligible: event.target.checked })} />
              Designado para emergência
            </label>
          </div>
        </div>

        {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-800">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
          <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 disabled:opacity-60">
            <Check className="h-4 w-4" />{pending ? "Salvando…" : editing ? "Salvar alterações" : "Salvar acompanhante"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

export default function ParticipantsPage({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const refreshParticipants = () => {
    void utils.participants.activeCount.invalidate();
    void utils.participants.adminList.invalidate();
  };
  const adminQuery = trpc.participants.adminList.useQuery(undefined, { enabled: isAdmin });
  const query = adminQuery;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Participant | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const create = trpc.participants.create.useMutation({ onSuccess: refreshParticipants });
  const update = trpc.participants.update.useMutation({ onSuccess: refreshParticipants });
  const deactivate = trpc.participants.deactivate.useMutation({ onSuccess: refreshParticipants });
  const reactivate = trpc.participants.reactivate.useMutation({ onSuccess: refreshParticipants });
  const unlinkAccount = trpc.participants.unlinkAccount.useMutation({
    onSuccess: result => {
      refreshParticipants();
      toast.success(result.unlinked ? "Conta desvinculada; revise as janelas antes de um novo vínculo." : "Esse cadastro já estava sem conta vinculada.");
    },
    onError: error => toast.error(error.message),
  });
  const participants: ParticipantRow[] = adminQuery.data ?? [];
  const emergencyCount = (adminQuery.data ?? []).filter(person => person.emergencyEligible).length;
  const pending = create.isPending || update.isPending;

  const beginEdit = (person: Participant) => {
    setEditing(person);
    setFormError(null);
    setFormOpen(true);
  };
  const closeForm = () => { setFormOpen(false); setEditing(null); setFormError(null); };
  const submit = async (value: ParticipantFormValue) => {
    setFormError(null);
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...value });
      else await create.mutateAsync(value);
      toast.success(editing ? "Acompanhante atualizado." : "Acompanhante cadastrado.");
      closeForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível salvar.";
      setFormError(message);
    }
  };

  if (!isAdmin) return (
    <div>
      <PageHeading eyebrow="Área da família" title="Acompanhantes" description="O diretório completo é restrito à coordenação." />
      <Panel className="p-5 text-sm leading-6 text-slate-700">Para consultar ou registrar suas próprias janelas, acesse <a className="font-semibold text-teal-800 underline" href="/my-availability">Minha disponibilidade</a>. A coordenação administra os demais cadastros.</Panel>
    </div>
  );

  return (
    <div>
      <PageHeading
        eyebrow="Fase 1 · Cadastro"
        title="Acompanhantes"
        description="Cadastre familiares, cuidadoras e outros participantes. A coordenação registra a escala, as respostas e as contratações, mesmo quando alguém não usa o aplicativo."
        action={isAdmin ? <button onClick={() => { setEditing(null); setFormError(null); setFormOpen(open => !open); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-900"><Plus className="h-4 w-4" /> Novo acompanhante</button> : null}
      />

      {formOpen && isAdmin ? <ParticipantForm initial={editing ? {
        displayName: editing.displayName,
        category: editing.category,
        contact: editing.contact,
        emergencyEligible: editing.emergencyEligible,
      } : emptyForm} editing={Boolean(editing)} pending={pending} error={formError} onCancel={closeForm} onSubmit={submit} /> : null}

      {isAdmin ? <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-semibold text-slate-800">{query.isLoading ? "Carregando…" : `${participants.length} cadastrado${participants.length === 1 ? "" : "s"}`}</p><p className="mt-1 text-xs text-slate-500">Grupo emergencial designado: {emergencyCount} de 3 familiares.</p></div>
        <StatusPill tone={emergencyCount === 3 ? "good" : "warn"}>{emergencyCount === 3 ? "Grupo completo" : "Designação em aberto"}</StatusPill>
      </div> : null}

      {query.isLoading ? <Panel className="p-8 text-center text-sm text-slate-500">Carregando acompanhantes…</Panel> : query.error ? <Panel className="p-6 text-sm text-rose-700">{query.error.message}</Panel> : participants.length === 0 ? (
        <Panel className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 rounded-2xl bg-teal-50 p-3 text-teal-800"><UserRound className="h-6 w-6" /></div>
          <h2 className="text-base font-semibold text-slate-900">Nenhum acompanhante cadastrado</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Comece pelo cadastro de familiares, cuidadoras e outros acompanhantes. Você pode registrar disponibilidades depois.</p>
          {isAdmin ? <button onClick={() => setFormOpen(true)} className="mt-5 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-900">Cadastrar primeiro acompanhante</button> : null}
        </Panel>
      ) : (
        <div className="space-y-3">
          {participants.map(person => {
            const details = hasAdminDetails(person) ? person : null;
            return (
            <Panel key={person.id} className={`p-4 sm:p-5 ${person.active ? "" : "opacity-70"}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-sm font-bold text-teal-900">{person.displayName.trim().slice(0, 1).toUpperCase()}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-semibold text-slate-900">{person.displayName}</h2><StatusPill tone="neutral">{categoryLabel[person.category]}</StatusPill>{person.active ? null : <StatusPill tone="neutral">Inativo</StatusPill>}</div>
                    {isAdmin && details?.contact ? <p className="mt-1.5 text-xs text-slate-500">{details.contact}</p> : null}
                    {isAdmin && details?.relationshipToCareRecipient ? <p className="mt-1.5 text-xs text-slate-600">Relação com pessoa acompanhada: {details.relationshipToCareRecipient}</p> : null}
                    {isAdmin && details?.emergencyEligible ? <div className="mt-3 flex flex-wrap gap-2"><StatusPill tone="brand">Grupo de emergência</StatusPill></div> : null}
                    {isAdmin && details ? <p className="mt-2 text-xs text-slate-500">{details.linkedUserId ? "Conta SFCC vinculada" : "Sem conta vinculada"}</p> : null}
                  </div>
                </div>
                {isAdmin ? <div className="flex shrink-0 flex-wrap gap-2">
                  <button onClick={() => { if (details) beginEdit(details); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Editar</button>
                  {details?.linkedUserId ? <button onClick={() => { if (window.confirm("Desvincular a conta deste cadastro? A relação será removida, mas as janelas ficarão preservadas para revisão.")) unlinkAccount.mutate({ id: person.id }); }} disabled={unlinkAccount.isPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-900 hover:bg-amber-50 disabled:opacity-60"><Unlink className="h-3.5 w-3.5" /> Desvincular conta</button> : null}
                  {person.active ? <button onClick={() => deactivate.mutate({ id: person.id }, { onSuccess: () => toast.success("Acompanhante desativado."), onError: error => toast.error(error.message) })} disabled={deactivate.isPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"><UserRoundX className="h-3.5 w-3.5" /> Desativar</button> : <button onClick={() => reactivate.mutate({ id: person.id }, { onSuccess: () => toast.success("Acompanhante reativado."), onError: error => toast.error(error.message) })} disabled={reactivate.isPending} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 px-3 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"><ShieldCheck className="h-3.5 w-3.5" /> Reativar</button>}
                </div> : null}
              </div>
            </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
