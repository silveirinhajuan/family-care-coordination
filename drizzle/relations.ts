import { relations } from "drizzle-orm";
import {
  auditEvents,
  availabilityWindows,
  caregiverBookings,
  caregiverPayments,
  caregiverRates,
  commitments,
  emergencyActivations,
  participants,
  shiftAssignments,
  shifts,
  users,
} from "./schema";

export const participantsRelations = relations(participants, ({ many, one }) => ({
  linkedUser: one(users, { fields: [participants.linkedUserId], references: [users.id] }),
  availabilityWindows: many(availabilityWindows),
  commitments: many(commitments),
  shiftAssignments: many(shiftAssignments),
  caregiverRates: many(caregiverRates),
  caregiverBookings: many(caregiverBookings),
  emergencyActivations: many(emergencyActivations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  participant: one(participants),
  createdCaregiverRates: many(caregiverRates),
  createdCaregiverBookings: many(caregiverBookings),
  createdCaregiverPayments: many(caregiverPayments),
  requestedEmergencyActivations: many(emergencyActivations, { relationName: "emergencyActivationRequester" }),
  respondedEmergencyActivations: many(emergencyActivations, { relationName: "emergencyActivationResponder" }),
}));

export const availabilityWindowsRelations = relations(availabilityWindows, ({ one }) => ({
  participant: one(participants, {
    fields: [availabilityWindows.participantId],
    references: [participants.id],
  }),
  createdBy: one(users, {
    fields: [availabilityWindows.createdBy],
    references: [users.id],
  }),
}));

export const commitmentsRelations = relations(commitments, ({ one }) => ({
  participant: one(participants, { fields: [commitments.participantId], references: [participants.id] }),
  createdBy: one(users, { fields: [commitments.createdBy], references: [users.id] }),
}));

export const shiftsRelations = relations(shifts, ({ many, one }) => ({
  assignments: many(shiftAssignments),
  caregiverBookings: many(caregiverBookings),
  createdBy: one(users, { fields: [shifts.createdBy], references: [users.id] }),
}));

export const shiftAssignmentsRelations = relations(shiftAssignments, ({ one }) => ({
  shift: one(shifts, { fields: [shiftAssignments.shiftId], references: [shifts.id] }),
  participant: one(participants, { fields: [shiftAssignments.participantId], references: [participants.id] }),
  assignedBy: one(users, { fields: [shiftAssignments.assignedByUserId], references: [users.id] }),
}));

export const caregiverRatesRelations = relations(caregiverRates, ({ one }) => ({
  caregiver: one(participants, {
    fields: [caregiverRates.caregiverParticipantId],
    references: [participants.id],
  }),
  createdBy: one(users, { fields: [caregiverRates.createdBy], references: [users.id] }),
}));

export const caregiverBookingsRelations = relations(caregiverBookings, ({ many, one }) => ({
  shift: one(shifts, { fields: [caregiverBookings.shiftId], references: [shifts.id] }),
  caregiver: one(participants, {
    fields: [caregiverBookings.caregiverParticipantId],
    references: [participants.id],
  }),
  createdBy: one(users, { fields: [caregiverBookings.createdBy], references: [users.id] }),
  payments: many(caregiverPayments),
  emergencyActivations: many(emergencyActivations),
}));

export const emergencyActivationsRelations = relations(emergencyActivations, ({ one }) => ({
  caregiverBooking: one(caregiverBookings, {
    fields: [emergencyActivations.caregiverBookingId],
    references: [caregiverBookings.id],
  }),
  participant: one(participants, {
    fields: [emergencyActivations.participantId],
    references: [participants.id],
  }),
  requestedBy: one(users, {
    fields: [emergencyActivations.requestedByUserId],
    references: [users.id],
    relationName: "emergencyActivationRequester",
  }),
  respondedBy: one(users, {
    fields: [emergencyActivations.respondedByUserId],
    references: [users.id],
    relationName: "emergencyActivationResponder",
  }),
}));

export const caregiverPaymentsRelations = relations(caregiverPayments, ({ one }) => ({
  booking: one(caregiverBookings, {
    fields: [caregiverPayments.caregiverBookingId],
    references: [caregiverBookings.id],
  }),
  createdBy: one(users, { fields: [caregiverPayments.createdBy], references: [users.id] }),
}));

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  actor: one(users, { fields: [auditEvents.actorUserId], references: [users.id] }),
}));
