import { startLogin } from "@/const";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] px-5 py-12">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_24px_80px_-48px_rgba(18,52,49,0.45)] sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--brand)] text-white">
            <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" aria-hidden="true"><path d="M5 20.5h7.5c2 0 3.5-1.5 3.5-3.5s1.5-3.5 3.5-3.5H27" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><circle cx="5" cy="20.5" r="2.2" fill="currentColor" /><circle cx="27" cy="13.5" r="2.2" fill="currentColor" /></svg>
          </div>
          <div><p className="text-xl font-bold tracking-tight text-slate-900">SFCC</p><p className="text-xs text-slate-500">Coordenação do cuidado</p></div>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Sistema familiar</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Entre para ver a escala</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">O SFCC organiza acompanhantes, turnos e passagens de responsabilidade. Ele não armazena informações clínicas.</p>
        <button onClick={() => startLogin()} className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-900/20">
          Entrar com conta Manus <ArrowRight className="h-4 w-4" />
        </button>
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3.5 text-xs leading-5 text-slate-600">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-800" />
          <p>Acesso protegido. As contas do aplicativo usam autenticação Manus. A coordenação pode registrar as respostas de quem não usa o aplicativo.</p>
        </div>
      </div>
    </main>
  );
}
