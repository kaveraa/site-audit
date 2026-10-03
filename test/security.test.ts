import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsp } from '../src/checks/security.ts';
import { find, level, makeContext, run } from './helpers.ts';

const DAY = 86_400_000;

test('https and http pages', async () => {
  assert.equal((await run('security.https', makeContext()))[0]!.level, 'pass');
  const http = makeContext({ url: 'http://example.test/' });
  assert.equal((await run('security.https', http))[0]!.level, 'fail');
  assert.deepEqual(await run('security.hsts', http), []);
  assert.deepEqual(await run('security.tls', http), []);
});

test('certificate expiry, issuer and protocol', async () => {
  const soon = await run('security.tls', makeContext({ tls: { protocol: 'TLSv1.2', validTo: new Date(Date.now() + 3 * DAY), issuer: 'Test CA' } }));
  assert.equal(level(soon, 'security.tls-expiry'), 'fail');
  assert.equal(level(soon, 'security.tls-protocol'), 'pass');
  assert.equal(find(soon, 'security.tls-issuer')!.detail, 'Test CA');
  const month = await run('security.tls', makeContext({ tls: { protocol: 'TLSv1.1', validTo: new Date(Date.now() + 20 * DAY), issuer: 'X' } }));
  assert.equal(level(month, 'security.tls-expiry'), 'warn');
  assert.equal(level(month, 'security.tls-protocol'), 'warn');
  const expired = await run('security.tls', makeContext({ tls: { protocol: 'TLSv1.3', validTo: new Date(Date.now() - DAY), issuer: 'X' } }));
  assert.match(find(expired, 'security.tls-expiry')!.detail!, /Expiré/);
});

test('HSTS', async () => {
  assert.equal(level(await run('security.hsts', makeContext()), 'security.hsts'), 'fail');
  assert.equal(level(await run('security.hsts', makeContext({ headers: { 'strict-transport-security': 'max-age=86400' } })), 'security.hsts'), 'warn');
  const good = await run('security.hsts', makeContext({ headers: { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } }));
  assert.equal(level(good, 'security.hsts'), 'pass');
  assert.match(find(good, 'security.hsts-options')!.detail!, /includeSubDomains : oui, preload : non/);
});

test('CSP parsing and unsafe directives', async () => {
  assert.equal(parseCsp("default-src 'self'; frame-ancestors 'none'").get('frame-ancestors'), "'none'");
  assert.equal((await run('security.csp', makeContext()))[0]!.level, 'warn');
  assert.equal((await run('security.csp', makeContext({ headers: { 'content-security-policy': "default-src 'self'; script-src 'self' 'unsafe-inline'" } })))[0]!.level, 'warn');
  assert.equal((await run('security.csp', makeContext({ headers: { 'content-security-policy': "default-src 'self' 'unsafe-eval'" } })))[0]!.level, 'warn');
  assert.equal((await run('security.csp', makeContext({ headers: { 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'" } })))[0]!.level, 'pass');
});

test('nosniff, clickjacking, referrer and permissions policies', async () => {
  assert.equal((await run('security.nosniff', makeContext({ headers: { 'x-content-type-options': 'nosniff' } })))[0]!.level, 'pass');
  assert.equal((await run('security.nosniff', makeContext()))[0]!.level, 'warn');
  assert.equal((await run('security.clickjacking', makeContext({ headers: { 'content-security-policy': "frame-ancestors 'self'" } })))[0]!.level, 'pass');
  assert.equal((await run('security.clickjacking', makeContext({ headers: { 'x-frame-options': 'DENY' } })))[0]!.level, 'pass');
  assert.equal((await run('security.clickjacking', makeContext({ headers: { 'x-frame-options': 'ALLOW-FROM x' } })))[0]!.level, 'warn');
  assert.equal((await run('security.referrer-policy', makeContext({ headers: { 'referrer-policy': 'unsafe-url' } })))[0]!.level, 'warn');
  assert.equal((await run('security.referrer-policy', makeContext({ headers: { 'referrer-policy': 'no-referrer' } })))[0]!.level, 'pass');
  assert.equal((await run('security.permissions-policy', makeContext()))[0]!.level, 'warn');
});

test('cookie flags', async () => {
  const ctx = makeContext({ headers: [['set-cookie', 'sid=1; Path=/; Secure; HttpOnly; SameSite=Lax'], ['set-cookie', 'theme=dark; Path=/']] });
  const findings = await run('security.cookies', ctx);
  assert.equal(level(findings, 'security.cookie.sid'), 'pass');
  assert.equal(level(findings, 'security.cookie.theme'), 'warn');
  assert.match(find(findings, 'security.cookie.theme')!.detail!, /Secure, HttpOnly, SameSite/);
  assert.equal((await run('security.cookies', makeContext()))[0]!.level, 'info');
});

test('information leaks', async () => {
  const leak = await run('security.leaks', makeContext({ headers: { server: 'Apache/2.4.41 (Ubuntu)', 'x-powered-by': 'PHP/7.4.3' } }));
  assert.equal(leak[0]!.level, 'warn');
  assert.match(leak[0]!.detail!, /Server: Apache\/2.4.41.*X-Powered-By: PHP\/7.4.3/);
  assert.equal((await run('security.leaks', makeContext({ headers: { server: 'nginx' } })))[0]!.level, 'pass');
});

test('mixed content', async () => {
  const html = (body: string) => `<html><body>${body}</body></html>`;
  assert.equal((await run('security.mixed-content', makeContext({ html: html('<script src="http://cdn.test/a.js"></script>') })))[0]!.level, 'fail');
  assert.equal((await run('security.mixed-content', makeContext({ html: html('<link rel="stylesheet" href="http://cdn.test/a.css">') })))[0]!.level, 'fail');
  assert.equal((await run('security.mixed-content', makeContext({ html: html('<img src="http://cdn.test/a.png">') })))[0]!.level, 'warn');
  assert.equal((await run('security.mixed-content', makeContext({ html: html('<a href="http://other.test/">lien</a><img src="/a.png">') })))[0]!.level, 'pass');
});

test('security.txt', async () => {
  assert.equal((await run('security.security-txt', makeContext({ routes: { '/.well-known/security.txt': { body: 'Contact: mailto:a@b.test\nExpires: 2027-01-01T00:00:00Z' } } })))[0]!.level, 'pass');
  assert.equal((await run('security.security-txt', makeContext({ fallback: { status: 200, body: '<html></html>' } })))[0]!.level, 'info');
});
