// Run log reader (plan.md § 1): <runsDir>/<night>.jsonl -> one row per job. Rules live in the
// comments of ./types.ts; this file only follows them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, LogLine, ReadNight, RunStatus } from './types.js';

// Anchored, ASCII digits only: nothing else ever reaches the path.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRunStatus = (value: unknown): value is RunStatus =>
  value === 'ok' || value === 'retry' || value === 'fail';

// One non-blank line, parsed at the edge. null means a bad line.
const parseLine = (raw: string): LogLine | null => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || typeof job !== 'string' || !isRunStatus(status)) return null;
  const line: LogLine = { at, job, status, owner: typeof owner === 'string' ? owner : null };
  if (typeof error === 'string') line.error = error;
  return line;
};

// File contents, or null when there is no file for that night.
const readLog = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (isRecord(err) && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
};

const byJob = (a: DigestRow, b: DigestRow): number => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0);

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readLog(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;

  // A leading BOM would otherwise make the first line unparseable.
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }

    let row = rows.get(line.job);
    if (row === undefined) {
      row = {
        job: line.job,
        owner: line.owner,
        runs: 0,
        retries: 0,
        counts: { ok: 0, retry: 0, fail: 0 },
        lastStatus: line.status,
        lastError: null,
        firstAt: line.at,
        lastAt: line.at,
      };
      rows.set(line.job, row);
    }

    // File order: every later line overwrites the "last" fields.
    row.counts[line.status] += 1;
    row.runs += 1;
    row.retries = row.counts.retry;
    row.owner = line.owner;
    row.lastStatus = line.status;
    row.lastAt = line.at;
    if (line.error !== undefined) row.lastError = line.error;
  }

  return { night, rows: [...rows.values()].sort(byJob), badLines };
};
