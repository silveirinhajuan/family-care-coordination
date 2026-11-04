import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import SfccShell from "./components/sfcc/SfccShell";
import CommitmentsPage from "./pages/sfcc/CommitmentsPage";
import LoginPage from "./pages/sfcc/LoginPage";
import ParticipantsPage from "./pages/sfcc/ParticipantsPage";
import AvailabilityPage from "./pages/sfcc/AvailabilityPage";
import MyAvailabilityPage from "./pages/sfcc/MyAvailabilityPage";
import ShiftsPage from "./pages/sfcc/ShiftsPage";
import CaregiversPage from "./pages/sfcc/CaregiversPage";
import CoveragePage from "./pages/sfcc/CoveragePage";
import ContingenciesPage from "./pages/sfcc/ContingenciesPage";
import NotFound from "./pages/NotFound";
import { useAuth } from "./_core/hooks/useAuth";
import Home from "./pages/Home";
import { Route, Switch } from "wouter";

function AppRoutes({ isAdmin }: { isAdmin: boolean }) {
  return (
    <Switch>
      <Route path="/"><Home isAdmin={isAdmin} /></Route>
      <Route path="/participants"><ParticipantsPage isAdmin={isAdmin} /></Route>
      <Route path="/my-availability" component={MyAvailabilityPage} />
      <Route path="/availability"><AvailabilityPage isAdmin={isAdmin} /></Route>
      <Route path="/commitments"><CommitmentsPage isAdmin={isAdmin} /></Route>
      <Route path="/shifts"><ShiftsPage isAdmin={isAdmin} /></Route>
      <Route path="/caregivers"><CaregiversPage isAdmin={isAdmin} /></Route>
      <Route path="/coverage" component={CoveragePage} />
      <Route path="/contingencies"><ContingenciesPage isAdmin={isAdmin} /></Route>
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const auth = useAuth();
  if (auth.loading) {
    return <main className="flex min-h-screen items-center justify-center bg-[var(--canvas)] p-6"><div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600 shadow-sm">Verificando acesso seguro…</div></main>;
  }
  if (!auth.user) return <LoginPage />;
  return <SfccShell user={{ name: auth.user.name, email: auth.user.email, role: auth.user.role }} onLogout={() => void auth.logout()}><AppRoutes isAdmin={auth.user.role === "admin"} /></SfccShell>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <TooltipProvider>
        <Toaster />
        <AuthenticatedApp />
      </TooltipProvider>
    </ErrorBoundary>
  );
}
