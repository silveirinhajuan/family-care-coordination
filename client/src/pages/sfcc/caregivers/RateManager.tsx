import { useState } from "react";
import { Edit3, Save, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Field, Panel, fieldClass } from "../../../components/sfcc/common";
import { parseBrlToCents } from "@shared/caregiverFinance";
import { SFCC_RULES } from "@shared/sfccRules";
import { formatDate, formatBrlCents } from "./shared";

function todayInFortaleza(): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: SFCC_RULES.timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export default function RateManager() {
  const utils = trpc.useUtils();
  const directory = trpc.caregivers.directory.useQuery();
  const rates = trpc.caregivers.rates.list.useQuery();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [caregiverId, setCaregiverId] = useState("");
  const [shiftType, setShiftType] = useState<"diurno" | "noturno">("diurno");
  const [amount, setAmount] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayInFortaleza);
  const [effectiveUntil, setEffectiveUntil] = useState("");

  const refresh = async () => {
    await Promise.all([utils.caregivers.rates.list.invalidate(), utils.caregivers.report.invalidate()]);
  };
  const create = trpc.caregivers.rates.create.useMutation({
    onSuccess: async () => { await refresh(); resetForm(); toast.success("Tarifa de referência registrada."); },
    onError: error => toast.error(error.message),
  });
  const update = trpc.caregivers.rates.update.useMutation({
    onSuccess: async () => { await refresh(); resetForm(); toast.success("Tarifa atualizada."); },
    onError: error => toast.error(error.message),
  });

  function resetForm() {
    setEditingId(null);
    setCaregiverId("");
    setShiftType("diurno");
    setAmount("");
    setEffectiveFrom(todayInFortaleza());
    setEffectiveUntil("");
  }

  function beginEdit(rate: NonNullable<typeof rates.data>[number]) {
    setEditingId(rate.id);
    setCaregiverId(String(rate.caregiverParticipantId));
    setShiftType(rate.shiftType);
    setAmount((rate.amountCents / 100).toFixed(2));
    setEffectiveFrom(rate.effectiveFrom);
    setEffectiveUntil(rate.effectiveUntil ?? "");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = parseBrlToCents(amount);
    if (amountCents === null) {
      toast.error("Informe um valor em reais com até duas casas decimais, sem separador de milhar.");
      return;
    }
    if (!effectiveFrom || (effectiveUntil && effectiveUntil < effectiveFrom)) {
      toast.error("Confira o início e o fim da vigência.");
      return;
    }
    const period = { amountCents, effectiveFrom, effectiveUntil: effectiveUntil || null };
    if (editingId !== null) {
      update.mutate({ id: editingId, ...period });
      return;
    }
    if (!caregiverId) {
      toast.error("Selecione uma cuidadora ativa.");
      return;
    }
    create.mutate({ caregiverParticipantId: Number(caregiverId), shiftType, ...period });
  }

  const busy = create.isPending || update.isPending;
  const people = directory.data ?? [];
  const items = rates.data ?? [];

  return (
    <div className="space-y-5">
      <Panel className="p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-900">{editingId ? "Editar tarifa de referência" : "Nova tarifa de referência"}</h2>
          <p className="mt-1 text-sm text-slate-600">Valores de referência são independentes para dia e noite. Eles nunca preenchem automaticamente o preço contratado.</p>
        </div>
        {people.length === 0 ? <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Cadastre e ative uma participante da categoria cuidadora antes de registrar tarifas.</p> : null}
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Cuidadora">
            <select required disabled={editingId !== null || people.length === 0} className={fieldClass} value={caregiverId} onChange={event => setCaregiverId(event.target.value)}>
              <option value="">Selecione</option>
              {people.map(person => <option key={person.id} value={person.id}>{person.displayName}</option>)}
              {editingId !== null && rates.data?.find(rate => rate.id === editingId)?.caregiverActive === false ? <option value={caregiverId}>{rates.data.find(rate => rate.id === editingId)?.caregiverName} · inativa</option> : null}
            </select>
          </Field>
          <Field label="Período de referência">
            <select disabled={editingId !== null} className={fieldClass} value={shiftType} onChange={event => setShiftType(event.target.value as "diurno" | "noturno")}>
              <option value="diurno">Diurno</option><option value="noturno">Noturno</option>
            </select>
          </Field>
          <Field label="Valor de referência · R$" hint="Digite, por exemplo, 250,00. Sem rateio automático por hora.">
            <input required inputMode="decimal" className={fieldClass} value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" />
          </Field>
          <Field label="Vigente desde · inclusive">
            <input required type="date" className={fieldClass} value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} />
          </Field>
          <Field label="Válida até · inclusive, opcional">
            <input type="date" min={effectiveFrom} className={fieldClass} value={effectiveUntil} onChange={event => setEffectiveUntil(event.target.value)} />
          </Field>
          <div className="flex gap-2 sm:col-span-2 xl:col-span-5">
            <button type="submit" disabled={busy || (!editingId && people.length === 0)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">
              <Save className="h-4 w-4" /> {busy ? "Salvando…" : editingId ? "Salvar tarifa" : "Registrar tarifa"}
            </button>
            {editingId !== null ? <button type="button" onClick={resetForm} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><X className="h-4 w-4" /> Cancelar edição</button> : null}
          </div>
        </form>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold text-slate-900">Histórico de tarifas</h2><p className="mt-1 text-xs text-slate-500">Vigências inclusivas; tarifas sobrepostas para a mesma cuidadora e período são recusadas.</p></div>
        {rates.isLoading ? <p className="p-5 text-sm text-slate-500">Carregando tarifas…</p> : rates.error ? <p className="p-5 text-sm text-rose-700">{rates.error.message}</p> : items.length === 0 ? <p className="p-5 text-sm text-slate-500">Nenhuma tarifa registrada. Nenhum preço é presumido.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Cuidadora</th><th className="px-5 py-3">Período</th><th className="px-5 py-3">Referência</th><th className="px-5 py-3">Vigência</th><th className="px-5 py-3">Registro</th><th className="px-5 py-3">Ação</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(rate => <tr key={rate.id}>
                  <td className="px-5 py-3 font-medium text-slate-800">{rate.caregiverName}{rate.caregiverActive ? "" : " · inativa"}</td>
                  <td className="px-5 py-3 capitalize text-slate-600">{rate.shiftType}</td>
                  <td className="px-5 py-3 font-semibold tabular-nums text-slate-900">{formatBrlCents(rate.amountCents)}</td>
                  <td className="px-5 py-3 text-slate-600">{formatDate(rate.effectiveFrom)} – {formatDate(rate.effectiveUntil)}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{rate.createdByName || "Coordenação"}</td>
                  <td className="px-5 py-3"><button onClick={() => beginEdit(rate)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Edit3 className="h-3.5 w-3.5" /> Editar</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
