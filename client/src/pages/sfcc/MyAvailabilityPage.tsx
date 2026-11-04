import { trpc } from "@/lib/trpc";
import { CalendarClock, Check, Edit3, Plus, ShieldCheck, Trash2, UserRoundPlus, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Field,
  PageHeading,
  Panel,
  RecurrenceFields,
  type RecurrenceValue,
  StatusPill,
  fieldClass,
  freshRecurrenceValue,
  recurrenceLabel,
} from "@/components/sfcc/common";

type AvailabilityItem = {
  id: number;
  status: "available" | "unavailable";
  recurrence: "once" | "weekly";
  startsLocal: string;
  endsLocal: string;
  repeatDays: string | null;
  repeatUntil: string | null;
};

type RegistrationMode = "choose" | "existing" | "new";

export default function MyAvailabilityPage() {
  const utils = trpc.useUtils();
  const profileQuery = trpc.myProfile.get.useQuery();
  const profile = profileQuery.data ?? null;
  const candidatesQuery = trpc.myProfile.candidates.useQuery(undefined, {
    enabled: profileQuery.isSuccess && profileQuery.data === null,
  });
  const windowsQuery = trpc.availability.mine.useQuery(undefined, { enabled: Boolean(profile?.id) });

  const [mode, setMode] = useState<RegistrationMode>("choose");
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [relationshipToCareRecipient, setRelationshipToCareRecipient] = useState("");
  const [confirmedWithCoordinator, setConfirmedWithCoordinator] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AvailabilityItem | null>(null);
  const [status, setStatus] = useState<"available" | "unavailable">("available");
  const [rule, setRule] = useState<RecurrenceValue>(freshRecurrenceValue());
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);

  const refreshProfile = () => {
    void utils.myProfile.get.invalidate();
    void utils.myProfile.candidates.invalidate();
    void utils.participants.activeCount.invalidate();
    void utils.participants.adminList.invalidate();
  };
  const claim = trpc.myProfile.claim.useMutation({
    onSuccess: () => {
      refreshProfile();
      toast.success("Cadastro associado à sua conta.");
      setMode("choose");
    },
  });
  const register = trpc.myProfile.register.useMutation({
    onSuccess: () => {
      refreshProfile();
      toast.success("Seu cadastro familiar foi criado.");
      setMode("choose");
    },
  });
  const create = trpc.availability.createMine.useMutation({
    onSuccess: () => { void utils.availability.mine.invalidate(); },
  });
  const update = trpc.availability.updateMine.useMutation({
    onSuccess: () => { void utils.availability.mine.invalidate(); },
  });
  const remove = trpc.availability.deleteMine.useMutation({
    onSuccess: () => { void utils.availability.mine.invalidate(); },
  });

  const beginCreate = () => {
    setEditing(null);
    setStatus("available");
    setRule(freshRecurrenceValue());
    setAvailabilityError(null);
    setFormOpen(true);
  };
  const beginEdit = (item: AvailabilityItem) => {
    setEditing(item);
    setStatus(item.status);
    setRule({
      recurrence: item.recurrence,
      startsLocal: item.startsLocal,
      endsLocal: item.endsLocal,
      repeatDays: (item.repeatDays ?? "").split(",").filter(Boolean).map(Number),
      repeatUntil: item.repeatUntil ?? "",
    });
    setAvailabilityError(null);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setAvailabilityError(null);
  };

  const submitRegistration = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegistrationError(null);
    try {
      if (mode === "existing") {
        if (!confirmedWithCoordinator) {
          setRegistrationError("Confirme que verificou esse cadastro com a coordenação da família.");
          return;
        }
        const participantId = Number(selectedParticipantId);
        if (!participantId) {
          setRegistrationError("Selecione seu nome na lista.");
          return;
        }
        await claim.mutateAsync({ participantId, relationshipToCareRecipient, confirmedWithCoordinator: true });
      } else {
        await register.mutateAsync({ displayName, relationshipToCareRecipient });
      }
    } catch (cause) {
      setRegistrationError(cause instanceof Error ? cause.message : "Não foi possível concluir o cadastro.");
    }
  };

  const submitAvailability = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = { status, ...rule, repeatUntil: rule.repeatUntil || null };
    setAvailabilityError(null);
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...value });
      else await create.mutateAsync(value);
      toast.success(editing ? "Sua disponibilidade foi atualizada." : "Sua disponibilidade foi registrada.");
      closeForm();
    } catch (cause) {
      setAvailabilityError(cause instanceof Error ? cause.message : "Não foi possível salvar a disponibilidade.");
    }
  };

  if (profileQuery.isLoading) {
    return <Panel className="p-6 text-sm text-slate-600">Carregando seu perfil…</Panel>;
  }
  if (profileQuery.error) {
    return <Panel className="p-6 text-sm text-rose-700">{profileQuery.error.message}</Panel>;
  }

  if (!profile) {
    const registrationPending = claim.isPending || register.isPending;
    const goBack = () => { setMode("choose"); setRegistrationError(null); setConfirmedWithCoordinator(false); setSelectedParticipantId(""); };
    return (
      <div>
        <PageHeading
          eyebrow="Área da família"
          title="Minha disponibilidade"
          description="Antes de informar horários, associe sua conta a um cadastro familiar ou crie seu perfil."
        />
        <Panel className="mb-5 flex items-start gap-3 border-amber-200 bg-amber-50/70 p-4 text-sm leading-6 text-amber-950">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>Se escolher um cadastro existente, confirme com a coordenação da família que aquele nome corresponde a você antes de vinculá-lo. O sistema não verifica identidade. A disponibilidade informa uma janela possível; ela não aceita nem confirma um turno, mas poderá ser considerada na organização da escala.</p>
        </Panel>

        {mode === "choose" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <button onClick={() => { setMode("existing"); setConfirmedWithCoordinator(false); setSelectedParticipantId(""); }} className="min-h-36 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-teal-700 hover:bg-teal-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-800">
              <UsersRound className="mb-3 h-6 w-6 text-teal-800" />
              <span className="block text-base font-semibold text-slate-900">Já estou cadastrada</span>
              <span className="mt-1 block text-sm leading-5 text-slate-600">Vincular minha conta a um familiar já listado.</span>
            </button>
            <button onClick={() => { setMode("new"); setConfirmedWithCoordinator(false); }} className="min-h-36 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-teal-700 hover:bg-teal-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-800">
              <UserRoundPlus className="mb-3 h-6 w-6 text-teal-800" />
              <span className="block text-base font-semibold text-slate-900">Sou uma pessoa nova</span>
              <span className="mt-1 block text-sm leading-5 text-slate-600">Criar meu cadastro familiar agora, sem aprovação prévia.</span>
            </button>
          </div>
        ) : (
          <Panel className="p-5 sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{mode === "existing" ? "Encontre seu cadastro" : "Criar cadastro familiar"}</h2>
                <p className="mt-1 text-sm leading-5 text-slate-600">A relação com pessoa acompanhada é informada por você. Não inclua detalhes clínicos.</p>
              </div>
              <button type="button" onClick={goBack} className="min-h-9 rounded-lg px-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Voltar</button>
            </div>
            {mode === "existing" && candidatesQuery.isLoading ? <p className="text-sm text-slate-500">Carregando cadastros disponíveis…</p> : null}
            {mode === "existing" && candidatesQuery.error ? <p role="alert" className="mb-4 text-sm text-rose-700">{candidatesQuery.error.message}</p> : null}
            {mode === "existing" && candidatesQuery.data?.length === 0 ? (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Não há cadastros familiares sem vínculo agora. Se você não estiver cadastrada, volte e escolha “Sou uma pessoa nova”.</div>
            ) : null}
            <form onSubmit={submitRegistration} className="space-y-5">
              {mode === "existing" ? (
                <>
                  <Field label="Seu cadastro familiar">
                    <select required className={fieldClass} value={selectedParticipantId} onChange={event => { setSelectedParticipantId(event.target.value); setConfirmedWithCoordinator(false); }} disabled={!candidatesQuery.data?.length}>
                      <option value="">Selecione seu nome</option>
                      {candidatesQuery.data?.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}
                    </select>
                  </Field>
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-5 text-slate-700">
                    <input type="checkbox" required className="mt-1 h-4 w-4 accent-teal-800" checked={confirmedWithCoordinator} onChange={event => setConfirmedWithCoordinator(event.target.checked)} />
                    <span>Confirmei com a coordenação da família que este cadastro corresponde a mim. Sei que o sistema não verifica minha identidade por outro meio.</span>
                  </label>
                </>
              ) : (
                <Field label="Seu nome de exibição">
                  <input required maxLength={120} autoComplete="name" className={fieldClass} value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Como a família reconhece você" />
                </Field>
              )}
              <Field label="Sua relação com pessoa acompanhada" hint="Ex.: filha, filho, irmã, sobrinha. Use uma descrição breve.">
                <input required maxLength={120} className={fieldClass} value={relationshipToCareRecipient} onChange={event => setRelationshipToCareRecipient(event.target.value)} placeholder="Ex.: filha" />
              </Field>
              {mode === "new" ? <p className="rounded-xl border border-teal-100 bg-teal-50/70 p-3 text-xs leading-5 text-teal-950">Seu perfil será criado imediatamente como familiar. A elegibilidade para o grupo de emergência permanece desativada até a coordenação designá-la.</p> : null}
              {registrationError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{registrationError}</p> : null}
              <button type="submit" disabled={registrationPending || (mode === "existing" && (!candidatesQuery.data?.length || candidatesQuery.isLoading))} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60 sm:w-auto">
                <Check className="h-4 w-4" />{registrationPending ? "Salvando…" : mode === "existing" ? "Vincular meu cadastro" : "Criar meu cadastro"}
              </button>
            </form>
          </Panel>
        )}
      </div>
    );
  }

  if (!profile.active) {
    return (
      <div>
        <PageHeading eyebrow="Área da família" title="Minha disponibilidade" description="Seu perfil está vinculado a esta conta." />
        <Panel className="border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">O cadastro de {profile.displayName} está inativo. Fale com a coordenação para resolver antes de informar horários.</Panel>
      </div>
    );
  }

  const items = (windowsQuery.data ?? []) as AvailabilityItem[];
  const savingAvailability = create.isPending || update.isPending;

  return (
    <div>
      <PageHeading
        eyebrow="Área da família"
        title="Minha disponibilidade"
        description="Informe quando você pode ou não pode acompanhar. Os horários são de Fortaleza; disponibilidade não é aceite de turno."
        action={<button onClick={beginCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm hover:bg-teal-900"><Plus className="h-4 w-4" /> Informar horário</button>}
      />

      <Panel className="mb-5 p-4 sm:p-5">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Meu perfil familiar</p>
        <div className="mt-2 flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold text-slate-900">{profile.displayName}</h2><StatusPill tone="brand">Familiar</StatusPill></div>
        <p className="mt-1 text-sm text-slate-600">Relação com pessoa acompanhada: {profile.relationshipToCareRecipient || "não informada"}</p>
      </Panel>

      <Panel className="mb-5 flex items-start gap-3 border-teal-100 bg-teal-50/60 p-4 text-sm leading-6 text-teal-950">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0" />
        <p>“Disponível” indica uma janela que pode ser considerada na escala, não uma obrigação nem um turno aceito. A autorização do hospital é verificada separadamente pela coordenação.</p>
      </Panel>

      {formOpen ? (
        <Panel className="mb-5 p-5 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">{editing ? "Editar minha janela" : "Nova janela"}</h2><p className="mt-1 text-xs text-slate-500">Informe apenas horários que você deseja declarar para a escala.</p></div><button type="button" onClick={closeForm} className="min-h-9 rounded-lg px-2 text-sm font-semibold text-slate-500 hover:bg-slate-100">Fechar</button></div>
          <form onSubmit={submitAvailability} className="space-y-5">
            <Field label="Estado da janela">
              <select className={fieldClass} value={status} onChange={event => setStatus(event.target.value as typeof status)}>
                <option value="available">Disponível</option><option value="unavailable">Indisponível</option>
              </select>
            </Field>
            <RecurrenceFields value={rule} onChange={setRule} />
            {availabilityError ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{availabilityError}</p> : null}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={closeForm} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
              <button disabled={savingAvailability} className="min-h-11 rounded-xl bg-[var(--brand)] px-5 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">{savingAvailability ? "Salvando…" : editing ? "Salvar alterações" : "Salvar minha disponibilidade"}</button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-800">Minhas janelas informadas</h2><span className="text-xs text-slate-500">Sem janela = não informado</span></div>
      {windowsQuery.isLoading ? <Panel className="p-6 text-sm text-slate-500">Carregando seus horários…</Panel> : windowsQuery.error ? <Panel className="p-6 text-sm text-rose-700">{windowsQuery.error.message}</Panel> : items.length === 0 ? (
        <Panel className="p-8 text-center"><CalendarClock className="mx-auto mb-3 h-6 w-6 text-teal-800" /><p className="text-sm font-semibold text-slate-800">Nenhum horário informado ainda</p><p className="mt-1 text-sm text-slate-500">Você pode começar registrando uma janela pontual ou semanal.</p></Panel>
      ) : (
        <div className="space-y-3">{items.map(item => <Panel key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div className="min-w-0"><div className="mb-2 flex items-center gap-2"><StatusPill tone={item.status === "available" ? "good" : "neutral"}>{item.status === "available" ? "Disponível" : "Indisponível"}</StatusPill>{item.recurrence === "weekly" ? <StatusPill tone="brand">Recorrente</StatusPill> : null}</div><p className="text-sm font-semibold text-slate-800">{recurrenceLabel(item)}</p></div><div className="flex shrink-0 gap-2"><button onClick={() => beginEdit(item)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Editar</button><button onClick={() => remove.mutate({ id: item.id }, { onSuccess: () => toast.success("pessoa acompanhadala removida."), onError: error => toast.error(error.message) })} disabled={remove.isPending} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" /> Remover</button></div></Panel>)}</div>
      )}
    </div>
  );
}
