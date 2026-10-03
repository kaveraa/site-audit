import type { HTMLElement } from 'node-html-parser';

export type Category = 'seo' | 'security' | 'vuln';
export type Level = 'pass' | 'warn' | 'fail' | 'info';

export interface Finding {
  id: string;
  category: Category;
  level: Level;
  title: string;
  detail?: string;
  fix?: string;
}

export interface FetchResult {
  url: string;
  status: number;
  headers: Headers;
  body: string;
}

export interface Hop {
  url: string;
  status: number;
}

export interface TlsInfo {
  protocol: string | null;
  validTo: Date;
  issuer: string;
}

export interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  database_specific?: { severity?: string };
  affected?: {
    package?: { name?: string; ecosystem?: string };
    ranges?: { events: { introduced?: string; fixed?: string }[] }[];
  }[];
}

/** Everything a check may look at. The page is fetched once; extra requests go through get(). */
export interface Context {
  startUrl: URL;
  url: URL;
  redirects: Hop[];
  status: number;
  headers: Headers;
  html: string;
  doc: HTMLElement;
  timings: { ttfb: number; total: number };
  bytes: number;
  /** GET a path or URL relative to the final page. Memoized. Redirects are not followed unless asked. */
  get(target: string, options?: { follow?: boolean }): Promise<FetchResult>;
  tls(): Promise<TlsInfo>;
  osv(name: string, version: string): Promise<OsvVuln[]>;
}

export interface Check {
  id: string;
  category: Category;
  run(ctx: Context): Finding[] | Promise<Finding[]>;
}
