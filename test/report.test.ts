import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from '../src/audit.ts';
import { buildReport, exitCode, renderText, summarize } from '../src/report.ts';
import type { Finding } from '../src/types.ts';
import { makeContext } from './helpers.ts';

const finding = (level: Finding['level'], category: Finding['category'] = 'seo'): Finding => ({ id: `x.${level}`, category, level, title: 't' });

test('score formula', () => {
  const s = summarize([finding('pass'), finding('warn'), finding('fail'), finding('pass'), finding('info')]);
  assert.deepEqual(s, { pass: 2, warn: 1, fail: 1, info: 1, score: 63 });
  assert.equal(summarize([finding('info')]).score, null);
});

test('exit code thresholds', () => {
  const findings = [finding('pass'), finding('warn'), finding('info')];
  assert.equal(exitCode(findings), 0);
  assert.equal(exitCode(findings, 'fail'), 0);
  assert.equal(exitCode(findings, 'warn'), 1);
  assert.equal(exitCode([finding('fail')], 'fail'), 1);
});

test('a throwing check becomes an info finding', async () => {
  const findings = await runChecks(makeContext(), [{ id: 'seo.boom', category: 'seo', run: () => { throw new Error('nope'); } }]);
  assert.deepEqual(findings.map((f) => [f.id, f.level]), [['seo.boom', 'info']]);
});

test('text rendering, with and without colour', () => {
  const ctx = makeContext();
  const findings: Finding[] = [{ id: 'seo.title', category: 'seo', level: 'warn', title: 'Balise <title>', detail: 'court', fix: 'Allonger le titre.' }];
  const report = buildReport(ctx, ['seo'], findings);
  const plain = renderText(report, false);
  assert.match(plain, /ATTENTION\s+Balise <title>/);
  assert.match(plain, /Correctif : Allonger le titre\./);
  assert.match(plain, /SEO\s+score\s+50\/100/);
  assert.ok(!plain.includes('\x1b['));
  assert.ok(renderText(report, true).includes('\x1b[33m'));
});
