CREATE TABLE `case_graph_identifiers` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`identifier_type` text NOT NULL,
	`fingerprint` text NOT NULL,
	`display_label` text NOT NULL,
	`source_field_id` text NOT NULL,
	`source_label` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_graph_identifier_unique_idx` ON `case_graph_identifiers` (`case_id`,`identifier_type`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `case_graph_identifier_case_idx` ON `case_graph_identifiers` (`case_id`);--> statement-breakpoint
CREATE INDEX `case_graph_identifier_fingerprint_idx` ON `case_graph_identifiers` (`identifier_type`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `case_pattern_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`pattern_code` text NOT NULL,
	`label` text NOT NULL,
	`confidence_bps` integer NOT NULL,
	`status` text DEFAULT 'PROPOSED' NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`explanation` text NOT NULL,
	`engine_version` integer NOT NULL,
	`reviewed_at` text,
	`reviewer_label` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_pattern_unique_idx` ON `case_pattern_matches` (`case_id`,`pattern_code`);--> statement-breakpoint
CREATE INDEX `case_pattern_case_idx` ON `case_pattern_matches` (`case_id`);--> statement-breakpoint
CREATE INDEX `case_pattern_code_idx` ON `case_pattern_matches` (`pattern_code`);--> statement-breakpoint
CREATE TABLE `case_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`source_case_id` text NOT NULL,
	`target_case_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`confidence_bps` integer NOT NULL,
	`status` text DEFAULT 'PROPOSED' NOT NULL,
	`deterministic` integer DEFAULT true NOT NULL,
	`evidence_json` text DEFAULT '[]' NOT NULL,
	`explanation` text NOT NULL,
	`engine_version` integer NOT NULL,
	`reviewed_at` text,
	`reviewer_label` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_relationship_unique_idx` ON `case_relationships` (`source_case_id`,`target_case_id`,`relationship_type`);--> statement-breakpoint
CREATE INDEX `case_relationship_source_idx` ON `case_relationships` (`source_case_id`);--> statement-breakpoint
CREATE INDEX `case_relationship_target_idx` ON `case_relationships` (`target_case_id`);--> statement-breakpoint
CREATE INDEX `case_relationship_status_idx` ON `case_relationships` (`status`);--> statement-breakpoint
ALTER TABLE `cases` ADD `intelligence_version` integer DEFAULT 0 NOT NULL;