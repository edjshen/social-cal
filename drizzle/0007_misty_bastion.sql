CREATE TABLE `event_orbits` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`orbit_id` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`orbit_id`) REFERENCES `orbits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_orbits_orbit` ON `event_orbits` (`orbit_id`);--> statement-breakpoint
CREATE INDEX `event_orbits_event` ON `event_orbits` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `event_orbit_uniq` ON `event_orbits` (`event_id`,`orbit_id`);--> statement-breakpoint
CREATE TABLE `orbit_members` (
	`id` text PRIMARY KEY NOT NULL,
	`orbit_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`orbit_id`) REFERENCES `orbits`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orbit_members_user` ON `orbit_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orbit_member_uniq` ON `orbit_members` (`orbit_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `orbits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `orbits_owner` ON `orbits` (`owner_id`);