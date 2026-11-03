export const SEED_CASE_IDS = [
  "CYS-DEMO-26082200000001",
  "CYS-DEMO-26082200000002",
  "CYS-DEMO-26082100000003",
  "CYS-DEMO-26082400000004",
  "CYS-DEMO-26082400000005",
  "CYS-DEMO-26082400000006",
];

export function expiredSyntheticCaseIds(
  rows: Array<{ id: string; synthetic: boolean; createdAt: string }>,
  now = new Date(),
  retentionDays = 30,
): string[] {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  return rows
    .filter((row) => row.synthetic && row.createdAt < cutoff && !SEED_CASE_IDS.includes(row.id))
    .map((row) => row.id);
}
