import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const runsDir = fileURLToPath(new URL('../runs', import.meta.url));

describe('readNight on runs/ (read-only fixtures)', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line, sorted by job', () => {
    const digest = readNight(runsDir, '2026-10-28');
    expect(digest).not.toBeNull();
    expect(digest?.night).toBe('2026-10-28');
    expect(digest?.badLines).toBe(1);
    expect(digest?.rows).toEqual([
      {
        job: 'digest/render',
        owner: null,
        runs: 1,
        retries: 0,
        counts: { ok: 1, retry: 0, fail: 0 },
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00',
        lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh',
        owner: 'rook',
        runs: 4,
        retries: 3,
        counts: { ok: 1, retry: 3, fail: 0 },
        lastStatus: 'ok',
        lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00',
        lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync',
        owner: 'rook',
        runs: 8,
        retries: 1,
        counts: { ok: 7, retry: 1, fail: 0 },
        lastStatus: 'ok',
        lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00',
        lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        counts: { ok: 0, retry: 0, fail: 1 },
        lastStatus: 'fail',
        lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00',
        lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs',
        owner: 'lane-07',
        runs: 1,
        retries: 0,
        counts: { ok: 1, retry: 0, fail: 0 },
        lastStatus: 'ok',
        lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00',
        lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });

  it('reads 2026-10-27: 4 jobs, no bad lines', () => {
    const digest = readNight(runsDir, '2026-10-27');
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows.map((r) => [r.job, r.runs])).toEqual([
      ['fixtures/refresh', 1],
      ['lane/sync', 4],
      ['notes/backup', 1],
      ['rig/rotate-logs', 1],
    ]);
  });
});

describe('readNight on a temp runs dir', () => {
  let dir: string;
  const writeNight = (night: string, lines: string[]) =>
    writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n'));
  const line = (fields: Record<string, unknown>) => JSON.stringify(fields);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-digest-read-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a night with no file', () => {
    expect(readNight(dir, '2026-10-30')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD, even when a matching file exists', () => {
    const runs = join(dir, 'runs');
    mkdirSync(runs);
    writeFileSync(join(dir, '2026-10-28.jsonl'), line({ at: 'x', job: 'outside', status: 'ok', owner: null }));
    writeFileSync(join(runs, 'latest.jsonl'), line({ at: 'x', job: 'j', status: 'ok', owner: null }));

    for (const night of ['../2026-10-28', 'latest', '2026-10-28.jsonl', '2026-1-28', '20261028', '', '2026-10-28\n', '２０２６-10-28']) {
      expect(readNight(runs, night)).toBeNull();
    }
  });

  it('returns no rows for an empty file, and for blank lines only', () => {
    writeNight('2026-10-30', []);
    expect(readNight(dir, '2026-10-30')).toEqual({ night: '2026-10-30', rows: [], badLines: 0 });
    writeNight('2026-10-31', ['', '   ', '\t', '']);
    expect(readNight(dir, '2026-10-31')).toEqual({ night: '2026-10-31', rows: [], badLines: 0 });
  });

  it('keeps a null owner, takes owner from the last line, and treats a non-string owner as null', () => {
    writeNight('2026-10-30', [
      line({ at: 't1', job: 'a', status: 'ok', owner: null }),
      line({ at: 't1', job: 'b', status: 'ok', owner: 'rook' }),
      line({ at: 't2', job: 'b', status: 'ok', owner: null }),
      line({ at: 't1', job: 'c', status: 'ok', owner: null }),
      line({ at: 't2', job: 'c', status: 'ok', owner: 'lane-07' }),
      line({ at: 't1', job: 'd', status: 'ok', owner: 7 }),
      line({ at: 't1', job: 'e', status: 'ok' }),
    ]);
    const digest = readNight(dir, '2026-10-30');
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows.map((r) => [r.job, r.owner])).toEqual([
      ['a', null],
      ['b', null],
      ['c', 'lane-07'],
      ['d', null],
      ['e', null],
    ]);
  });

  it('counts runs, retries and statuses per job', () => {
    writeNight('2026-10-30', [
      line({ at: 't1', job: 'flaky', status: 'retry', owner: 'rook', error: 'e1' }),
      line({ at: 't2', job: 'flaky', status: 'retry', owner: 'rook', error: 'e2' }),
      line({ at: 't3', job: 'flaky', status: 'fail', owner: 'rook' }),
      line({ at: 't4', job: 'flaky', status: 'retry', owner: 'rook' }),
      line({ at: 't5', job: 'flaky', status: 'ok', owner: 'rook' }),
    ]);
    const [row] = readNight(dir, '2026-10-30')?.rows ?? [];
    expect(row).toMatchObject({
      runs: 5,
      retries: 3,
      counts: { ok: 1, retry: 3, fail: 1 },
      lastStatus: 'ok',
      lastError: 'e2',
    });
  });

  it('uses file order for first/last, keeps `at` as written, and lastError null when no line had one', () => {
    writeNight('2026-10-30', [
      line({ at: '2026-10-30T05:00:00+01:00', job: 'j', status: 'ok', owner: 'x' }),
      line({ at: '2026-10-29T22:00:00-05:00', job: 'j', status: 'fail', owner: 'y' }),
    ]);
    const [row] = readNight(dir, '2026-10-30')?.rows ?? [];
    expect(row).toMatchObject({
      owner: 'y',
      lastStatus: 'fail',
      lastError: null,
      firstAt: '2026-10-30T05:00:00+01:00',
      lastAt: '2026-10-29T22:00:00-05:00',
    });
  });

  it('counts bad lines without throwing and ignores blank lines', () => {
    writeNight('2026-10-30', [
      line({ at: 't1', job: 'good', status: 'ok', owner: null }),
      '',
      '{"at":"t2","job":"good","sta',
      'not json',
      'null',
      '42',
      '[]',
      line({ job: 'no-at', status: 'ok', owner: null }),
      line({ at: 1, job: 'numeric-at', status: 'ok', owner: null }),
      line({ at: 't1', status: 'ok', owner: null }),
      line({ at: 't1', job: 3, status: 'ok', owner: null }),
      line({ at: 't1', job: 'bad-status', status: 'done', owner: null }),
      line({ at: 't1', job: 'no-status', owner: null }),
      '   ',
    ]);
    const digest = readNight(dir, '2026-10-30');
    expect(digest?.badLines).toBe(11);
    expect(digest?.rows.map((r) => r.job)).toEqual(['good']);
  });

  it('sorts rows by job in plain string order, not locale order', () => {
    writeNight('2026-10-30', ['b', 'ä', 'a', 'B'].map((job) => line({ at: 't', job, status: 'ok', owner: null })));
    expect(readNight(dir, '2026-10-30')?.rows.map((r) => r.job)).toEqual(['B', 'a', 'b', 'ä']);
  });

  it('reads CRLF line endings', () => {
    writeFileSync(
      join(dir, '2026-10-30.jsonl'),
      [line({ at: 't1', job: 'j', status: 'ok', owner: null }), line({ at: 't2', job: 'j', status: 'retry', owner: null }), ''].join('\r\n'),
    );
    const digest = readNight(dir, '2026-10-30');
    expect(digest?.badLines).toBe(0);
    expect(digest?.rows[0]).toMatchObject({ runs: 2, retries: 1, lastAt: 't2' });
  });
});
