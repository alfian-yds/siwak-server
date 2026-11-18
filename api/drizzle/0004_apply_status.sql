ALTER TABLE `device_commands` MODIFY COLUMN `type` enum('open_app','sync_now','restart_app','show_mutiara') NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `config_applied_at` datetime(3);--> statement-breakpoint
ALTER TABLE `devices` ADD `last_error` varchar(300);--> statement-breakpoint
ALTER TABLE `devices` ADD `last_error_at` datetime(3);