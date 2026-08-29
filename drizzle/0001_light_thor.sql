ALTER TABLE `cases` ADD `dedupe_fingerprint` text;--> statement-breakpoint
CREATE UNIQUE INDEX `cases_owner_dedupe_idx` ON `cases` (`owner_email`,`dedupe_fingerprint`);