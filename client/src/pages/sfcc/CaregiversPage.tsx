import { useState } from "react";
import { Banknote, CalendarRange, ClipboardList, ShieldAlert } from "lucide-react";
import { PageHeading, Panel } from "../../components/sfcc/common";
import RateManager from "./caregivers/RateManager";
import BookingsManager from "./caregivers/BookingsManager";
import PaymentsManager from "./caregivers/PaymentsManager";
import FinancialReport from "./caregivers/FinancialReport";

type Tab = "rates" | "bookings" | "payments" | "reports";
const tabs: { id: Tab; label: string; shortLabel: string; icon: typeof Banknote }[] = [
  { id: "rates", label: "Tarifas", shortLabel: "Tarifas", icon: Banknote },
  { id: "bookings", label: "Tentativas e contratações", shortLabel: "Contratações", icon: ClipboardList },
  { id: "payments", label: "Pagamentos", shortLabel: "Pagamentos", icon: CalendarRange },
  { id: "reports", label: "Relatórios", shortLabel: "Relatórios", icon: Banknote },
];

export default function CaregiversPage({ isAdmin }: { isAdmin: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>("rates");
  if (!isAdmin) {
    return <Panel className="mx-auto mt-12 max-w-lg p-6 text-center"><ShieldAlert className="mx-auto mb-3 h-7 w-7 text-rose-700" /><h1 className="text-lg font-semibold text-slate-900">Área administrativa</h1><p className="mt-2 text-sm text-slate-600">Tarifas, contratações e pagamentos estão disponíveis somente para a coordenação.</p></Panel>;
  }
  return (
    <div>
      <PageHeading eyebrow="Administração financeira" title="Cuidadoras e custos" description="Organize tarifas de referência, tentativas de contratação e pagamentos sem confundir custo contratado com despesa paga." />
      <div className="mb-5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1.5">
        <nav aria-label="Seções de cuidadoras e financeiro" className="flex min-w-max gap-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return <button key={tab.id} type="button" aria-current={active ? "page" : undefined} onClick={() => setActiveTab(tab.id)} className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold transition sm:px-4 sm:text-sm ${active ? "bg-teal-50 text-teal-950" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4" /><span className="sm:hidden">{tab.shortLabel}</span><span className="hidden sm:inline">{tab.label}</span></button>;
          })}
        </nav>
      </div>
      {activeTab === "rates" ? <RateManager /> : null}
      {activeTab === "bookings" ? <BookingsManager /> : null}
      {activeTab === "payments" ? <PaymentsManager /> : null}
      {activeTab === "reports" ? <FinancialReport /> : null}
      <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950"><strong>Regras pendentes:</strong> despesas além de cuidadoras não são incluídas; custos de cancelamento só são registrados quando informados; turnos parciais exigem preço negociado específico. Tarifas de referência não preenchem contratos automaticamente.</p>
    </div>
  );
}
