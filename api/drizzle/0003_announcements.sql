CREATE TABLE `announcements` (
	`id` char(36) NOT NULL,
	`mosque_id` char(36) NOT NULL,
	`device_id` char(36),
	`text` varchar(200) NOT NULL,
	`starts_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`),
	CONSTRAINT `ck_ann_window` CHECK(expires_at > starts_at)
);
--> statement-breakpoint
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_mosque_id_mosques_id_fk` FOREIGN KEY (`mosque_id`) REFERENCES `mosques`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_ann_mosque` ON `announcements` (`mosque_id`,`expires_at`);