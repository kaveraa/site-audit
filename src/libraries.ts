import type { OsvVuln } from './types.ts';

export interface Library {
  name: string;
  version: string;
}

/** Name seen in URLs (without .js/.min suffixes) -> npm package name. Only these are reported. */
const KNOWN: Record<string, string> = {
  jquery: 'jquery', 'jquery-ui': 'jquery-ui', jqueryui: 'jquery-ui', 'jquery-migrate': 'jquery-migrate',
  bootstrap: 'bootstrap', 'twitter-bootstrap': 'bootstrap', angular: 'angular', angularjs: 'angular',
  react: 'react', 'react-dom': 'react-dom', vue: 'vue', lodash: 'lodash', underscore: 'underscore',
  moment: 'moment', handlebars: 'handlebars', backbone: 'backbone', d3: 'd3', axios: 'axios',
  dompurify: 'dompurify', chart: 'chart.js', select2: 'select2', swiper: 'swiper', knockout: 'knockout',
};

const PATTERNS = [
  /\/((?:@[\w.-]+\/)?[\w.-]+?)@v?(\d+\.\d+\.\d+)/g, // /npm/jquery@3.4.1/, unpkg.com/react@16.0.0
  /\/([\w.-]+)\/v?(\d+\.\d+\.\d+)\//g, // /ajax/libs/jquery/3.4.1/, /bootstrap/4.3.1/
  /\/([\w.-]+?)[.-]v?(\d+\.\d+\.\d+)(?:[.-][a-z]+)*\.js\b/g, // jquery-3.4.1.min.js
  /\/([\w.-]+?)(?:\.min)?\.js\?(?:[^#]*&)?ver=(\d+\.\d+\.\d+)/g, // jquery.min.js?ver=3.7.1
];

/** Well-known JavaScript libraries with a version visible in script URLs. */
export function extractLibraries(urls: string[]): Library[] {
  const found = new Map<string, Library>();
  for (const raw of urls) {
    let url = raw.toLowerCase();
    try {
      url = decodeURIComponent(url);
    } catch {}
    for (const pattern of PATTERNS) {
      for (const [, rawName, version] of url.matchAll(pattern)) {
        const name = KNOWN[rawName!.replace(/(\.(min|slim|bundle|js))+$/, '')];
        if (name) found.set(`${name}@${version}`, { name, version: version! });
      }
    }
  }
  return [...found.values()];
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map(Number);
  const pb = b.split(/[.+-]/).map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** Lowest fixed version above the current one, if OSV lists any. */
export function fixedVersion(vuln: OsvVuln, lib: Library): string | undefined {
  return (vuln.affected ?? [])
    .filter((a) => !a.package?.name || a.package.name === lib.name)
    .flatMap((a) => a.ranges ?? [])
    .flatMap((r) => r.events)
    .map((e) => e.fixed)
    .filter((v): v is string => Boolean(v) && compareVersions(v!, lib.version) > 0)
    .sort(compareVersions)[0];
}
