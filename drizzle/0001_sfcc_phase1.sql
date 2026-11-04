CREATE TABLE `audit_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorUserId` int NOT NULL,
	`action` varchar(64) NOT NULL,
	`entityType` varchar(48) NOT NULL,
	`entityId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `availability_windows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`participantId` int NOT NULL,
	`status` enum('available','unavailable') NOT NULL,
	`recurrence` enum('once','weekly') NOT NULL DEFAULT 'once',
	`startsLocal` varchar(16) NOT NULL,
	`endsLocal` varchar(16) NOT NULL,
	`repeatDays` varchar(20),
	`repeatUntil` varchar(10),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `availability_windows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`participantId` int NOT NULL,
	`description` varchar(160) NOT NULL,
	`recurrence` enum('once','weekly') NOT NULL DEFAULT 'once',
	`startsLocal` varchar(16) NOT NULL,
	`endsLocal` varchar(16) NOT NULL,
	`repeatDays` varchar(20),
	`repeatUntil` varchar(10),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commitments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`category` enum('familiar','cuidadora','outros') NOT NULL,
	`contact` varchar(255),
	`active` boolean NOT NULL DEFAULT true,
	`emergencyEligible` boolean NOT NULL DEFAULT false,
	`dayAuthorization` enum('unknown','authorized','denied') NOT NULL DEFAULT 'unknown',
	`nightAuthorization` enum('unknown','authorized','denied') NOT NULL DEFAULT 'unknown',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `participants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shift_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shiftId` int NOT NULL,
	`participantId` int NOT NULL,
	`confirmationStatus` enum('pending','accepted','declined','cancelled') NOT NULL DEFAULT 'pending',
	`assignedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shift_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`startsLocal` varchar(16) NOT NULL,
	`endsLocal` varchar(16) NOT NULL,
	`classification` enum('diurno','noturno','misto') NOT NULL,
	`status` enum('scheduled','cancelled') NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `audit_events` ADD CONSTRAINT `audit_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availability_windows` ADD CONSTRAINT `availability_windows_participantId_participants_id_fk` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `availability_windows` ADD CONSTRAINT `availability_windows_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_participantId_participants_id_fk` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `commitments` ADD CONSTRAINT `commitments_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_shiftId_shifts_id_fk` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_participantId_participants_id_fk` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_assignedByUserId_users_id_fk` FOREIGN KEY (`assignedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_entity_idx` ON `audit_events` (`entityType`,`entityId`);--> statement-breakpoint
CREATE INDEX `availability_participant_idx` ON `availability_windows` (`participantId`);--> statement-breakpoint
CREATE INDEX `commitments_participant_idx` ON `commitments` (`participantId`);--> statement-breakpoint
CREATE INDEX `shift_assignments_shift_idx` ON `shift_assignments` (`shiftId`);--> statement-breakpoint
CREATE INDEX `shift_assignments_participant_idx` ON `shift_assignments` (`participantId`);--> statement-breakpoint
CREATE INDEX `shifts_range_idx` ON `shifts` (`startsLocal`,`status`);