CREATE TABLE `pregen_tasks` (
	`volume` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'idle' NOT NULL,
	`radius` integer DEFAULT 0 NOT NULL,
	`center_x` integer DEFAULT 0 NOT NULL,
	`center_z` integer DEFAULT 0 NOT NULL,
	`processed_chunks` integer DEFAULT 0 NOT NULL,
	`total_chunks` integer,
	`percent` real DEFAULT 0 NOT NULL,
	`rate` real,
	`eta_seconds` integer,
	`current_x` integer,
	`current_z` integer,
	`started_at` integer,
	`updated_at` integer NOT NULL,
	`completed_at` integer
);
