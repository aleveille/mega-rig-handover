import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Fixtures live in a temp dir. runs/ is read-only and never touched.
const NIGHT = '2026-10-28';
const EMPTY_NIGHT = '2026-10-29';
const BAD_NIGHT = '2026-10-30';
const MISSING_NIGHT = '2001-01-01';

// Job names are chosen so none is a substring of another, so the position check in the HTML is exact.
// The lines are deliberately out of job order in the file.
const GOOD_LINES = [
  '{"at":"2026-10-28T02:10:00+01:00","job":"nightly-backup","status":"ok","owner":"ana"}',
  '{"at":"2026-10-28T01:00:00+01:00","job":"mail-sync","status":"retry","owner":null,"error":"timeout"}',
  '{"at":"2026-10-28T03:30:00+01:00","job":"cache-warm","status":"fail","owner":"ben","error":"disk full"}',
  '{"at":"2026-10-28T01:20:00+01:00","job":"mail-sync","status":"ok","owner":null}',
];

let root: string;
let config: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  writeFileSync(join(root, `${NIGHT}.jsonl`), GOOD_LINES.join('\n') + '\n');
  writeFileSync(join(root, `${EMPTY_NIGHT}.jsonl`), '');
  writeFileSync(
    join(root, `${BAD_NIGHT}.jsonl`),
    [GOOD_LINES[0], 'this is not json', GOOD_LINES[2]].join('\n') + '\n',
  );
  config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: root };
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('digest page', () => {
  it('renders one row per job with the lane banner', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request(`/digest/${NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    for (const job of ['cache-warm', 'mail-sync', 'nightly-backup']) {
      expect(html).toContain(job);
    }
  });

  it('returns 404 for a night with no file', async () => {
    const res = await createApp(config).request(`/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
  });

  it('renders "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request(`/digest/${EMPTY_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('still renders the good rows when a line is bad', async () => {
    const res = await createApp(config).request(`/digest/${BAD_NIGHT}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nightly-backup');
    expect(html).toContain('cache-warm');
  });
});

describe('digest JSON', () => {
  it('returns the night rows sorted by job', async () => {
    const res = await createApp(config).request(`/api/digest/${NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[]; badLines: number };
    expect(body.night).toBe(NIGHT);
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['cache-warm', 'mail-sync', 'nightly-backup']);
  });

  it('returns 404 JSON for a night with no file', async () => {
    const res = await createApp(config).request(`/api/digest/${MISSING_NIGHT}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ night: MISSING_NIGHT, error: expect.any(String) });
  });

  it('returns no rows for an empty night', async () => {
    const res = await createApp(config).request(`/api/digest/${EMPTY_NIGHT}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: EMPTY_NIGHT, rows: [], badLines: 0 });
  });

  it('counts a bad line and still returns the good rows', async () => {
    const res = await createApp(config).request(`/api/digest/${BAD_NIGHT}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['cache-warm', 'nightly-backup']);
  });
});

describe('digest page and JSON agree', () => {
  it('lists jobs in the same order as the JSON rows', async () => {
    const app = createApp(config);
    const html = await (await app.request(`/digest/${NIGHT}`)).text();
    const body = (await (await app.request(`/api/digest/${NIGHT}`)).json()) as { rows: { job: string }[] };
    const jobs = body.rows.map((r) => r.job);
    const positions = jobs.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(jobs.map((job, i) => [job, positions[i]] as const).sort((a, b) => a[1] - b[1]).map(([job]) => job)).toEqual(
      jobs,
    );
  });
});
