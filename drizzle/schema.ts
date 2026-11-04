import {
  boolean,
  foreignKey,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Conta de autenticação do starter; distinta do cadastro operacional de acompanhante. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const participants = mysqlTable("participants", {
  id: int("id").autoincrement().primaryKey(),
  linkedUserId: int("linkedUserId").references(() => users.id, { onDelete: "set null" }),
  displayName: varchar("displayName", { length: 120 }).notNull(),
  relationshipToCareRecipient: varchar("relationshipToCareRecipient", { length: 120 }),
  category: mysqlEnum("category", ["familiar", "cuidadora", "outros"]).notNull(),
  contact: varchar("contact", { length: 255 }),
  active: boolean("active").default(true).notNull(),
  emergencyEligible: boolean("emergencyEligible").default(false).notNull(),
  // Legacy columns kept only to preserve existing shared-database rows; never read, write, expose, or use as coverage gates.
  dayAuthorization: mysqlEnum("dayAuthorization", ["unknown", "authorized", "denied"])
    .default("unknown")
    .notNull(),
  nightAuthorization: mysqlEnum("nightAuthorization", ["unknown", "authorized", "denied"])
    .default("unknown")
    .notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ linkedUserUnique: uniqueIndex("participants_linked_user_unique").on(table.linkedUserId) }));

/** Local wall-time values are interpreted only in America/Fortaleza. */
export const availabilityWindows = mysqlTable(
  "availability_windows",
  {
    id: int("id").autoincrement().primaryKey(),
    participantId: int("participantId")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", ["available", "unavailable"]).notNull(),
    recurrence: mysqlEnum("recurrence", ["once", "weekly"]).default("once").notNull(),
    startsLocal: varchar("startsLocal", { length: 16 }).notNull(),
    endsLocal: varchar("endsLocal", { length: 16 }).notNull(),
    repeatDays: varchar("repeatDays", { length: 20 }),
    repeatUntil: varchar("repeatUntil", { length: 10 }),
    createdBy: int("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ participantIndex: index("availability_participant_idx").on(table.participantId) }),
);

export const commitments = mysqlTable(
  "commitments",
  {
    id: int("id").autoincrement().primaryKey(),
    participantId: int("participantId")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    description: varchar("description", { length: 160 }).notNull(),
    recurrence: mysqlEnum("recurrence", ["once", "weekly"]).default("once").notNull(),
    startsLocal: varchar("startsLocal", { length: 16 }).notNull(),
    endsLocal: varchar("endsLocal", { length: 16 }).notNull(),
    repeatDays: varchar("repeatDays", { length: 20 }),
    repeatUntil: varchar("repeatUntil", { length: 10 }),
    createdBy: int("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ participantIndex: index("commitments_participant_idx").on(table.participantId) }),
);

export const shifts = mysqlTable(
  "shifts",
  {
    id: int("id").autoincrement().primaryKey(),
    startsLocal: varchar("startsLocal", { length: 16 }).notNull(),
    endsLocal: varchar("endsLocal", { length: 16 }).notNull(),
    classification: mysqlEnum("classification", ["diurno", "noturno", "misto"]).notNull(),
    status: mysqlEnum("status", ["scheduled", "cancelled"]).default("scheduled").notNull(),
    notes: text("notes"),
    createdBy: int("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ rangeIndex: index("shifts_range_idx").on(table.startsLocal, table.status) }),
);

export const shiftAssignments = mysqlTable(
  "shift_assignments",
  {
    id: int("id").autoincrement().primaryKey(),
    shiftId: int("shiftId")
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    participantId: int("participantId")
      .notNull()
      .references(() => participants.id),
    confirmationStatus: mysqlEnum("confirmationStatus", ["pending", "accepted", "declined", "cancelled"])
      .default("pending")
      .notNull(),
    assignedByUserId: int("assignedByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    shiftIndex: index("shift_assignments_shift_idx").on(table.shiftId),
    participantIndex: index("shift_assignments_participant_idx").on(table.participantId),
  }),
);

/** Referência de preço por cuidadora e turno; valores são BRL em centavos. */
export const caregiverRates = mysqlTable(
  "caregiver_rates",
  {
    id: int("id").autoincrement().primaryKey(),
    caregiverParticipantId: int("caregiverParticipantId")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    shiftType: mysqlEnum("shiftType", ["diurno", "noturno"]).notNull(),
    amountCents: int("amountCents").notNull(),
    effectiveFrom: varchar("effectiveFrom", { length: 10 }).notNull(),
    effectiveUntil: varchar("effectiveUntil", { length: 10 }),
    createdBy: int("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    caregiverTypeIndex: index("caregiver_rates_caregiver_type_idx").on(table.caregiverParticipantId, table.shiftType),
    effectiveIndex: index("caregiver_rates_effective_idx").on(table.shiftType, table.effectiveFrom),
  }),
);

/** Cada linha registra uma tentativa ou uma contratação ligada a um turno. */
export const caregiverBookings = mysqlTable(
  "caregiver_bookings",
  {
    id: int("id").autoincrement().primaryKey(),
    shiftId: int("shiftId").notNull().references(() => shifts.id, { onDelete: "restrict" }),
    coverageStartsLocal: varchar("coverageStartsLocal", { length: 16 }).notNull(),
    coverageEndsLocal: varchar("coverageEndsLocal", { length: 16 }).notNull(),
    caregiverParticipantId: int("caregiverParticipantId")
      .notNull()
      .references(() => participants.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", [
      "solicitada",
      "disponível",
      "indisponível",
      "recusada",
      "confirmada",
      "cancelada",
      "realizada",
    ]).default("solicitada").notNull(),
    amountCents: int("amountCents"),
    /** null = custo não informado; zero = custo explicitamente inexistente. */
    cancellationFeeCents: int("cancellationFeeCents"),
    notes: text("notes"),
    createdBy: int("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    shiftCaregiverUnique: uniqueIndex("caregiver_bookings_shift_caregiver_unique").on(table.shiftId, table.caregiverParticipantId),
    shiftStatusIndex: index("caregiver_bookings_shift_status_idx").on(table.shiftId, table.status),
    caregiverStatusIndex: index("caregiver_bookings_caregiver_status_idx").on(table.caregiverParticipantId, table.status),
  }),
);

/** Pagamentos são registros separados dos valores contratados e das realizações. */
export const caregiverPayments = mysqlTable(
  "caregiver_payments",
  {
    id: int("id").autoincrement().primaryKey(),
    caregiverBookingId: int("caregiverBookingId")
      .notNull()
      .references(() => caregiverBookings.id, { onDelete: "restrict" }),
    amountCents: int("amountCents").notNull(),
    status: mysqlEnum("status", ["pendente", "pago", "cancelado"]).default("pendente").notNull(),
    paidOn: varchar("paidOn", { length: 10 }),
    notes: text("notes"),
    createdBy: int("createdBy").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    bookingStatusIndex: index("caregiver_payments_booking_status_idx").on(table.caregiverBookingId, table.status),
    paidOnIndex: index("caregiver_payments_paid_on_idx").on(table.paidOn, table.status),
  }),
);

/** Solicitações emergenciais permanecem pendentes até aceite explícito do familiar acionado. */
export const emergencyActivations = mysqlTable(
  "emergency_activations",
  {
    id: int("id").autoincrement().primaryKey(),
    caregiverBookingId: int("caregiverBookingId").notNull(),
    participantId: int("participantId").notNull(),
    startsLocal: varchar("startsLocal", { length: 16 }).notNull(),
    endsLocal: varchar("endsLocal", { length: 16 }).notNull(),
    status: mysqlEnum("status", ["solicitada", "aceita", "recusada", "cancelada"])
      .default("solicitada")
      .notNull(),
    restExceptionRequested: boolean("restExceptionRequested").default(false).notNull(),
    restExceptionAccepted: boolean("restExceptionAccepted").default(false).notNull(),
    restExceptionJustification: varchar("restExceptionJustification", { length: 500 }),
    requestedByUserId: int("requestedByUserId").notNull(),
    respondedByUserId: int("respondedByUserId"),
    respondedAt: timestamp("respondedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    caregiverBookingFk: foreignKey({
      name: "sfcc_emergency_booking_fk",
      columns: [table.caregiverBookingId],
      foreignColumns: [caregiverBookings.id],
    }).onDelete("restrict"),
    participantFk: foreignKey({
      name: "sfcc_emergency_participant_fk",
      columns: [table.participantId],
      foreignColumns: [participants.id],
    }).onDelete("restrict"),
    requesterFk: foreignKey({
      name: "sfcc_emergency_requester_fk",
      columns: [table.requestedByUserId],
      foreignColumns: [users.id],
    }),
    responderFk: foreignKey({
      name: "sfcc_emergency_responder_fk",
      columns: [table.respondedByUserId],
      foreignColumns: [users.id],
    }),
    participantStatusIndex: index("emergency_participant_status_idx").on(table.participantId, table.status),
    intervalStatusIndex: index("emergency_interval_status_idx").on(table.startsLocal, table.status),
    failedBookingIndex: index("emergency_booking_idx").on(table.caregiverBookingId),
  }),
);

/** Audit details intentionally contain only administrative event metadata, not clinical notes. */
export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: int("id").autoincrement().primaryKey(),
    actorUserId: int("actorUserId").notNull().references(() => users.id),
    action: varchar("action", { length: 64 }).notNull(),
    entityType: varchar("entityType", { length: 48 }).notNull(),
    entityId: int("entityId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ entityIndex: index("audit_entity_idx").on(table.entityType, table.entityId) }),
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Participant = typeof participants.$inferSelect;
export type AvailabilityWindow = typeof availabilityWindows.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type ShiftAssignment = typeof shiftAssignments.$inferSelect;
