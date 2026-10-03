import type { Category, Check, Finding, Level } from './types.ts';

/** Helpers bound to one category: f() builds a finding, check() declares a check. */
export function category(cat: Category) {
  const f = (id: string, level: Level, title: string, detail?: string, fix?: string): Finding => {
    const finding: Finding = { id: `${cat}.${id}`, category: cat, level, title };
    if (detail !== undefined) finding.detail = detail;
    if (fix && level !== 'pass') finding.fix = fix;
    return finding;
  };
  const check = (id: string, run: Check['run']): Check => ({ id: `${cat}.${id}`, category: cat, run });
  return { f, check };
}

/** Short French description of a network or runtime error. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'délai dépassé';
    const cause = error.cause as { code?: string; message?: string } | undefined;
    if (cause?.code || cause?.message) return `erreur réseau (${cause.code ?? cause.message})`;
    return error.message;
  }
  return String(error);
}
