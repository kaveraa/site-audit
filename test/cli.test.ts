import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import type { Report } from '../src/report.ts';

const CLI = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

function listen(handler: (req: IncomingMessage, res: ServerResponse, origin: string) => void): Promise<{ server: Server; origin: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => handler(req, res, origin));
    let origin = '';
    server.listen(0, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve({ server, origin });
    });
  });
}

const goodPage = (origin: string) => `<!doctype html><html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atelier de poterie à Lyon - cours et stages</title>
<meta name="description" content="Cours de poterie et stages de tournage à Lyon pour adultes et enfants, tous niveaux, en petits groupes.">
<link rel="canonical" href="${origin}/">
<meta property="og:title" content="Atelier de poterie"><meta property="og:description" content="Cours et stages">
<meta property="og:image" content="${origin}/og.png">
</head><body><h1>Atelier de poterie</h1><img src="/vase.png" alt="Vase en grès"><script src="/app.js"></script></body></html>`;

function good(req: IncomingMessage, res: ServerResponse, origin: string) {
  const send = (status: number, body: string, type = 'text/plain') => res.writeHead(status, { 'content-type': type }).end(body);
  switch (req.url) {
    case '/':
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-encoding': 'gzip',
        'cache-control': 'public, max-age=300',
        'content-security-policy': "default-src 'self'; frame-ancestors 'self'",
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin',
        'permissions-policy': 'camera=(), microphone=()',
        'set-cookie': 'sid=1; Path=/; Secure; HttpOnly; SameSite=Lax',
        server: 'nginx',
      });
      return res.end(gzipSync(goodPage(origin)));
    case '/robots.txt':
      return send(200, `User-agent: *\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml\n`);
    case '/sitemap.xml':
      return send(200, `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url></urlset>`, 'application/xml');
    case '/.well-known/security.txt':
      return send(200, 'Contact: mailto:security@example.test\nExpires: 2030-01-01T00:00:00Z\n');
    default:
      return send(404, 'Not found');
  }
}

const weakPage = `<html><head><meta name="robots" content="noindex"><meta name="generator" content="WordPress 5.0">
<title>Accueil</title></head><body><h1>Un</h1><h1>Deux</h1><img src="/a.png">
<script src="/wp-includes/js/jquery/jquery-3.4.1.min.js"></script></body></html>`;

function weak(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'POST' && req.url === '/osv') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const { package: pkg } = JSON.parse(body) as { package: { name: string } };
      const vulns = pkg.name !== 'jquery' ? [] : [{
        id: 'GHSA-gxr4-xjj5-5px2', summary: 'Potential XSS vulnerability in jQuery', database_specific: { severity: 'MODERATE' },
        affected: [{ package: { name: 'jquery', ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '1.2.0' }, { fixed: '3.5.0' }] }] }],
      }];
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ vulns }));
    });
    return;
  }
  const headers = { server: 'Apache/2.4.1 (Unix)', 'x-powered-by': 'PHP/7.4.3', 'set-cookie': 'session=abc; Path=/' };
  if (req.url === '/.git/HEAD') return res.writeHead(200, headers).end('ref: refs/heads/main\n');
  if (req.url === '/.env') return res.writeHead(200, headers).end('APP_KEY=base64:abc\nDB_PASSWORD=secret\n');
  if (req.url === '/uploads/') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html><head><title>Index of /uploads</title></head><body><h1>Index of /uploads</h1></body></html>');
  // SPA style fallback: every other path returns the home page with 200.
  res.writeHead(200, { 'content-type': 'text/html', ...headers }).end(weakPage);
}

let goodSite: { server: Server; origin: string };
let weakSite: { server: Server; origin: string };

before(async () => {
  goodSite = await listen(good);
  weakSite = await listen(weak);
});

after(() => {
  goodSite.server.close();
  weakSite.server.close();
});

function cli(...args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, NO_COLOR: '1', SITE_AUDIT_OSV_URL: `${weakSite.origin}/osv` },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

const levels = (report: Report) => Object.fromEntries(report.findings.map((f) => [f.id, f.level]));

test('weak site: findings in JSON', async () => {
  const { code, stdout } = await cli(`${weakSite.origin}/`, '--json');
  assert.equal(code, 0);
  const report = JSON.parse(stdout) as Report;
  const l = levels(report);
  assert.equal(l['seo.noindex'], 'fail');
  assert.equal(l['seo.h1'], 'warn');
  assert.equal(l['seo.robots-txt'], 'warn');
  assert.equal(l['security.https'], 'fail');
  assert.equal(l['security.leaks'], 'warn');
  assert.equal(l['security.cookie.session'], 'warn');
  assert.equal(l['vuln.exposed.git-head'], 'fail');
  assert.equal(l['vuln.exposed.env'], 'fail');
  assert.equal(l['vuln.exposed.phpinfo-php'], undefined, 'SPA fallback is not a phpinfo page');
  assert.equal(l['vuln.exposed.package-json'], undefined);
  assert.equal(l['vuln.soft-404'], 'info');
  assert.equal(l['vuln.directory-listing'], 'fail');
  assert.equal(l['vuln.generator'], 'warn');
  assert.equal(l['vuln.osv.jquery.GHSA-gxr4-xjj5-5px2'], 'warn');
  assert.match(report.findings.find((f) => f.id === 'vuln.osv.jquery.GHSA-gxr4-xjj5-5px2')!.fix!, /3\.5\.0/);
  assert.deepEqual(report.categories, ['seo', 'security', 'vuln']);
  assert.ok(report.summary.vuln!.score! < 50);
});

test('weak site: --fail-on fail exits 1, text output in French', async () => {
  const { code, stdout } = await cli(weakSite.origin, '--fail-on', 'fail');
  assert.equal(code, 1);
  assert.match(stdout, /== SEO ==/);
  assert.match(stdout, /ECHEC\s+Indexation autorisée/);
  assert.match(stdout, /Correctif : /);
  assert.match(stdout, /== Résumé ==/);
  assert.ok(!stdout.includes('\x1b['), 'no colour when NO_COLOR is set');
});

test('good site: SEO and vulnerability checks pass', async () => {
  const seo = await cli(goodSite.origin, '--only', 'seo', '--fail-on', 'fail', '--json');
  assert.equal(seo.code, 0, seo.stdout);
  const report = JSON.parse(seo.stdout) as Report;
  assert.deepEqual(report.categories, ['seo']);
  const notPass = report.findings.filter((f) => f.level !== 'pass').map((f) => f.id);
  assert.deepEqual(notPass, ['seo.https-redirect'], 'only the plain HTTP test server is flagged');

  const vuln = await cli(goodSite.origin, '--only', 'vuln', '--fail-on', 'warn');
  assert.equal(vuln.code, 0, vuln.stdout);
});

test('good site: security headers pass except HTTPS', async () => {
  const { code, stdout } = await cli(goodSite.origin, '--only', 'security', '--json', '--fail-on', 'fail');
  assert.equal(code, 1);
  const l = levels(JSON.parse(stdout) as Report);
  assert.equal(l['security.https'], 'fail');
  for (const id of ['security.csp', 'security.nosniff', 'security.clickjacking', 'security.referrer-policy', 'security.permissions-policy', 'security.cookie.sid', 'security.leaks', 'security.security-txt']) {
    assert.equal(l[id], 'pass', id);
  }
});

test('unreachable site and bad arguments exit 2', async () => {
  const closed = await listen(() => {});
  await new Promise((r) => closed.server.close(r));
  const down = await cli(closed.origin, '--timeout', '2000');
  assert.equal(down.code, 2);
  assert.match(down.stderr, /impossible de joindre/);
  assert.equal(down.stdout, '');
  assert.equal((await cli(goodSite.origin, '--only', 'perf')).code, 2);
  assert.equal((await cli()).code, 2);
  const help = await cli('--help');
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Utilisation/);
});

// Self-signed for localhost, valid until 2126: browsers refuse it.
const SELF_SIGNED_KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg1oe3RY9GCIBSP5dP
KjJZoxnMSFFmpN0qdQoLmtBd0LKhRANCAARAePkiYS82Nx+5F4zoWsp4AfvrwS1Y
5GKtXLhsIdj8vCwsMcCcwRQk6zjHW/Cbss37G9qLsXoEB0J5k7lCiyVs
-----END PRIVATE KEY-----
`;
const SELF_SIGNED_CERT = `-----BEGIN CERTIFICATE-----
MIIBfzCCASWgAwIBAgIULNaM02bs2agRtuesWywK48/WJw4wCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MTAwODExMTUzOFoYDzIxMjYwOTE0
MTExNTM4WjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwWTATBgcqhkjOPQIBBggqhkjO
PQMBBwNCAARAePkiYS82Nx+5F4zoWsp4AfvrwS1Y5GKtXLhsIdj8vCwsMcCcwRQk
6zjHW/Cbss37G9qLsXoEB0J5k7lCiyVso1MwUTAdBgNVHQ4EFgQUy0pJLMQwcVsn
RGNZTulFY+c2Uy4wHwYDVR0jBBgwFoAUy0pJLMQwcVsnRGNZTulFY+c2Uy4wDwYD
VR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiB/nAJ2iV7DI+HgFHynWADE
CK4lDzFj5urqGeywHvcfWgIhANbX1G0qGulR33rlGrZ4I3IjRURX/L4Rhn7u3sDG
08zI
-----END CERTIFICATE-----
`;

test('refused certificate, direct or after an HTTP redirect: security report instead of exit 2', async () => {
  const server = createHttpsServer({ key: SELF_SIGNED_KEY, cert: SELF_SIGNED_CERT }, (_req, res) => res.end('ok'));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const origin = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const redirect = await listen((_req, res) => res.writeHead(301, { location: `${origin}/` }).end());
  try {
    const viaHttp = JSON.parse((await cli(redirect.origin, '--json')).stdout) as Report;
    assert.equal(viaHttp.finalUrl, `${origin}/`);
    assert.equal(viaHttp.redirects.length, 1);
    assert.equal(viaHttp.findings.find((f) => f.id === 'security.tls-valid')!.level, 'fail');

    const { code, stdout } = await cli(origin, '--json', '--fail-on', 'fail');
    assert.equal(code, 1);
    const report = JSON.parse(stdout) as Report;
    assert.deepEqual(report.categories, ['security']);
    assert.equal(report.status, 0);
    const valid = report.findings.find((f) => f.id === 'security.tls-valid')!;
    assert.equal(valid.level, 'fail');
    assert.match(valid.detail!, /\([A-Z_]+\)$/);
    assert.match((await cli(origin)).stdout, /Page non analysée/);
  } finally {
    server.close();
    redirect.server.close();
  }
});
