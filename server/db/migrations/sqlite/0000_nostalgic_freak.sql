CREATE TABLE `activity_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volume` text NOT NULL,
	`t` integer NOT NULL,
	`action` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `activity_events_volume_t_idx` ON `activity_events` (`volume`,`t`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volume` text NOT NULL,
	`filename` text NOT NULL,
	`size_bytes` integer,
	`created_at` integer NOT NULL,
	`label` text,
	`state` text DEFAULT 'done' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backups_filename_unique` ON `backups` (`filename`);--> statement-breakpoint
CREATE INDEX `backups_volume_idx` ON `backups` (`volume`);--> statement-breakpoint
CREATE TABLE `domains` (
	`domain` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stats_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volume` text NOT NULL,
	`t` integer NOT NULL,
	`cpu` real,
	`mem_used` integer,
	`mem_limit` integer,
	`net_rx` integer,
	`net_tx` integer,
	`players` integer,
	`max_players` integer,
	`latency` integer
);
--> statement-breakpoint
CREATE INDEX `stats_samples_volume_t_idx` ON `stats_samples` (`volume`,`t`);