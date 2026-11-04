import { useMemo, useState } from "react";
import { CircleDollarSign, Plus } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Field, Panel, fieldClass } from "../../../components/sfcc/common";
import { parseBrlToCents } from "@shared/caregiverFinance";
import { SFCC_RULES } from "@shared/sfccRules";
import { BookingStatusPill, formatBrlCents, formatShiftRange, PaymentStatusPill } from "./shared";

function todayInFortaleza(): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: SFCC_RULES.timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export default function PaymentsManager() {
  const utils = trpc.useUtils();
  const bookings = trpc.caregivers.bookings.list.useQuery();
  const payments = trpc.caregivers.payments.list.useQuery();
  const [bookingId, setBookingId] = useState("");
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"pendente" | "pago">("pendente");
  const [paidOn, setPaidOn] = useState(todayInFortaleza);
  const [notes, setNotes] = useState("");
  const [paymentDates, setPaymentDates] = useState<Record<number, string>>({});

  const refresh = async () => {
    await Promise.all([utils.caregivers.payments.list.invalidate(), utils.caregivers.report.invalidate()]);
  };
  const create = trpc.caregivers.payments.create.useMutation({
    onSuccess: async () => { await refresh(); setAmount(""); setNotes(""); toast.success("Pagamento registrado separadamente da contratação."); },
    onError: error => toast.error(error.message),
  });
  const update = trpc.caregivers.payments.update.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Situação do pagamento atualizada."); },
    onError: error => toast.error(error.message),
  });

  const bookingOptions = useMemo(() => (bookings.data ?? []).filter(item =>
    (item.status === "confirmada" || item.status === "realizada") && item.amountCents !== null
      || item.status === "cancelada" && item.cancellationFeeCents !== null && item.cancellationFeeCents > 0,
  ), [bookings.data]);
  const selectedBooking = bookingOptions.find(item => item.id === Number(bookingId));
  const existingPayments = (payments.data ?? []).filter(item => item.caregiverBookingId === Number(bookingId) && item.status !== "cancelado");
  const amountDue = selectedBooking?.status === "cancelada"
    ? selectedBooking.cancellationFeeCents ?? 0
    : selectedBooking?.amountCents ?? 0;
  const recorded = existingPayments.reduce((total, item) => total + item.amountCents, 0);
  const remaining = Math.max(0, amountDue - recorded);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseBrlToCents(amount);
    if (!bookingId) return toast.error("Selecione uma contratação.");
    if (amountCents === null || amountCents <= 0) return toast.error("Informe um valor positivo em reais.");
    if (amountCents > remaining) return toast.error("O valor informado supera o saldo ainda não registrado.");
    if (status === "pago" && !paidOn) return toast.error("Informe a data em que o pagamento foi realizado.");
    create.mutate({
      caregiverBookingId: Number(bookingId),
      amountCents,
      status,
      paidOn: status === "pago" ? paidOn : null,
      notes: notes || null,
    });
  }

  function changePayment(item: NonNullable<typeof payments.data>[number]) {
    const nextStatus = item.status === "pago" ? "pendente" : "pago";
    const date = paymentDates[item.id] || todayInFortaleza();
    update.mutate({ id: item.id, status: nextStatus, paidOn: nextStatus === "pago" ? date : null });
  }

  const paymentRows = payments.data ?? [];

  return (
    <div className="space-y-5">
      <Panel className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3"><div className="rounded-xl bg-teal-50 p-2 text-teal-900"><CircleDollarSign className="h-5 w-5" /></div><div><h2 className="text-base font-semibold text-slate-900">Registrar pagamento</h2><p className="mt-1 text-sm text-slate-600">Pagamentos são parcelas separadas; não mudam automaticamente a situação da contratação ou do turno.</p></div></div>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Contratação ou custo de cancelamento">
            <select required className={fieldClass} value={bookingId} onChange={event => setBookingId(event.target.value)}><option value="">Selecione</option>{bookingOptions.map(item => <option key={item.id} value={item.id}>{item.caregiverName} · {formatShiftRange(item.startsLocal, item.endsLocal)} · {item.status === "cancelada" ? "custo de cancelamento" : "contratação"}</option>)}</select>
          </Field>
          <Field label="Valor do pagamento · R$" hint={selectedBooking ? `Saldo ainda não registrado: ${formatBrlCents(remaining)}.` : "Informe o valor efetivamente pago ou pendente."}>
            <input required inputMode="decimal" className={fieldClass} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Situação">
            <select className={fieldClass} value={status} onChange={event => setStatus(event.target.value as "pendente" | "pago")}><option value="pendente">Pendente</option><option value="pago">Pago</option></select>
          </Field>
          {status === "pago" ? <Field label="Data do pagamento"><input required type="date" className={fieldClass} value={paidOn} onChange={event => setPaidOn(event.target.value)} /></Field> : null}
          <Field label="Observação administrativa (opcional)" hint="Não inclua informações clínicas."><input className={fieldClass} value={notes} onChange={event => setNotes(event.target.value)} maxLength={1000} /></Field>
          <div className="flex items-end"><button type="submit" disabled={create.isPending || !selectedBooking || remaining <= 0} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50"><Plus className="h-4 w-4" />{create.isPending ? "Salvando…" : "Registrar pagamento"}</button></div>
        </form>
        {selectedBooking ? <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600"><BookingStatusPill status={selectedBooking.status} /> <span className="ml-2">Valor contratado/custo conhecido: {formatBrlCents(amountDue)} · já registrado: {formatBrlCents(recorded)} · restante: {formatBrlCents(remaining)}</span></p> : null}
        {!bookingOptions.length && bookings.data ? <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Não há contratação confirmada com saldo, nem custo de cancelamento informado para pagamento.</p> : null}
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Histórico de pagamentos</h2><p className="mt-1 text-xs text-slate-500">Pago, pendente e cancelado são estados financeiros; não representam execução do turno.</p></div>
        {payments.isLoading ? <p className="p-5 text-sm text-slate-500">Carregando pagamentos…</p> : payments.error ? <p className="p-5 text-sm text-rose-700">{payments.error.message}</p> : paymentRows.length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhum pagamento registrado.</p> : (
          <div className="divide-y divide-slate-100">
            {paymentRows.map(item => <div key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><PaymentStatusPill status={item.status} /><span className="text-xs text-slate-500">{item.shiftClassification} · turno de {formatShiftRange(item.startsLocal, item.endsLocal)} · cobertura de {formatShiftRange(item.coverageStartsLocal, item.coverageEndsLocal)}</span></div><p className="text-sm font-semibold text-slate-900">{item.caregiverName} · {formatBrlCents(item.amountCents)}</p><p className="mt-1 text-xs text-slate-500">Data de pagamento: {item.paidOn || "Não liquidado"}{item.notes ? ` · ${item.notes}` : ""}</p></div>
              {item.status !== "cancelado" ? <div className="flex items-center gap-2">{item.status === "pendente" ? <input aria-label="Data em que o pagamento será marcado como pago" type="date" className={`${fieldClass} min-h-9 max-w-40 text-xs`} value={paymentDates[item.id] ?? todayInFortaleza()} onChange={event => setPaymentDates(current => ({ ...current, [item.id]: event.target.value }))} /> : null}<button onClick={() => changePayment(item)} disabled={update.isPending} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{item.status === "pago" ? "Reabrir pendência" : "Marcar como pago"}</button></div> : null}
            </div>)}
          </div>
        )}
      </Panel>
    </div>
  );
}
