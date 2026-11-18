CREATE TABLE `activity_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` char(36),
	`mosque_id` char(36),
	`action` varchar(60) NOT NULL,
	`entity` varchar(40),
	`entity_id` varchar(64),
	`diff` json,
	`ip` varchar(45),
	`at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `app_state` (
	`id` tinyint unsigned NOT NULL,
	`content_version` int unsigned NOT NULL DEFAULT 1,
	CONSTRAINT `app_state_id` PRIMARY KEY(`id`),
	CONSTRAINT `ck_app_state_single` CHECK(id = 1)
);
--> statement-breakpoint
CREATE TABLE `device_events` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`device_id` char(36) NOT NULL,
	`type` enum('paired','online','offline','clock_drift','error','updated','unpaired') NOT NULL,
	`detail` json,
	`at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `device_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` char(36) NOT NULL,
	`mosque_id` char(36) NOT NULL,
	`name` varchar(60) NOT NULL,
	`token_hash` char(64),
	`pin_ciphertext` varchar(128) NOT NULL,
	`pin_salt` char(32) NOT NULL,
	`pin_hash` char(64) NOT NULL,
	`pin_updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`app_version` varchar(20),
	`model` varchar(80),
	`last_seen_at` datetime(3),
	`last_config_version` int unsigned,
	`last_content_version` int unsigned,
	`clock_drift_sec` int,
	`is_online` boolean NOT NULL DEFAULT false,
	`paired_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`paired_by` char(36),
	`revoked_at` datetime(3),
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_devices_token` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`user_id` char(36) NOT NULL,
	`mosque_id` char(36) NOT NULL,
	`role` enum('admin','operator') NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `memberships_user_id_mosque_id_pk` PRIMARY KEY(`user_id`,`mosque_id`)
);
--> statement-breakpoint
CREATE TABLE `mosque_settings` (
	`mosque_id` char(36) NOT NULL,
	`schema_version` smallint unsigned NOT NULL DEFAULT 1,
	`data` json NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_by` char(36),
	CONSTRAINT `mosque_settings_mosque_id` PRIMARY KEY(`mosque_id`)
);
--> statement-breakpoint
CREATE TABLE `mosques` (
	`id` char(36) NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`region_label` varchar(120),
	`latitude` decimal(9,6) NOT NULL,
	`longitude` decimal(9,6) NOT NULL,
	`timezone` varchar(40) NOT NULL DEFAULT 'Asia/Jakarta',
	`config_version` int unsigned NOT NULL DEFAULT 1,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`archived_at` datetime(3),
	CONSTRAINT `mosques_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_mosques_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `pairing_codes` (
	`id` char(36) NOT NULL,
	`code` char(8) NOT NULL,
	`nonce_hash` char(64) NOT NULL,
	`app_version` varchar(20),
	`model` varchar(80),
	`expires_at` datetime(3) NOT NULL,
	`claimed_at` datetime(3),
	`claimed_by` char(36),
	`device_id` char(36),
	`token_delivered_at` datetime(3),
	`created_ip` varchar(45),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`active_code` char(8),
	CONSTRAINT `pairing_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_pairing_active_code` UNIQUE(`active_code`)
);
--> statement-breakpoint
CREATE TABLE `running_texts` (
	`id` char(36) NOT NULL,
	`mosque_id` char(36) NOT NULL,
	`text` varchar(300) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT true,
	`starts_on` date,
	`ends_on` date,
	`updated_by` char(36),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `running_texts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(43) NOT NULL,
	`user_id` char(36) NOT NULL,
	`csrf_token` char(43) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_seen_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3) NOT NULL,
	`user_agent` varchar(300),
	`ip` varchar(45),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`email` varchar(254) NOT NULL,
	`google_sub` varchar(64),
	`name` varchar(120),
	`avatar_url` varchar(500),
	`is_super_admin` boolean NOT NULL DEFAULT false,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`last_login_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`created_by` char(36),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_email` UNIQUE(`email`),
	CONSTRAINT `uq_users_google_sub` UNIQUE(`google_sub`)
);
--> statement-breakpoint
CREATE TABLE `weather_cache` (
	`cell_key` varchar(24) NOT NULL,
	`payload` json NOT NULL,
	`fetched_at` datetime(3) NOT NULL,
	`last_requested_at` datetime(3) NOT NULL,
	CONSTRAINT `weather_cache_cell_key` PRIMARY KEY(`cell_key`)
);
--> statement-breakpoint
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_logs` ADD CONSTRAINT `activity_logs_mosque_id_mosques_id_fk` FOREIGN KEY (`mosque_id`) REFERENCES `mosques`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `device_events` ADD CONSTRAINT `device_events_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `devices` ADD CONSTRAINT `devices_mosque_id_mosques_id_fk` FOREIGN KEY (`mosque_id`) REFERENCES `mosques`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `devices` ADD CONSTRAINT `devices_paired_by_users_id_fk` FOREIGN KEY (`paired_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_mosque_id_mosques_id_fk` FOREIGN KEY (`mosque_id`) REFERENCES `mosques`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mosque_settings` ADD CONSTRAINT `mosque_settings_mosque_id_mosques_id_fk` FOREIGN KEY (`mosque_id`) REFERENCES `mosques`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `mosque_settings` ADD CONSTRAINT `mosque_settings_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pairing_codes` ADD CONSTRAINT `pairing_codes_claimed_by_users_id_fk` FOREIGN KEY (`claimed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pairing_codes` ADD CONSTRAINT `pairing_codes_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `running_texts` ADD CONSTRAINT `running_texts_mosque_id_mosques_id_fk` FOREIGN KEY (`mosque_id`) REFERENCES `mosques`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `running_texts` ADD CONSTRAINT `running_texts_updated_by_users_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_activity_mosque` ON `activity_logs` (`mosque_id`,`at`);--> statement-breakpoint
CREATE INDEX `ix_device_events` ON `device_events` (`device_id`,`at`);--> statement-breakpoint
CREATE INDEX `ix_devices_mosque` ON `devices` (`mosque_id`);--> statement-breakpoint
CREATE INDEX `ix_devices_seen` ON `devices` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `ix_pairing_expires` ON `pairing_codes` (`expires_at`);--> statement-breakpoint
CREATE INDEX `ix_rt_mosque` ON `running_texts` (`mosque_id`,`sort_order`);--> statement-breakpoint
CREATE INDEX `ix_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `ix_sessions_expires` ON `sessions` (`expires_at`);