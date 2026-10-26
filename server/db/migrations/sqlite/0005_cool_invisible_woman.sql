CREATE TABLE `backup_schedules` (
	`volume` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`interval_hours` integer DEFAULT 24 NOT NULL,
	`at_time` text DEFAULT '04:00' NOT NULL,
	`time_zone` text DEFAULT 'UTC' NOT NULL,
	`keep` integer DEFAULT 7 NOT NULL,
	`only_if_played` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	`last_run_at` integer,
	`last_result` text,
	`last_error` text
);
--> statement-breakpoint
ALTER TABLE `backups` ADD `engine` text DEFAULT 'tar' NOT NULL;--> statement-breakpoint
ALTER TABLE `backups` ADD `automatic` integer DEFAULT false NOT NULL;