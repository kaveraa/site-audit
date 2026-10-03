import { parse } from 'node-html-parser';
import { fetchOnce, fetchPage, getTlsInfo, queryOsv } from './http.ts';
import type { Context, FetchResult, TlsInfo } from './types.ts';

export async function buildContext(start: URL, timeout: number): Promise<Context> {
  const page = await fetchPage(start.href, timeout);
  const url = new URL(page.url);
  const cache = new Map<string, Promise<FetchResult>>();
  let tls: Promise<TlsInfo> | undefined;
  return {
    startUrl: start,
    url,
    redirects: page.redirects,
    status: page.status,
    headers: page.headers,
    html: page.body,
    doc: parse(page.body),
    timings: page.timings,
    bytes: page.bytes,
    get(target, { follow = false } = {}) {
      const href = new URL(target, url).href;
      const key = `${follow}|${href}`;
      let result = cache.get(key);
      if (!result) cache.set(key, (result = fetchOnce(href, timeout, follow)));
      return result;
    },
    tls: () => (tls ??= getTlsInfo(url.hostname, Number(url.port) || 443, timeout)),
    osv: (name, version) => queryOsv(name, version, timeout),
  };
}
