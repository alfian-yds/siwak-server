CREATE TABLE `device_commands` (
	`id` char(36) NOT NULL,
	`device_id` char(36) NOT NULL,
	`type` enum('open_app','sync_now','restart_app') NOT NULL,
	`status` enum('pending','delivered','done','failed','expired') NOT NULL DEFAULT 'pending',
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`delivered_at` datetime(3),
	`finished_at` datetime(3),
	`result` varchar(200),
	CONSTRAINT `device_commands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `device_events` MODIFY COLUMN `type` enum('paired','online','offline','clock_drift','error','updated','unpaired','app_foreground','app_background','command') NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `app_foreground` boolean;--> statement-breakpoint
ALTER TABLE `devices` ADD `app_state_since` datetime(3);--> statement-breakpoint
ALTER TABLE `devices` ADD `can_open_app` boolean;--> statement-breakpoint
ALTER TABLE `device_commands` ADD CONSTRAINT `device_commands_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_commands` ADD CONSTRAINT `device_commands_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_cmd_device` ON `device_commands` (`device_id`,`status`);--> statement-breakpoint
CREATE INDEX `ix_cmd_created` ON `device_commands` (`created_at`);