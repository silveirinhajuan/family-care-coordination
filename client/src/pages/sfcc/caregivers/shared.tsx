import { formatBrlCents } from "@shared/caregiverFinance";
import { formatLocalLabel, StatusPill } from "../../../components/sfcc/common";

export { formatBrlCents };

const bookingStatus = {
  solicitada: { label: "Solicitada", tone: "warn" as const },
  disponível: { label: "Disponível", tone: "brand" as const },
  indisponível: { label: "Indisponível", tone: "neutral" as const },
  recusada: { label: "Recusada", tone: "bad" as const },
  confirmada: { label: "Confirmada", tone: "good" as const },
  cancelada: { label: "Cancelada", tone: "bad" as const },
  realizada: { label: "Realizada", tone: "neutral" as const },
};

const paymentStatus = {
  pendente: { label: "Pendente", tone: "warn" as const },
  pago: { label: "Pago", tone: "good" as const },
  cancelado: { label: "Cancelado", tone: "neutral" as const },
};

export function BookingStatusPill({ status }: { status: keyof typeof bookingStatus }) {
  const item = bookingStatus[status];
  return <StatusPill tone={item.tone}>{item.label}</StatusPill>;
}

export function PaymentStatusPill({ status }: { status: keyof typeof paymentStatus }) {
  const item = paymentStatus[status];
  return <StatusPill tone={item.tone}>{item.label}</StatusPill>;
}

export function formatShiftRange(startsLocal: string, endsLocal: string): string {
  return `${formatLocalLabel(startsLocal)}–${endsLocal.slice(11)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Não informada";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function bookingStatusLabel(status: keyof typeof bookingStatus): string {
  return bookingStatus[status].label;
}
