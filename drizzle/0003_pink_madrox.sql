CREATE TABLE `case_evidence_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`evidence_id` text NOT NULL,
	`source_image_id` text NOT NULL,
	`media_type` text NOT NULL,
	`storage_path` text NOT NULL,
	`checksum` text NOT NULL,
	`synthetic` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_evidence_source_idx` ON `case_evidence_metadata` (`case_id`,`evidence_id`,`source_image_id`);--> statement-breakpoint
CREATE INDEX `case_evidence_case_idx` ON `case_evidence_metadata` (`case_id`);--> statement-breakpoint
CREATE INDEX `case_evidence_id_idx` ON `case_evidence_metadata` (`evidence_id`);--> statement-breakpoint
CREATE INDEX `case_evidence_checksum_idx` ON `case_evidence_metadata` (`checksum`);--> statement-breakpoint
CREATE TABLE `case_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`utr_number` text NOT NULL,
	`transaction_id` text,
	`origin_institution` text,
	`origin_account_masked` text,
	`destination_wallet` text,
	`occurred_at` text,
	`amount` integer,
	`synthetic` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_transaction_case_utr_idx` ON `case_transactions` (`case_id`,`utr_number`);--> statement-breakpoint
CREATE INDEX `case_transaction_utr_idx` ON `case_transactions` (`utr_number`);--> statement-breakpoint
CREATE INDEX `case_transaction_id_idx` ON `case_transactions` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `case_transaction_case_idx` ON `case_transactions` (`case_id`);--> statement-breakpoint
CREATE INDEX `case_transaction_occurred_idx` ON `case_transactions` (`occurred_at`);