CREATE TABLE `caregiver_bookings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shiftId` int NOT NULL,
	`coverageStartsLocal` varchar(16) NOT NULL,
	`coverageEndsLocal` varchar(16) NOT NULL,
	`caregiverParticipantId` int NOT NULL,
	`status` enum('solicitada','disponível','indisponível','recusada','confirmada','cancelada','realizada') NOT NULL DEFAULT 'solicitada',
	`amountCents` int,
	`cancellationFeeCents` int,
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `caregiver_bookings_id` PRIMARY KEY(`id`),
	CONSTRAINT `caregiver_bookings_shift_caregiver_unique` UNIQUE(`shiftId`,`caregiverParticipantId`)
);
--> statement-breakpoint
CREATE TABLE `caregiver_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caregiverBookingId` int NOT NULL,
	`amountCents` int NOT NULL,
	`status` enum('pendente','pago','cancelado') NOT NULL DEFAULT 'pendente',
	`paidOn` varchar(10),
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `caregiver_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `caregiver_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caregiverParticipantId` int NOT NULL,
	`shiftType` enum('diurno','noturno') NOT NULL,
	`amountCents` int NOT NULL,
	`effectiveFrom` varchar(10) NOT NULL,
	`effectiveUntil` varchar(10),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `caregiver_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `caregiver_bookings` ADD CONSTRAINT `caregiver_bookings_shiftId_shifts_id_fk` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `caregiver_bookings` ADD CONSTRAINT `caregiver_bookings_caregiverParticipantId_participants_id_fk` FOREIGN KEY (`caregiverParticipantId`) REFERENCES `participants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `caregiver_bookings` ADD CONSTRAINT `caregiver_bookings_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `caregiver_payments` ADD CONSTRAINT `caregiver_payments_caregiverBookingId_caregiver_bookings_id_fk` FOREIGN KEY (`caregiverBookingId`) REFERENCES `caregiver_bookings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `caregiver_payments` ADD CONSTRAINT `caregiver_payments_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `caregiver_rates` ADD CONSTRAINT `caregiver_rates_caregiverParticipantId_participants_id_fk` FOREIGN KEY (`caregiverParticipantId`) REFERENCES `participants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `caregiver_rates` ADD CONSTRAINT `caregiver_rates_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `caregiver_bookings_shift_status_idx` ON `caregiver_bookings` (`shiftId`,`status`);--> statement-breakpoint
CREATE INDEX `caregiver_bookings_caregiver_status_idx` ON `caregiver_bookings` (`caregiverParticipantId`,`status`);--> statement-breakpoint
CREATE INDEX `caregiver_payments_booking_status_idx` ON `caregiver_payments` (`caregiverBookingId`,`status`);--> statement-breakpoint
CREATE INDEX `caregiver_payments_paid_on_idx` ON `caregiver_payments` (`paidOn`,`status`);--> statement-breakpoint
CREATE INDEX `caregiver_rates_caregiver_type_idx` ON `caregiver_rates` (`caregiverParticipantId`,`shiftType`);--> statement-breakpoint
CREATE INDEX `caregiver_rates_effective_idx` ON `caregiver_rates` (`shiftType`,`effectiveFrom`);