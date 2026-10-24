CREATE TABLE `whitelist_claims` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`volume` text NOT NULL,
	`claim_key` text NOT NULL,
	`player_name` text NOT NULL,
	`player_key` text NOT NULL,
	`player_uuid` text,
	`token_id` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whitelist_claims_volume_key_idx` ON `whitelist_claims` (`volume`,`claim_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `whitelist_claims_volume_player_idx` ON `whitelist_claims` (`volume`,`player_key`);