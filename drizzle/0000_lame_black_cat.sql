CREATE TABLE `case_events` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`actor_role` text NOT NULL,
	`actor_label` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `case_events_case_id_idx` ON `case_events` (`case_id`);--> statement-breakpoint
CREATE INDEX `case_events_created_at_idx` ON `case_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`reporter_name` text NOT NULL,
	`title` text NOT NULL,
	`narrative_native` text NOT NULL,
	`narrative_english` text NOT NULL,
	`language_code` text NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`route` text NOT NULL,
	`district` text,
	`loss_amount` integer,
	`status` text NOT NULL,
	`urgency` text NOT NULL,
	`facts_json` text NOT NULL,
	`unknowns_json` text NOT NULL,
	`assigned_to` text,
	`synthetic` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cases_owner_email_idx` ON `cases` (`owner_email`);--> statement-breakpoint
CREATE INDEX `cases_status_idx` ON `cases` (`status`);--> statement-breakpoint
CREATE INDEX `cases_updated_at_idx` ON `cases` (`updated_at`);--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`sender_email` text NOT NULL,
	`sender_role` text NOT NULL,
	`language_code` text NOT NULL,
	`body` text NOT NULL,
	`synthetic` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `support_messages_case_id_idx` ON `support_messages` (`case_id`);--> statement-breakpoint
CREATE INDEX `support_messages_created_at_idx` ON `support_messages` (`created_at`);