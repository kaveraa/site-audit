import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, extractLibraries, fixedVersion } from '../src/libraries.ts';
import type { OsvVuln } from '../src/types.ts';
import { find, level, makeContext, run } from './helpers.ts';

const SPA = '<!doctype html><html><body><div id="app"></div></body></html>';

test('exposed .git/HEAD and .env are reported', async () => {
  const ctx = makeContext({
    routes: {
      '/.git/HEAD': { body: 'ref: refs/heads/main\n' },
      '/.env': { body: '# config\nDB_PASSWORD=secret\nAPP_KEY=abc\n' },
    },
  });
  const findings = await run('vuln.exposed-files', ctx);
  assert.equal(level(findings, 'vuln.exposed.git-head'), 'fail');
  assert.equal(level(findings, 'vuln.exposed.env'), 'fail');
  assert.equal(find(findings, 'vuln.exposed-files'), undefined);
  assert.ok(ctx.requests[0]!.startsWith('/site-audit-'), 'baseline is fetched first');
});

test('SPA fallback identical to the baseline is ignored', async () => {
  // Every path answers 200 with the same page, even content that would pass a loose test.
  const ctx = makeContext({ fallback: { status: 200, body: 'ref: refs/heads/main' } });
  const findings = await run('vuln.exposed-files', ctx);
  assert.equal(level(findings, 'vuln.exposed-files'), 'pass');
  assert.equal(level(findings, 'vuln.soft-404'), 'info');
});

test('soft 404 pages that differ from the baseline fail the content test', async () => {
  const ctx = makeContext({
    fallback: { status: 200, body: SPA },
    routes: {
      '/.env': { body: '<!doctype html><title>Page /.env introuvable</title>' },
      '/.git/HEAD': { body: '<html>Not found: /.git/HEAD</html>' },
      '/phpinfo.php': { body: '<html>Oops</html>' },
      '/package.json': { body: '<html>{"dependencies": 1}</html>' },
      '/backup.zip': { body: 'Not a zip' },
    },
  });
  assert.equal(level(await run('vuln.exposed-files', ctx), 'vuln.exposed-files'), 'pass');
});

test('content validation of each sensitive file', async () => {
  const ctx = makeContext({
    routes: {
      '/.git/HEAD': { body: 'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3\n' },
      '/.DS_Store': { body: '\u0000\u0000\u0000\u0001Bud1\u0000\u0000' },
      '/phpinfo.php': { body: '<html><title>PHP 8.2.1 - phpinfo()</title></html>' },
      '/server-status': { body: '<h1>Apache Server Status for host</h1>' },
      '/wp-config.php.bak': { body: "<?php define('DB_PASSWORD', 'x');" },
      '/backup.zip': { body: 'PK\u0003\u0004rest' },
      '/.svn/entries': { body: '12\n' },
      '/composer.lock': { body: '{"content-hash": "x", "packages": []}' },
      '/package.json': { body: '{"name": "site", "dependencies": {}}' },
    },
  });
  const findings = await run('vuln.exposed-files', ctx);
  for (const id of ['git-head', 'ds-store', 'phpinfo-php', 'server-status', 'wp-config-php-bak', 'backup-zip', 'svn-entries', 'composer-lock', 'package-json']) {
    assert.ok(find(findings, `vuln.exposed.${id}`), id);
  }
  assert.equal(level(findings, 'vuln.exposed.composer-lock'), 'warn');
  assert.equal(find(findings, 'vuln.exposed.env'), undefined);
});

test('a network error on one file becomes an info finding', async () => {
  const ctx = makeContext({ routes: { '/.env': new Error('boom') } });
  const findings = await run('vuln.exposed-files', ctx);
  assert.equal(level(findings, 'vuln.exposed-files'), 'pass');
  assert.match(find(findings, 'vuln.exposed-files-errors')!.detail!, /\/\.env/);
});

test('directory listing', async () => {
  const listing = '<html><head><title>Index of /uploads</title></head><body><h1>Index of /uploads</h1></body></html>';
  assert.equal((await run('vuln.directory-listing', makeContext({ routes: { '/uploads/': { body: listing } } })))[0]!.level, 'fail');
  assert.equal((await run('vuln.directory-listing', makeContext({ fallback: { status: 200, body: SPA } })))[0]!.level, 'pass');
});

test('meta generator', async () => {
  const wp = await run('vuln.generator', makeContext({ html: '<html><head><meta name="generator" content="WordPress 6.2.1"></head></html>' }));
  assert.equal(wp[0]!.level, 'warn');
  assert.match(wp[0]!.detail!, /WordPress détecté/);
  assert.equal((await run('vuln.generator', makeContext({ html: '<meta name="generator" content="Hugo">' })))[0]!.level, 'info');
});

test('library version extraction from script URLs', () => {
  const libs = extractLibraries([
    'https://code.jquery.com/jquery-3.4.1.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@4.3.1/dist/js/bootstrap.bundle.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.15/lodash.min.js',
    'https://stackpath.bootstrapcdn.com/bootstrap/4.3.1/js/bootstrap.min.js',
    'https://unpkg.com/react@16.14.0/umd/react.production.min.js',
    'https://example.test/wp-includes/js/jquery/jquery.min.js?ver=3.7.1',
    'https://code.jquery.com/ui/1.12.1/jquery-ui.min.js',
    'https://example.test/js/jquery-ui-1.13.2.custom.min.js',
    'https://example.test/js/app-2.1.0.js',
    'https://example.test/assets/jquery.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/twitter-bootstrap/3.3.7/js/bootstrap.min.js',
  ]);
  assert.deepEqual(libs.map((l) => `${l.name}@${l.version}`).sort(), [
    'bootstrap@3.3.7', 'bootstrap@4.3.1', 'jquery-ui@1.13.2', 'jquery@3.4.1', 'jquery@3.7.1', 'lodash@4.17.15', 'react@16.14.0',
  ]);
});

test('version comparison and fixed version', () => {
  assert.equal(compareVersions('3.10.0', '3.9.1'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  const vuln: OsvVuln = {
    id: 'GHSA-1',
    affected: [{ package: { name: 'jquery' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '3.5.0' }] }, { events: [{ introduced: '1.0.0' }, { fixed: '1.9.0' }] }] }],
  };
  assert.equal(fixedVersion(vuln, { name: 'jquery', version: '3.4.1' }), '3.5.0');
  assert.equal(fixedVersion({ id: 'x' }, { name: 'jquery', version: '3.4.1' }), undefined);
});

test('OSV results become findings with severity mapping', async () => {
  const html = '<html><body><script src="/js/jquery-3.4.1.min.js"></script><script src="https://unpkg.com/lodash@4.17.21/lodash.js"></script></body></html>';
  const osv = async (name: string): Promise<OsvVuln[]> => name !== 'jquery' ? [] : [
    { id: 'GHSA-moderate', summary: 'XSS in htmlPrefilter', database_specific: { severity: 'MODERATE' }, affected: [{ package: { name: 'jquery' }, ranges: [{ events: [{ introduced: '1.2.0' }, { fixed: '3.5.0' }] }] }] },
    { id: 'GHSA-high', summary: 'Prototype pollution', database_specific: { severity: 'HIGH' } },
    { id: 'CVE-unknown', details: 'No severity\nmore' },
  ];
  const findings = await run('vuln.libraries', makeContext({ html, osv }));
  const moderate = find(findings, 'vuln.osv.jquery.GHSA-moderate')!;
  assert.equal(moderate.level, 'warn');
  assert.match(moderate.fix!, /3\.5\.0/);
  assert.equal(level(findings, 'vuln.osv.jquery.GHSA-high'), 'fail');
  assert.equal(level(findings, 'vuln.osv.jquery.CVE-unknown'), 'fail');
  assert.equal(level(findings, 'vuln.lib.lodash'), 'pass');
});

test('OSV unreachable gives an info finding', async () => {
  const html = '<script src="/js/jquery-3.4.1.min.js"></script>';
  const findings = await run('vuln.libraries', makeContext({ html, osv: () => Promise.reject(new Error('down')) }));
  assert.equal(level(findings, 'vuln.osv.jquery'), 'info');
});
