import type { Category, Check, Context, Finding } from './types.ts';
import { errorMessage } from './finding.ts';
import { seoChecks } from './checks/seo.ts';
import { securityChecks } from './checks/security.ts';
import { vulnChecks } from './checks/vuln.ts';

export const CATEGORIES: Category[] = ['seo', 'security', 'vuln'];
export const ALL_CHECKS: Check[] = [...seoChecks, ...securityChecks, ...vulnChecks];

/** Run checks one after another (polite on the server). A failing check becomes an info finding. */
export async function runChecks(ctx: Context, checks: Check[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const check of checks) {
    try {
      findings.push(...(await check.run(ctx)));
    } catch (error) {
      findings.push({ id: check.id, category: check.category, level: 'info', title: `Vérification impossible : ${check.id}`, detail: errorMessage(error) });
    }
  }
  return findings;
}
