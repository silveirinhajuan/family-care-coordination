ALTER TABLE `participants` ADD `linkedUserId` int;--> statement-breakpoint
ALTER TABLE `participants` ADD `relationshipToCareRecipient` varchar(120);--> statement-breakpoint
ALTER TABLE `participants` ADD CONSTRAINT `participants_linked_user_unique` UNIQUE(`linkedUserId`);--> statement-breakpoint
ALTER TABLE `participants` ADD CONSTRAINT `participants_linkedUserId_users_id_fk` FOREIGN KEY (`linkedUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;