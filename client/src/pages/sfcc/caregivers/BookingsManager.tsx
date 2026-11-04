import { useState } from "react";
import { ClipboardList, Edit3, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Field, Panel, fieldClass } from "../../../components/sfcc/common";
import { parseBrlToCents } from "@shared/caregiverFinance";
import { BookingStatusPill, formatBrlCents, formatShiftRange } from "./shared";

type BookingStatus = "solicitada" | "disponível" | "indisponível" | "recusada" | "confirmada" | "cancelada" | "realizada";

function canManageBooking(item: { status: BookingStatus; cancellationFeeCents: number | null }): boolean {
  return !(["indisponível", "recusada", "realizada"] as BookingStatus[]).includes(item.status)
    && (item.status !== "cancelada" || item.cancellationFeeCents === null);
}

const transitions: Record<BookingStatus, BookingStatus[]> = {
  solicitada: ["solicitada", "disponível", "indisponível", "recusada", "confirmada", "cancelada"],
  disponível: ["disponível", "indisponível", "recusada", "confirmada", "cancelada"],
  indisponível: ["indisponível"],
  recusada: ["recusada"],
  confirmada: ["confirmada", "cancelada", "realizada"],
  cancelada: ["cancelada"],
  realizada: ["realizada"],
};

export default function BookingsManager() {
  const utils = trpc.useUtils();
  const caregivers = trpc.caregivers.directory.useQuery();
  const shifts = trpc.caregivers.bookableShifts.useQuery();
  const bookings = trpc.caregivers.bookings.list.useQuery();
  const rates = trpc.caregivers.rates.list.useQuery();
  type Booking = NonNullable<typeof bookings.data>[number];
  const [caregiverId, setCaregiverId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [coverageStart, setCoverageStart] = useState("");
  const [coverageEnd, setCoverageEnd] = useState("");
  const [requestNotes, setRequestNotes] = useState("");
  const [editing, setEditing] = useState<Booking | null>(null);
  const [draftStatus, setDraftStatus] = useState<BookingStatus>("solicitada");
  const [amount, setAmount] = useState("");
  const [cancellationFee, setCancellationFee] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = async () => {
    await Promise.all([
      utils.caregivers.bookings.list.invalidate(),
      utils.caregivers.bookableShifts.invalidate(),
      utils.caregivers.payments.list.invalidate(),
      utils.caregivers.report.invalidate(),
    ]);
  };
  const create = trpc.caregivers.bookings.createAttempt.useMutation({
    onSuccess: async () => { await refresh(); setShiftId(""); setRequestNotes(""); toast.success("Tentativa de contratação registrada como solicitada."); },
    onError: error => toast.error(error.message),
  });
  const update = trpc.caregivers.bookings.update.useMutation({
    onSuccess: async () => { await refresh(); setEditing(null); toast.success("Estado da tentativa/contratação atualizado."); },
    onError: error => toast.error(error.message),
  });

  function startEdit(item: Booking) {
    setEditing(item);
    setDraftStatus(item.status);
    setAmount(item.amountCents === null ? "" : (item.amountCents / 100).toFixed(2));
    setCancellationFee(item.cancellationFeeCents === null ? "" : (item.cancellationFeeCents / 100).toFixed(2));
    setNotes(item.notes ?? "");
  }

  function submitCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!caregiverId || !shiftId) return toast.error("Selecione cuidadora e turno.");
    if (!coverageStart || !coverageEnd) return toast.error("Informe o intervalo que a cuidadora foi solicitada a cobrir.");
    create.mutate({
      shiftId: Number(shiftId),
      caregiverParticipantId: Number(caregiverId),
      coverageStartsLocal: coverageStart,
      coverageEndsLocal: coverageEnd,
      notes: requestNotes || null,
    });
  }

  function submitUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const input: { id: number; status: BookingStatus; amountCents?: number | null; cancellationFeeCents?: number | null; notes: string | null } = {
      id: editing.id,
      status: draftStatus,
      notes: notes || null,
    };
    if (draftStatus === "confirmada") {
      const parsed = parseBrlToCents(amount);
      if (parsed === null) return toast.error("Informe o valor efetivamente combinado em reais.");
      input.amountCents = parsed;
    }
    if (draftStatus === "cancelada" && (editing.status === "confirmada" || (editing.status === "cancelada" && editing.cancellationFeeCents === null))) {
      input.cancellationFeeCents = cancellationFee.trim() === "" ? null : parseBrlToCents(cancellationFee);
      if (cancellationFee.trim() !== "" && input.cancellationFeeCents === null) return toast.error("Informe o custo de cancelamento em reais ou deixe em branco se ainda não foi informado.");
    }
    update.mutate(input);
  }

  const caregiverOptions = caregivers.data ?? [];
  const shiftOptions = shifts.data ?? [];
  const rows = bookings.data ?? [];
  const selectedCaregiver = caregiverOptions.find(item => item.id === Number(caregiverId));
  const selectedShift = shiftOptions.find(item => item.id === Number(shiftId));
  const referenceRate = selectedShift && caregiverId && (selectedShift.classification === "diurno" || selectedShift.classification === "noturno")
    ? rates.data?.find(rate => rate.caregiverParticipantId === Number(caregiverId)
      && rate.shiftType === selectedShift.classification
      && rate.effectiveFrom <= selectedShift.startsLocal.slice(0, 10)
      && (!rate.effectiveUntil || rate.effectiveUntil >= selectedShift.startsLocal.slice(0, 10)))
    : undefined;

  return (
    <div className="space-y-5">
      <Panel className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-teal-50 p-2 text-teal-900"><Plus className="h-5 w-5" /></div><div><h2 className="text-base font-semibold text-slate-900">Registrar tentativa de contratação</h2><p className="mt-1 text-sm text-slate-600">Cada tentativa registra um turno e uma cuidadora. Somente uma cuidadora pode ficar confirmada por turno.</p></div></div>
        {caregiverOptions.length === 0 ? <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Não há cuidadoras ativas cadastradas. Cadastre uma participante da categoria cuidadora primeiro.</p> : null}
        <form onSubmit={submitCreate} className="grid gap-4 sm:grid-cols-2">
          <Field label="Cuidadora">
            <select required disabled={!caregiverOptions.length} className={fieldClass} value={caregiverId} onChange={event => setCaregiverId(event.target.value)}><option value="">Selecione</option>{caregiverOptions.map(item => <option key={item.id} value={item.id}>{item.displayName}</option>)}</select>
          </Field>
          <Field label="Turno que precisa de cobertura">
            <select required className={fieldClass} value={shiftId} onChange={event => { const id = event.target.value; const selected = shiftOptions.find(item => item.id === Number(id)); setShiftId(id); setCoverageStart(selected?.startsLocal ?? ""); setCoverageEnd(selected?.endsLocal ?? ""); }}><option value="">Selecione</option>{shiftOptions.map(item => <option key={item.id} value={item.id}>{formatShiftRange(item.startsLocal, item.endsLocal)} · {item.classification} · {item.assignedParticipantNames.join(", ") || "sem acompanhante indicado"}</option>)}</select>
          </Field>
          {selectedShift ? <>
            <Field label="Início da cobertura solicitada" hint="Pode ser igual ao início do turno para cobertura integral."><input required type="datetime-local" min={selectedShift.startsLocal} max={selectedShift.endsLocal} className={fieldClass} value={coverageStart} onChange={event => setCoverageStart(event.target.value)} /></Field>
            <Field label="Fim da cobertura solicitada" hint="Para cobertura parcial, informe o intervalo exato; o valor negociado será registrado manualmente."><input required type="datetime-local" min={selectedShift.startsLocal} max={selectedShift.endsLocal} className={fieldClass} value={coverageEnd} onChange={event => setCoverageEnd(event.target.value)} /></Field>
            <div className="sm:col-span-2 rounded-xl border border-teal-100 bg-teal-50/60 p-3 text-sm text-teal-950">
            <p className="font-semibold">Tarifa de referência (não aplicada ao contrato)</p>
            <p className="mt-1 text-xs text-teal-800">{selectedShift.classification === "misto" ? "Este turno atravessa períodos; informe o valor negociado especificamente. Nenhum rateio automático é feito." : referenceRate ? `${formatBrlCents(referenceRate.amountCents)} para ${selectedShift.classification}, vigente no dia do turno. Informe separadamente o valor efetivamente combinado.` : "Não há tarifa de referência vigente para essa cuidadora e período. O valor contratado será informado manualmente."}</p>
          </div>
          </> : null}
          <Field label="Observação administrativa (opcional)" hint="Não inclua informações clínicas.">
            <input className={fieldClass} value={requestNotes} onChange={event => setRequestNotes(event.target.value)} maxLength={1000} placeholder="Ex.: tentativa feita por telefone" />
          </Field>
          <div className="flex items-end"><button disabled={create.isPending || !caregiverOptions.length} type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50"><ClipboardList className="h-4 w-4" />{create.isPending ? "Registrando…" : "Registrar como solicitada"}</button></div>
        </form>
      </Panel>

      <div className="space-y-3">
        {bookings.isLoading ? <Panel className="p-5 text-sm text-slate-500">Carregando tentativas e contratações…</Panel> : bookings.error ? <Panel className="p-5 text-sm text-rose-700">{bookings.error.message}</Panel> : rows.length === 0 ? <Panel className="p-7 text-sm text-slate-600">Nenhuma tentativa ou contratação registrada.</Panel> : rows.map(item => (
          <Panel key={item.id} className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2"><BookingStatusPill status={item.status} /><span className="text-xs text-slate-500">Turno {item.id} · {item.shiftClassification}</span></div>
                <p className="text-sm font-semibold text-slate-900">{item.caregiverName} · {formatShiftRange(item.startsLocal, item.endsLocal)}</p>
                <p className="mt-1 text-xs text-slate-600">Acompanhantes no turno: {item.assignedParticipantNames.join(", ") || "não indicados"} · cobertura contratada: {formatShiftRange(item.coverageStartsLocal, item.coverageEndsLocal)}</p>
                <p className="mt-1 text-xs text-slate-500">Responsável pelo registro: {item.createdByName || "Coordenação"}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <span>Valor combinado: <strong>{formatBrlCents(item.amountCents)}</strong></span>
                  {item.status === "cancelada" ? <span>Custo de cancelamento: <strong>{formatBrlCents(item.cancellationFeeCents)}</strong></span> : null}
                </div>
                {item.notes ? <p className="mt-2 text-xs text-slate-500">{item.notes}</p> : null}
              </div>
              {canManageBooking(item) ? <button onClick={() => startEdit(item)} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> {item.status === "cancelada" ? "Informar custo" : "Gerenciar"}</button> : null}
            </div>
            {editing?.id === item.id ? <form onSubmit={submitUpdate} className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <Field label="Resultado da tentativa / contratação">
                <select className={fieldClass} value={draftStatus} onChange={event => setDraftStatus(event.target.value as BookingStatus)}>{transitions[item.status].map(status => <option key={status} value={status}>{({ solicitada: "Solicitada", disponível: "Disponível", indisponível: "Indisponível", recusada: "Recusada", confirmada: "Confirmada", cancelada: "Cancelada", realizada: "Realizada" })[status]}</option>)}</select>
              </Field>
              {draftStatus === "confirmada" ? <Field label="Valor efetivamente combinado · R$" hint="Obrigatório para confirmar; não é preenchido pela tarifa de referência."><input required inputMode="decimal" className={fieldClass} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" /></Field> : null}
              {draftStatus === "cancelada" && (item.status === "confirmada" || (item.status === "cancelada" && item.cancellationFeeCents === null)) ? <Field label="Custo específico de cancelamento · R$" hint="Deixe vazio se ainda não foi informado; digite 0,00 apenas se foi confirmado que não há custo."><input inputMode="decimal" className={fieldClass} value={cancellationFee} onChange={event => setCancellationFee(event.target.value)} placeholder="Não informado" /></Field> : null}
              <Field label="Observação administrativa" hint="Não inclua informações clínicas."><input className={fieldClass} value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} /></Field>
              <div className="flex items-end gap-2"><button type="submit" disabled={update.isPending} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--brand)] px-3.5 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-50"><Save className="h-4 w-4" />{update.isPending ? "Salvando…" : "Salvar"}</button><button type="button" onClick={() => setEditing(null)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><X className="h-4 w-4" />Cancelar</button></div>
            </form> : null}
          </Panel>
        ))}
      </div>
    </div>
  );
}
