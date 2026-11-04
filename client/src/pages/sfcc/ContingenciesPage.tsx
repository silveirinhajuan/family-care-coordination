import { useState } from "react";
import { AlertTriangle, Check, PhoneCall, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Field, PageHeading, Panel, StatusPill, fieldClass, formatLocalLabel } from "@/components/sfcc/common";

type ActivationStatus = "solicitada" | "aceita" | "recusada" | "cancelada";
type ResponseSource = "whatsapp" | "telefone" | "presencial" | "outro";

function statusLabel(status: ActivationStatus): string {
  return ({ solicitada: "Aguardando aceite", aceita: "Aceito · cobertura", recusada: "Recusado", cancelada: "Cancelado" })[status];
}

function statusTone(status: ActivationStatus): "good" | "warn" | "bad" | "neutral" {
  return status === "aceita" ? "good" : status === "solicitada" ? "warn" : status === "recusada" ? "bad" : "neutral";
}

export default function ContingenciesPage({ isAdmin }: { isAdmin: boolean }) {
  const utils = trpc.useUtils();
  const roster = trpc.emergencies.roster.useQuery(undefined, { enabled: isAdmin });
  const activations = trpc.emergencies.list.useQuery(undefined, { enabled: isAdmin });
  const myRequests = trpc.emergencies.myRequests.useQuery();
  const attempts = trpc.caregivers.bookings.list.useQuery(undefined, { enabled: isAdmin });
  const [bookingId, setBookingId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [restExceptionRequested, setRestExceptionRequested] = useState(false);
  const [justification, setJustification] = useState("");
  const [acceptRestException, setAcceptRestException] = useState<Record<number, boolean>>({});
  const [responseSources, setResponseSources] = useState<Record<number, ResponseSource | "">>({});
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = async () => {
    await Promise.all([
      utils.emergencies.list.invalidate(),
      utils.emergencies.myRequests.invalidate(),
      utils.coverage.analyze.invalidate(),
    ]);
  };
  const create = trpc.emergencies.create.useMutation({
    onSuccess: async () => {
      await refresh();
      setBookingId("");
      setParticipantId("");
      setRestExceptionRequested(false);
      setJustification("");
      setFormError(null);
      toast.success("Acionamento registrado. Ele ainda não conta como cobertura até o aceite explícito.");
    },
    onError: error => setFormError(error.message),
  });
  const respond = trpc.emergencies.respond.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(result.status === "aceita" ? "Aceite registrado; a cobertura foi reavaliada." : result.status === "recusada" ? "Recusa registrada; o período continua sem cobertura confirmada." : "Cancelamento registrado; a cobertura foi reavaliada.");
    },
    onError: error => toast.error(error.message),
  });
  const coordinatorRespond = trpc.emergencies.coordinatorRespond.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(result.status === "aceita" ? "Aceite informado registrado pela coordenação." : "Recusa informada registrada pela coordenação.");
    },
    onError: error => toast.error(error.message),
  });
  const cancel = trpc.emergencies.cancel.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Acionamento pendente cancelado."); },
    onError: error => toast.error(error.message),
  });

  const people = roster.data ?? [];
  const failedAttempts = (attempts.data ?? []).filter(item => item.status === "indisponível" || item.status === "recusada");
  const selectedAttempt = failedAttempts.find(item => item.id === Number(bookingId));
  const requests = myRequests.data ?? [];

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!bookingId || !participantId) {
      setFormError("Selecione uma tentativa de cuidadora e um dos três familiares designados.");
      return;
    }
    create.mutate({
      caregiverBookingId: Number(bookingId),
      participantId: Number(participantId),
      restExceptionRequested,
      restExceptionJustification: restExceptionRequested ? justification : null,
    });
  }

  return (
    <div>
      <PageHeading
        eyebrow="Fase 4 · Contingências noturnas"
        title="Acionamentos com aceite explícito"
        description="A sequência é manual: registrar a impossibilidade de contratar cuidadora e então acionar um dos três familiares designados. A coordenação pode registrar uma resposta recebida fora do app. Nenhum rodízio é presumido; solicitação pendente ou recusada não é cobertura."
      />

      <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><p><strong>O SFCC não verifica permissões hospitalares.</strong> A família e a coordenação resolvem isso fora do sistema. Aqui, o acionamento só é permitido para intervalo noturno após tentativa de cuidadora sem sucesso. Uma exceção às 24 horas de descanso exige justificativa e consentimento explícito do familiar, informado diretamente ou registrado pela coordenação; sobreposição nunca é permitida.</p></div>
      </div>
      <div role="status" className="mb-5 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">O SFCC registra o acionamento, mas ainda não envia SMS, e-mail ou notificação externa. Até configurar um canal, a coordenação precisa contatar a pessoa pelo meio combinado e acompanhar a resposta no sistema.</div>

      {isAdmin ? <>
        <Panel className="mb-6 p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-rose-50 p-2 text-rose-800"><PhoneCall className="h-5 w-5" /></div><div><h2 className="text-base font-semibold text-slate-900">Solicitar acionamento</h2><p className="mt-1 text-sm leading-5 text-slate-600">É necessário haver uma tentativa marcada como indisponível/recusada, sem outra tentativa ativa nem cobertura confirmada/realizada que se sobreponha ao intervalo. O fluxo mantém no máximo um acionamento pendente ou aceito por vez; aguarde a resposta antes de tentar outro familiar.</p></div></div>
          {roster.isLoading ? <p className="mb-4 text-sm text-slate-500">Verificando o grupo designado…</p> : <div className={`mb-4 rounded-xl border p-3 text-sm ${people.length === 3 ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}><strong>Grupo de emergência: {people.length}/3 familiares ativos.</strong>{people.length === 3 ? <ul className="mt-2 space-y-1 text-xs">{people.map(person => <li key={person.id}>{person.displayName} · {person.linked ? "pode responder no app ou pela coordenação" : "resposta registrada pela coordenação"}</li>)}</ul> : <p className="mt-1 text-xs leading-5">A coordenação deve designar exatamente três familiares na página Acompanhantes. A elegibilidade não é inferida automaticamente.</p>}</div>}

          {failedAttempts.length === 0 && !attempts.isLoading ? <p className="mb-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Ainda não há tentativa registrada como indisponível ou recusada. Registre primeiro a tentativa na página Cuidadoras e financeiro.</p> : null}
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Tentativa de cuidadora que não pôde ser contratada">
              <select required disabled={!failedAttempts.length} className={fieldClass} value={bookingId} onChange={event => setBookingId(event.target.value)}>
                <option value="">Selecione uma tentativa</option>
                {failedAttempts.map(item => <option key={item.id} value={item.id}>Turno {item.id} · {item.caregiverName} · {formatLocalLabel(item.coverageStartsLocal)}–{item.coverageEndsLocal.slice(11)} · {item.status}</option>)}
              </select>
            </Field>
            <Field label="Familiar designado a acionar">
              <select required disabled={people.length !== 3} className={fieldClass} value={participantId} onChange={event => setParticipantId(event.target.value)}>
                <option value="">Selecione um familiar</option>
                {people.map(person => <option key={person.id} value={person.id}>{person.displayName} · {person.linked ? "app ou coordenação" : "resposta pela coordenação"}</option>)}
              </select>
            </Field>
            {selectedAttempt ? <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-700">Intervalo solicitado: {formatLocalLabel(selectedAttempt.coverageStartsLocal)}–{formatLocalLabel(selectedAttempt.coverageEndsLocal)}. O sistema valida que é integralmente noturno, que a tentativa falhou e que não há tentativa ativa nem cobertura confirmada/realizada sobreposta.</div> : null}
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
              <label className="flex min-h-10 cursor-pointer items-start gap-3 text-sm font-medium text-amber-950"><input type="checkbox" className="mt-1 h-4 w-4 accent-amber-800" checked={restExceptionRequested} onChange={event => setRestExceptionRequested(event.target.checked)} /><span>Solicitar exceção à regra de 24 horas de descanso (somente quando necessária)</span></label>
              {restExceptionRequested ? <Field label="Justificativa administrativa" hint="A pessoa acionada verá esta justificativa antes de decidir. Não inclua informações clínicas."><textarea required rows={3} maxLength={500} className={fieldClass} value={justification} onChange={event => setJustification(event.target.value)} /></Field> : null}
            </div>
            {formError ? <p role="alert" className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-5 text-rose-800">{formError}</p> : null}
            <div className="sm:col-span-2"><button type="submit" disabled={create.isPending || people.length !== 3 || !failedAttempts.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50"><ShieldAlert className="h-4 w-4" />{create.isPending ? "Validando…" : "Solicitar aceite do familiar"}</button></div>
          </form>
        </Panel>
      </> : null}

      {!isAdmin ? <section className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Meus acionamentos</h2>
        {myRequests.isLoading ? <Panel className="p-5 text-sm text-slate-500">Verificando acionamentos vinculados à sua conta…</Panel> : myRequests.error ? <Panel role="alert" className="p-5 text-sm text-rose-800">{myRequests.error.message}</Panel> : requests.length === 0 ? <Panel className="p-5 text-sm leading-6 text-slate-600">Não há acionamento vinculado ao seu perfil. Se você foi designado para o grupo e não usa o app, a coordenação pode registrar sua resposta após falar com você.</Panel> : <div className="space-y-3">{requests.map(item => <Panel key={item.id} className="p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="mb-2 flex flex-wrap items-center gap-2"><StatusPill tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusPill><span className="text-xs text-slate-500">tentativa de cuidadora: {item.caregiverAttemptStatus}</span></div><p className="text-sm font-semibold text-slate-900">Intervalo {formatLocalLabel(item.startsLocal)}–{formatLocalLabel(item.endsLocal)}</p><p className="mt-1 text-xs text-slate-600">Cuidadora: {item.caregiverName}</p>{item.restExceptionRequested ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950"><p className="font-semibold">Esta solicitação pede uma exceção de descanso de 24 horas.</p><p className="mt-1 text-xs">Justificativa: {item.restExceptionJustification || "Não informada"}</p></div> : null}</div>
            {item.status === "solicitada" ? <div className="flex shrink-0 flex-col gap-2">{item.restExceptionRequested ? <label className="flex max-w-64 items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-950"><input type="checkbox" className="mt-1 h-4 w-4 accent-amber-800" checked={acceptRestException[item.id] ?? false} onChange={event => setAcceptRestException(current => ({ ...current, [item.id]: event.target.checked }))} /><span>Li e aceito explicitamente a exceção às 24 horas</span></label> : null}<button disabled={respond.isPending || (item.restExceptionRequested && !acceptRestException[item.id])} onClick={() => respond.mutate({ id: item.id, response: "aceita", acceptRestException: acceptRestException[item.id] ?? false })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Check className="h-4 w-4" />Aceitar acionamento</button><button disabled={respond.isPending} onClick={() => respond.mutate({ id: item.id, response: "recusada" })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" />Recusar</button></div> : null}</div></Panel>)}</div>}
        {requests.some(item => item.status === "aceita") ? <div className="mt-4 space-y-2">{requests.filter(item => item.status === "aceita").map(item => <Panel key={`cancel-${item.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-900">Acionamento aceito · {formatLocalLabel(item.startsLocal)}–{formatLocalLabel(item.endsLocal)}</p><p className="mt-1 text-xs text-slate-600">Se não puder mais cobrir, cancele aqui para reabrir a análise da cobertura.</p></div><button disabled={respond.isPending} onClick={() => respond.mutate({ id: item.id, response: "cancelada" })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" />Cancelar meu aceite</button></Panel>)}</div> : null}
      </section> : null}

      {isAdmin ? <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Registrar respostas recebidas fora do app</h2>
        {(activations.data ?? []).filter(item => item.status === "solicitada").length === 0 ? <Panel className="mb-6 p-4 text-sm text-slate-600">Não há respostas pendentes de registro.</Panel> : <div className="mb-6 space-y-3">{(activations.data ?? []).filter(item => item.status === "solicitada").map(item => {
          const source = responseSources[item.id] ?? "";
          const acceptedRestException = acceptRestException[item.id] ?? false;
          return <Panel key={`response-${item.id}`} className="p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <div><p className="text-sm font-semibold text-slate-900">{item.participantName} · {formatLocalLabel(item.startsLocal)}–{formatLocalLabel(item.endsLocal)}</p><p className="mt-1 text-xs text-slate-600">Cuidadora: {item.caregiverName} · tentativa {item.caregiverAttemptStatus}</p></div>
              <label className="text-xs font-semibold text-slate-700">Resposta recebida por
                <select aria-label={`Canal da resposta de ${item.participantName}`} className={`${fieldClass} mt-1 min-h-9`} value={source} onChange={event => setResponseSources(current => ({ ...current, [item.id]: event.target.value as ResponseSource | "" }))}>
                  <option value="">Selecione o canal</option><option value="whatsapp">WhatsApp</option><option value="telefone">Telefone</option><option value="presencial">Presencial</option><option value="outro">Outro</option>
                </select>
              </label>
            </div>
            {item.restExceptionRequested ? <label className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-950"><input type="checkbox" className="mt-1 h-4 w-4 accent-amber-800" checked={acceptedRestException} onChange={event => setAcceptRestException(current => ({ ...current, [item.id]: event.target.checked }))} /><span>Confirmei fora do app que o familiar aceitou explicitamente a exceção às 24 horas. {item.restExceptionJustification || ""}</span></label> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={coordinatorRespond.isPending || !source || (item.restExceptionRequested && !acceptedRestException)} onClick={() => coordinatorRespond.mutate({ id: item.id, response: "aceita", source: source as ResponseSource, acceptRestException: acceptedRestException })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Check className="h-4 w-4" />Registrar aceite informado</button>
              <button disabled={coordinatorRespond.isPending || !source} onClick={() => coordinatorRespond.mutate({ id: item.id, response: "recusada", source: source as ResponseSource, acceptRestException: false })} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" />Registrar recusa informada</button>
            </div>
            <p className="mt-2 text-[11px] leading-4 text-slate-500">A auditoria registra você como autor da atualização e o canal usado; ela não finge que a pessoa entrou no sistema.</p>
          </Panel>;
        })}</div>}
        {(activations.data ?? []).some(item => item.status === "aceita") ? <div className="mb-6 space-y-3"><h3 className="text-sm font-semibold text-slate-800">Registrar cancelamentos recebidos fora do app</h3>{(activations.data ?? []).filter(item => item.status === "aceita").map(item => {
          const source = responseSources[item.id] ?? "";
          return <Panel key={`cancel-response-${item.id}`} className="p-4 sm:p-5"><div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><div><p className="text-sm font-semibold text-slate-900">{item.participantName} · {formatLocalLabel(item.startsLocal)}–{formatLocalLabel(item.endsLocal)}</p><p className="mt-1 text-xs text-slate-600">Acionamento aceito para o intervalo acima.</p></div><label className="text-xs font-semibold text-slate-700">Cancelamento recebido por<select aria-label={`Canal do cancelamento de ${item.participantName}`} className={`${fieldClass} mt-1 min-h-9`} value={source} onChange={event => setResponseSources(current => ({ ...current, [item.id]: event.target.value as ResponseSource | "" }))}><option value="">Selecione o canal</option><option value="whatsapp">WhatsApp</option><option value="telefone">Telefone</option><option value="presencial">Presencial</option><option value="outro">Outro</option></select></label></div><button disabled={coordinatorRespond.isPending || !source} onClick={() => coordinatorRespond.mutate({ id: item.id, response: "cancelada", source: source as ResponseSource, acceptRestException: false })} className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X className="h-4 w-4" />Registrar cancelamento informado</button><p className="mt-2 text-[11px] leading-4 text-slate-500">A auditoria identifica o coordenador e o canal, sem atribuir a ação a uma conta do familiar.</p></Panel>;
        })}</div> : null}
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Histórico de acionamentos</h2>
        {activations.isLoading ? <Panel className="p-5 text-sm text-slate-500">Carregando histórico…</Panel> : activations.error ? <Panel role="alert" className="p-5 text-sm text-rose-800">{activations.error.message}</Panel> : (activations.data ?? []).length === 0 ? <Panel className="p-5 text-sm text-slate-600">Nenhum acionamento registrado.</Panel> : <div className="space-y-3">{activations.data?.map(item => <Panel key={item.id} className="p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="mb-2 flex flex-wrap items-center gap-2"><StatusPill tone={statusTone(item.status)}>{statusLabel(item.status)}</StatusPill><span className="text-xs text-slate-500">tentativa {item.caregiverAttemptStatus}</span></div><p className="text-sm font-semibold text-slate-900">{item.participantName} · {formatLocalLabel(item.startsLocal)}–{formatLocalLabel(item.endsLocal)}</p><p className="mt-1 text-xs text-slate-600">Tentativa da cuidadora {item.caregiverName} · solicitada por {item.requestedByName || "coordenação"}{item.respondedByName ? ` · resposta registrada por ${item.respondedByName}` : ""}</p>{item.restExceptionRequested ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs leading-5 text-amber-950">Exceção solicitada: {item.restExceptionJustification || "sem justificativa"} · {item.restExceptionAccepted ? "aceita explicitamente" : "ainda não aceita"}</p> : null}</div>{item.status === "solicitada" ? <button disabled={cancel.isPending} onClick={() => cancel.mutate({ id: item.id })} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><X className="h-3.5 w-3.5" />Cancelar solicitação</button> : null}</div></Panel>)}</div>}
      </section> : null}
    </div>
  );
}
