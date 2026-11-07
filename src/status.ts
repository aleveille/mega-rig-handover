import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import type { StatusCounts } from './digest/types.js';
import { readNight } from './digest/read.js';
import { lastBeat, type Beat } from './heartbeat.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// counts is null when the night has no readable digest (the board shows `—`, no link).
export type NightSummary = { night: string; counts: StatusCounts | null };

export function summarizeNight(runsDir: string, night: string): NightSummary {
  const digest = readNight(runsDir, night);
  if (!digest) return { night, counts: null };
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const row of digest.rows) {
    counts.ok += row.counts.ok;
    counts.retry += row.counts.retry;
    counts.fail += row.counts.fail;
  }
  return { night, counts };
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summarizeNight(config.runsDir, n)),
  };
}
