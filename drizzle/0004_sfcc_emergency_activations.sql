CREATE TABLE IF NOT EXISTS `emergency_activations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`caregiverBookingId` int NOT NULL,
	`participantId` int NOT NULL,
	`startsLocal` varchar(16) NOT NULL,
	`endsLocal` varchar(16) NOT NULL,
	`status` enum('solicitada','aceita','recusada','cancelada') NOT NULL DEFAULT 'solicitada',
	`restExceptionRequested` boolean NOT NULL DEFAULT false,
	`restExceptionAccepted` boolean NOT NULL DEFAULT false,
	`restExceptionJustification` varchar(500),
	`requestedByUserId` int NOT NULL,
	`respondedByUserId` int,
	`respondedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `emergency_activations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `emergency_activations` ADD CONSTRAINT `sfcc_emergency_booking_fk` FOREIGN KEY (`caregiverBookingId`) REFERENCES `caregiver_bookings`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emergency_activations` ADD CONSTRAINT `sfcc_emergency_participant_fk` FOREIGN KEY (`participantId`) REFERENCES `participants`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emergency_activations` ADD CONSTRAINT `sfcc_emergency_requester_fk` FOREIGN KEY (`requestedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `emergency_activations` ADD CONSTRAINT `sfcc_emergency_responder_fk` FOREIGN KEY (`respondedByUserId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `emergency_participant_status_idx` ON `emergency_activations` (`participantId`,`status`);--> statement-breakpoint
CREATE INDEX `emergency_interval_status_idx` ON `emergency_activations` (`startsLocal`,`status`);--> statement-breakpoint
CREATE INDEX `emergency_booking_idx` ON `emergency_activations` (`caregiverBookingId`);
