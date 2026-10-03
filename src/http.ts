import { connect } from 'node:tls';
import { isIP } from 'node:net';
import type { FetchResult, Hop, OsvVuln, TlsInfo } from './types.ts';
import { USER_AGENT } from './version.ts';

const MAX_REDIRECTS = 10;
const MAX_PAGE = 10_000_000;
const MAX_EXTRA = 1_000_000;

function request(url: string, timeout: number, follow = false): Promise<Response> {
  return fetch(url, {
    redirect: follow ? 'follow' : 'manual',
    headers: { 'user-agent': USER_AGENT, 'accept-encoding': 'br, gzip, deflate' },
    signal: AbortSignal.timeout(timeout),
  });
}

async function readBody(res: Response, max: number): Promise<{ text: string; bytes: number }> {
  if (!res.body) return { text: '', bytes: 0 };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    bytes += value.length;
    if (bytes >= max) {
      await reader.cancel();
      break;
    }
  }
  return { text: new TextDecoder().decode(Buffer.concat(chunks)), bytes };
}

export interface Page extends FetchResult {
  redirects: Hop[];
  timings: { ttfb: number; total: number };
  bytes: number;
}

/** Fetch the audited page, following redirects by hand to record the chain and time the last hop. */
export async function fetchPage(start: string, timeout: number): Promise<Page> {
  const redirects: Hop[] = [];
  let url = start;
  for (;;) {
    const t0 = performance.now();
    const res = await request(url, timeout);
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      if (redirects.length >= MAX_REDIRECTS) throw new Error('Too many redirects');
      redirects.push({ url, status: res.status });
      url = new URL(location, url).href;
      continue;
    }
    const ttfb = performance.now() - t0;
    const { text, bytes } = await readBody(res, MAX_PAGE);
    const total = performance.now() - t0;
    return { url, status: res.status, headers: res.headers, body: text, redirects, timings: { ttfb, total }, bytes };
  }
}

export async function fetchOnce(url: string, timeout: number, follow: boolean): Promise<FetchResult> {
  const res = await request(url, timeout, follow);
  const { text } = await readBody(res, MAX_EXTRA);
  return { url: res.url || url, status: res.status, headers: res.headers, body: text };
}

export function getTlsInfo(host: string, port: number, timeout: number): Promise<TlsInfo> {
  return new Promise((resolve, reject) => {
    const socket = connect(
      { host, port, servername: isIP(host) ? undefined : host, rejectUnauthorized: false, minVersion: 'TLSv1', timeout },
      () => {
        const cert = socket.getPeerCertificate();
        const issuer = cert.issuer ? [cert.issuer.O, cert.issuer.CN].filter(Boolean).join(' - ') : '';
        resolve({ protocol: socket.getProtocol(), validTo: new Date(cert.valid_to), issuer: issuer || 'inconnu' });
        socket.end();
      },
    );
    socket.on('timeout', () => socket.destroy(Object.assign(new Error('TLS timeout'), { name: 'TimeoutError' })));
    socket.on('error', reject);
  });
}

export async function queryOsv(name: string, version: string, timeout: number): Promise<OsvVuln[]> {
  const res = await fetch(process.env.SITE_AUDIT_OSV_URL ?? 'https://api.osv.dev/v1/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': USER_AGENT },
    body: JSON.stringify({ package: { name, ecosystem: 'npm' }, version }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`OSV a répondu ${res.status}`);
  const data = (await res.json()) as { vulns?: OsvVuln[] };
  return data.vulns ?? [];
}
