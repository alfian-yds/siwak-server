CREATE TABLE `content_items` (
	`id` char(36) NOT NULL,
	`scope` enum('global','mosque') NOT NULL,
	`mosque_id` char(36),
	`type` enum('hadith','info_kas','info_jumat','info_agenda','info_hari_besar','image') NOT NULL,
	`category` varchar(40),
	`arabic_text` text,
	`translation` varchar(600),
	`source_ref` varchar(120),
	`grade_note` varchar(200),
	`body` json,
	`media_id` char(36),
	`status` enum('draft','published','submitted','verified','rejected') NOT NULL,
	`origin_item_id` char(36),
	`review_note` varchar(500),
	`reviewed_by` char(36),
	`reviewed_at` datetime(3),
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `content_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `ck_content_scope` CHECK((scope = 'global' AND mosque_id IS NULL AND status IN ('draft','submitted','verified','rejected')) OR (scope = 'mosque' AND mosque_id IS NOT NULL AND status IN ('draft','published')))
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` char(36) NOT NULL,
	`mosque_id` char(36),
	`kind` enum('image','audio') NOT NULL,
	`mime` varchar(60) NOT NULL,
	`bytes` int unsigned NOT NULL,
	`sha256` char(64) NOT NULL,
	`width` smallint unsigned,
	`height` smallint unsigned,
	`duration_ms` int unsigned,
	`original_name` varchar(200),
	`uploaded_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `slides` (
	`id` char(36) NOT NULL,
	`mosque_id` char(36) NOT NULL,
	`content_item_id` char(36) NOT NULL,
	`duration_sec` tinyint unsigned NOT NULL DEFAULT 20,
	`sort_order` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT true,
	`days_mask` tinyint unsigned NOT NULL DEFAULT 127,
	`time_from` time,
	`time_to` time,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `slides_id` PRIMARY KEY(`id`),
	CONSTRAINT `ck_slides_duration` CHECK(duration_sec BETWEEN 10 AND 60)
);
--> statement-breakpoint
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_mosque_id_mosques_id_fk` FOREIGN KEY (`mosque_id`) REFERENCES `mosques`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_media_id_media_id_fk` FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_origin_item_id_content_items_id_fk` FOREIGN KEY (`origin_item_id`) REFERENCES `content_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_items` ADD CONSTRAINT `content_items_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media` ADD CONSTRAINT `media_mosque_id_mosques_id_fk` FOREIGN KEY (`mosque_id`) REFERENCES `mosques`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `media` ADD CONSTRAINT `media_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `slides` ADD CONSTRAINT `slides_mosque_id_mosques_id_fk` FOREIGN KEY (`mosque_id`) REFERENCES `mosques`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `slides` ADD CONSTRAINT `slides_content_item_id_content_items_id_fk` FOREIGN KEY (`content_item_id`) REFERENCES `content_items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ix_content_scope_status` ON `content_items` (`scope`,`status`);--> statement-breakpoint
CREATE INDEX `ix_content_mosque_type` ON `content_items` (`mosque_id`,`type`);--> statement-breakpoint
CREATE INDEX `ix_media_sha` ON `media` (`sha256`);--> statement-breakpoint
CREATE INDEX `ix_media_mosque` ON `media` (`mosque_id`);--> statement-breakpoint
CREATE INDEX `ix_slides_mosque` ON `slides` (`mosque_id`,`sort_order`);