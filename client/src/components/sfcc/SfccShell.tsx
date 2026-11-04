import {
  CalendarClock,
  CalendarX2,
  Clock3,
  House,
  LogOut,
  Banknote,
  Activity,
  ShieldAlert,
  UsersRound,
  UserRoundCheck,
} from "lucide-react";
import { SFCC_RULES } from "@shared/sfccRules";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";

type SfccUser = { name: string | null; email: string | null; role: "user" | "admin" };

const navigation = [
  { href: "/", label: "Início", mobileLabel: "Início", icon: House },
  { href: "/my-availability", label: "Minha disponibilidade", mobileLabel: "Minha", icon: UserRoundCheck },
  { href: "/participants", label: "Acompanhantes", mobileLabel: "Pessoas", icon: UsersRound, adminOnly: true },
  { href: "/availability", label: "Disponibilidade", mobileLabel: "pessoa acompanhadalas", icon: CalendarClock, adminOnly: true },
  { href: "/commitments", label: "Compromissos", mobileLabel: "Bloqueios", icon: CalendarX2, adminOnly: true },
  { href: "/shifts", label: "Turnos", mobileLabel: "Turnos", icon: Clock3 },
  { href: "/coverage", label: "Cobertura", mobileLabel: "Cobertura", icon: Activity },
  { href: "/contingencies", label: "Contingências", mobileLabel: "Conting.", icon: ShieldAlert },
  { href: "/caregivers", label: "Cuidadoras e financeiro", mobileLabel: "Finanças", icon: Banknote, adminOnly: true },
];

function Mark() {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--brand)] text-white shadow-sm" aria-hidden="true">
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none">
        <path d="M5 20.5h7.5c2 0 3.5-1.5 3.5-3.5s1.5-3.5 3.5-3.5H27" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="5" cy="20.5" r="2.2" fill="currentColor" />
        <circle cx="27" cy="13.5" r="2.2" fill="currentColor" />
        <path d="M9 9.5h4M19 23h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".65" />
      </svg>
    </div>
  );
}

function NavigationLinks({ mobile = false, isAdmin }: { mobile?: boolean; isAdmin: boolean }) {
  const [location] = useLocation();
  const items = navigation.filter(item => isAdmin || !item.adminOnly);
  return (
    <nav aria-label="Navegação principal" className={mobile ? "flex w-max min-w-full gap-1" : "space-y-1.5"}>
      {items.map(item => {
        const active = location === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={mobile ? item.label : undefined}
            aria-current={active ? "page" : undefined}
            className={mobile
              ? `flex min-h-[58px] min-w-[68px] flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold leading-tight ${active ? "bg-teal-50 text-teal-900" : "text-slate-500"}`
              : `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-teal-50 text-teal-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
          >
            <Icon className={mobile ? "h-5 w-5" : "h-[18px] w-[18px]"} strokeWidth={active ? 2.2 : 1.8} />
            <span>{mobile ? item.mobileLabel : item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function SfccShell({
  user,
  onLogout,
  children,
}: {
  user: SfccUser;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--canvas)] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-slate-200/80 bg-white px-5 py-6 md:flex">
        <div className="mb-9 flex items-center gap-3 px-1">
          <Mark />
          <div>
            <div className="text-lg font-bold tracking-tight">SFCC</div>
            <div className="text-[11px] text-slate-500">Coordenação do cuidado</div>
          </div>
        </div>
        <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Operação</p>
        <NavigationLinks isAdmin={user.role === "admin"} />
        <div className="mt-auto rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
          <p className="text-xs font-semibold text-teal-950">Horário operacional</p>
          <p className="mt-1 text-xs text-teal-800">Fortaleza · {SFCC_RULES.timeZone}</p>
        </div>
      </aside>

      <div className="md:pl-[260px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3 md:hidden">
            <Mark />
            <div>
              <p className="text-sm font-bold leading-tight">SFCC</p>
              <p className="text-[10px] text-slate-500">Coordenação do cuidado</p>
            </div>
          </div>
          <div className="hidden text-sm text-slate-500 md:block">Sistema Familiar de Coordenação do Cuidado</div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-40 truncate text-sm font-semibold text-slate-800">{user.name || user.email || "Conta SFCC"}</p>
              <p className="text-[11px] text-slate-500">{user.role === "admin" ? "Coordenador" : "Participante"}</p>
            </div>
            <button onClick={onLogout} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-800" aria-label="Sair da conta">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </header>

        <main className="mx-auto min-h-[calc(100vh-68px)] w-full max-w-[1320px] px-4 py-6 pb-28 sm:px-7 sm:py-8 md:pb-12">
          {children}
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 overflow-x-auto border-t border-slate-200 bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),0.35rem)] pt-1.5 shadow-[0_-8px_24px_-24px_rgba(18,52,49,0.55)] backdrop-blur md:hidden">
        <NavigationLinks mobile isAdmin={user.role === "admin"} />
      </div>
    </div>
  );
}
