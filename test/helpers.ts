import { parse } from 'node-html-parser';
import { ALL_CHECKS } from '../src/audit.ts';
import type { Context, FetchResult, Finding, Hop, OsvVuln, TlsInfo } from '../src/types.ts';

type HeaderInit = ConstructorParameters<typeof Headers>[0];

export interface Route {
  status?: number;
  body?: string;
  headers?: HeaderInit;
}

export interface Options {
  url?: string;
  startUrl?: string;
  status?: number;
  html?: string;
  headers?: HeaderInit;
  redirects?: Hop[];
  timings?: { ttfb: number; total: number };
  bytes?: number;
  /** Extra requests by path (or full URL). */
  routes?: Record<string, Route | Error>;
  /** Response for paths not in routes. Default: 404 "Not found". */
  fallback?: Route;
  tls?: TlsInfo;
  osv?: (name: string, version: string) => Promise<OsvVuln[]>;
}

export function makeContext(o: Options = {}): Context & { requests: string[] } {
  const url = new URL(o.url ?? 'https://example.test/');
  const html = o.html ?? '<html><head></head><body></body></html>';
  const requests: string[] = [];
  return {
    requests,
    startUrl: new URL(o.startUrl ?? url.href),
    url,
    redirects: o.redirects ?? [],
    status: o.status ?? 200,
    headers: new Headers(o.headers),
    html,
    doc: parse(html),
    timings: o.timings ?? { ttfb: 100, total: 150 },
    bytes: o.bytes ?? html.length,
    async get(target): Promise<FetchResult> {
      const href = new URL(target, url);
      requests.push(href.pathname);
      const route = o.routes?.[href.href] ?? o.routes?.[href.pathname] ?? o.fallback ?? { status: 404, body: 'Not found' };
      if (route instanceof Error) throw route;
      return { url: href.href, status: route.status ?? 200, headers: new Headers(route.headers), body: route.body ?? '' };
    },
    tls: async () => o.tls ?? { protocol: 'TLSv1.3', validTo: new Date(Date.now() + 90 * 86_400_000), issuer: 'Test CA' },
    osv: o.osv ?? (async () => []),
  };
}

/** Run one check by id and return its findings. */
export async function run(id: string, ctx: Context): Promise<Finding[]> {
  const check = ALL_CHECKS.find((c) => c.id === id);
  if (!check) throw new Error(`No check ${id}`);
  return check.run(ctx);
}

export const find = (findings: Finding[], id: string) => findings.find((f) => f.id === id);
export const level = (findings: Finding[], id: string) => find(findings, id)?.level;
