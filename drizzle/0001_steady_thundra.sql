CREATE TABLE `mayfly_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`phone` text NOT NULL,
	`consent_version` text NOT NULL,
	`context` text NOT NULL,
	`room_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mayfly_consents_phone` ON `mayfly_consents` (`phone`);--> statement-breakpoint
CREATE INDEX `mayfly_consents_created` ON `mayfly_consents` (`created_at`);--> statement-breakpoint
CREATE TABLE `mayfly_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`profile_pub` text NOT NULL,
	`handle` text,
	`phone` text,
	`joined_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mayfly_part_room` ON `mayfly_participants` (`room_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mayfly_part_room_pub` ON `mayfly_participants` (`room_id`,`profile_pub`);--> statement-breakpoint
CREATE TABLE `mayfly_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`k` text NOT NULL,
	`hits` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mayfly_rl_scope_k` ON `mayfly_rate_limits` (`scope`,`k`);--> statement-breakpoint
CREATE TABLE `mayfly_rooms` (
	`room_id` text PRIMARY KEY NOT NULL,
	`three_words` text,
	`mode` text DEFAULT 'sealed' NOT NULL,
	`source` text NOT NULL,
	`event_slug` text,
	`creator_phone` text,
	`created_at` text NOT NULL,
	`expires_at` text
);
--> statement-breakpoint
CREATE INDEX `mayfly_rooms_event` ON `mayfly_rooms` (`event_slug`);--> statement-breakpoint
CREATE INDEX `mayfly_rooms_created` ON `mayfly_rooms` (`created_at`);