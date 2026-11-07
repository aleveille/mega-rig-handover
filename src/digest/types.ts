// Morning digest types (plan.md § 1). Types only, no logic: the reader will live in
// src/digest/read.ts as `export const readNight: ReadNight`. Page, JSON route, board link and
// tests build against these.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, once parsed.
export type LogLine = {
  at: string; // ISO 8601, offset as written in the log
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// Number of log lines per status.
export type StatusCounts = Record<RunStatus, number>;

// One row per job. "First" and "last" mean file order, not sorted by `at`.
export type DigestRow = {
  job: string;
  owner: string | null; // owner on the job's last line; null is kept, views show `—`
  runs: number; // log lines for this job: counts.ok + counts.retry + counts.fail
  retries: number; // same as counts.retry
  counts: StatusCounts; // the board sums these for a night's ok / retry / fail
  lastStatus: RunStatus;
  lastError: string | null; // most recent `error` among the job's lines, null if none had one
  firstAt: string; // `at` exactly as in the log, offset kept, never converted to UTC
  lastAt: string; // same
};

// A night that has a file. An empty file gives `rows: []`: the page renders "nothing ran".
export type NightDigest = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by `job`, plain string order (no locale), so page and JSON agree
  badLines: number; // non-blank lines that aren't JSON or lack a string at/job and a valid status
};

// Reads <runsDir>/<night>.jsonl. Returns null when there is no file for that night (the page
// returns 404), and for a `night` that isn't YYYY-MM-DD, so it never builds a path outside
// runsDir. Bad lines are counted in `badLines`, never thrown.
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
