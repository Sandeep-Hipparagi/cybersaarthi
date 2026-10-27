#!/usr/bin/env node
/**
 * Schema and migration integrity check.
 *
 * Verifies three invariants without needing a database:
 *   1. every migration listed in drizzle/meta/_journal.json exists on disk;
 *   2. every .sql file in drizzle/ has a journal entry (no orphan migrations);
 *   3. every sqliteTable declared in db/schema.ts is created by some migration.
 *
 * Exits non-zero with a specific message on the first violated invariant.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const fail = (message) => {
  console.error(`schema check failed: ${message}`);
  process.exit(1);
};

let journal;
try {
  journal = JSON.parse(readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8"));
} catch (error) {
  fail(`cannot read drizzle/meta/_journal.json (${error.message})`);
}

const entries = Array.isArray(journal.entries) ? journal.entries : [];
if (entries.length === 0) fail("journal lists no migrations");

const sqlFiles = readdirSync(join(root, "drizzle"))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const expected = entries.map((entry) => `${entry.tag}.sql`);
const missing = expected.filter((name) => !sqlFiles.includes(name));
if (missing.length > 0) fail(`journaled but missing on disk: ${missing.join(", ")}`);

const journaled = new Set(expected);
const orphans = sqlFiles.filter((name) => !journaled.has(name));
if (orphans.length > 0) fail(`migration file with no journal entry: ${orphans.join(", ")}`);

let schema;
try {
  schema = readFileSync(join(root, "db/schema.ts"), "utf8");
} catch (error) {
  fail(`cannot read db/schema.ts (${error.message})`);
}

const tables = [...schema.matchAll(/sqliteTable\(\s*"([a-z0-9_]+)"/g)].map((match) => match[1]);
if (tables.length === 0) fail("no sqliteTable declarations found in db/schema.ts");

const allSql = sqlFiles
  .map((name) => readFileSync(join(root, "drizzle", name), "utf8"))
  .join("\n")
  .toLowerCase();

const normalise = (value) => value.replace(/[`"]/g, "").replace(/\s+/g, " ");
const flatSql = normalise(allSql);

const uncovered = tables.filter(
  (table) => !flatSql.includes(`create table ${table}`) && !flatSql.includes(`create table if not exists ${table}`),
);
if (uncovered.length > 0) fail(`declared in schema.ts but never created by a migration: ${uncovered.join(", ")}`);

const statements = allSql.split(";").filter((part) => part.trim().length > 0).length;
console.log(
  `schema ok: ${tables.length} tables, ${sqlFiles.length} migrations, ~${statements} SQL statements`,
);
console.log(`tables: ${tables.join(", ")}`);
