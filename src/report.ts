import type { Category, Context, Finding, Hop, Level } from './types.ts';
import { VERSION } from './version.ts';

export interface CategorySummary {
  pass: number;
  warn: number;
  fail: number;
  info: number;
  /** Out of 100: weights pass=1, warn=0.5, fail=0 over scored findings; info is not scored. Null if nothing scored. */
  score: number | null;
}

export interface Report {
  tool: 'site-audit';
  version: string;
  date: string;
  url: string;
  finalUrl: string;
  status: number;
  redirects: Hop[];
  timings: { ttfb: number; total: number };
  categories: Category[];
  findings: Finding[];
  summary: Partial<Record<Category, CategorySummary>>;
}

const RANK: Record<Level, number> = { info: 0, pass: 0, warn: 1, fail: 2 };

export function summarize(findings: Finding[]): CategorySummary {
  const s: CategorySummary = { pass: 0, warn: 0, fail: 0, info: 0, score: null };
  for (const finding of findings) s[finding.level]++;
  const scored = s.pass + s.warn + s.fail;
  if (scored) s.score = Math.round((100 * (s.pass + s.warn * 0.5)) / scored);
  return s;
}

export function buildReport(ctx: Pick<Context, 'startUrl' | 'url' | 'status' | 'redirects' | 'timings'>, categories: Category[], findings: Finding[]): Report {
  return {
    tool: 'site-audit',
    version: VERSION,
    date: new Date().toISOString(),
    url: ctx.startUrl.href,
    finalUrl: ctx.url.href,
    status: ctx.status,
    redirects: ctx.redirects,
    timings: { ttfb: Math.round(ctx.timings.ttfb), total: Math.round(ctx.timings.total) },
    categories,
    findings,
    summary: Object.fromEntries(categories.map((c) => [c, summarize(findings.filter((f) => f.category === c))])),
  };
}

/** Exit code for --fail-on: 1 if a finding is at or above the threshold. */
export function exitCode(findings: Finding[], failOn?: 'warn' | 'fail'): number {
  if (!failOn) return 0;
  return findings.some((f) => RANK[f.level] >= RANK[failOn]) ? 1 : 0;
}

const NAMES: Record<Category, string> = { seo: 'SEO', security: 'Sécurité', vuln: 'Vulnérabilités' };
const LABELS: Record<Level, [string, number]> = { pass: ['OK', 32], warn: ['ATTENTION', 33], fail: ['ECHEC', 31], info: ['INFO', 36] };

export function renderText(report: Report, color: boolean): string {
  const paint = (code: number, text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const bold = (text: string) => paint(1, text);
  const pad = ' '.repeat(13);
  const lines = [
    bold(`site-audit ${report.version} - ${report.url}`),
    report.status
      ? `Page analysée : ${report.finalUrl} (HTTP ${report.status}, ${report.redirects.length} redirection(s))`
      : `Page non analysée : ${report.finalUrl} (certificat TLS refusé)`,
  ];
  for (const cat of report.categories) {
    lines.push('', bold(`== ${NAMES[cat]} ==`));
    for (const finding of report.findings.filter((f) => f.category === cat)) {
      const [label, code] = LABELS[finding.level];
      lines.push(`  ${paint(code, label.padEnd(10))} ${finding.title}`);
      if (finding.detail) lines.push(`${pad}${finding.detail}`);
      if (finding.fix && finding.level !== 'pass') lines.push(`${pad}Correctif : ${finding.fix}`);
    }
  }
  lines.push('', bold('== Résumé =='));
  for (const cat of report.categories) {
    const s = report.summary[cat]!;
    const score = s.score === null ? 'n/a' : `${s.score}/100`;
    lines.push(`  ${NAMES[cat].padEnd(16)} score ${score.padStart(7)}   ${s.pass} OK, ${s.warn} ATTENTION, ${s.fail} ECHEC, ${s.info} INFO`);
  }
  lines.push('', 'Score : OK = 1 point, ATTENTION = 0,5, ECHEC = 0, rapporté sur 100 ; les INFO ne comptent pas.');
  return lines.join('\n');
}
