CREATE TABLE `server_access` (
	`user_id` integer NOT NULL,
	`volume` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`user_id`, `volume`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `server_access_volume_idx` ON `server_access` (`volume`);