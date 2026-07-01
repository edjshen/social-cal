CREATE TABLE `check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`org_id` text NOT NULL,
	`global_awarded` integer DEFAULT 0 NOT NULL,
	`org_awarded` integer DEFAULT 0 NOT NULL,
	`bonus_breakdown` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `reward_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `check_ins_user_event` ON `check_ins` (`user_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `global_reward_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`base_points` integer DEFAULT 100 NOT NULL,
	`bonuses` text DEFAULT '{}' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `org_follows` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`org_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `org_follows_user_org` ON `org_follows` (`user_id`,`org_id`);--> statement-breakpoint
CREATE TABLE `org_perks` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`point_cost` integer NOT NULL,
	`min_tier` text,
	`total_inventory` integer,
	`per_user_limit` integer,
	`active` integer DEFAULT true NOT NULL,
	`valid_from` text,
	`valid_to` text,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `org_perks_org` ON `org_perks` (`org_id`);--> statement-breakpoint
CREATE TABLE `org_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`min_points` integer NOT NULL,
	`sort` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `org_tiers_org` ON `org_tiers` (`org_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`avatar` text,
	`bio` text DEFAULT '' NOT NULL,
	`poisys_org_ref` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `platform_perks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`point_cost` integer NOT NULL,
	`fulfillment` text DEFAULT 'auto-digital' NOT NULL,
	`source` text DEFAULT 'first-party' NOT NULL,
	`sponsor_id` text,
	`placement` integer DEFAULT 0 NOT NULL,
	`segment` text DEFAULT '{}' NOT NULL,
	`total_inventory` integer,
	`per_user_limit` integer,
	`active` integer DEFAULT true NOT NULL,
	`valid_from` text,
	`valid_to` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_perks_active` ON `platform_perks` (`active`,`valid_to`);--> statement-breakpoint
CREATE INDEX `platform_perks_source` ON `platform_perks` (`source`,`placement`);--> statement-breakpoint
CREATE TABLE `points_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`delta` integer NOT NULL,
	`kind` text NOT NULL,
	`reason` text NOT NULL,
	`source_ref` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `points_ledger_user_scope` ON `points_ledger` (`user_id`,`scope`);--> statement-breakpoint
CREATE TABLE `redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`perk_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`status` text DEFAULT 'issued' NOT NULL,
	`fulfillment` text,
	`issued_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`redeemed_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `redemptions_user` ON `redemptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `redemptions_code` ON `redemptions` (`code_hash`);--> statement-breakpoint
CREATE TABLE `reward_event_secrets` (
	`event_id` text PRIMARY KEY NOT NULL,
	`rotating_secret` text NOT NULL,
	`step_seconds` integer DEFAULT 30 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `reward_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reward_events` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`title` text NOT NULL,
	`venue_area` text DEFAULT '' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`checkin_opens_at` text,
	`checkin_closes_at` text,
	`org_base_points` integer DEFAULT 0 NOT NULL,
	`org_bonuses` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reward_events_org_start` ON `reward_events` (`org_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `reward_rsvps` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`event_id`) REFERENCES `reward_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reward_rsvps_user_event` ON `reward_rsvps` (`user_id`,`event_id`);