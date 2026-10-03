#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { ALL_CHECKS, CATEGORIES, runChecks } from './audit.ts';
import { buildContext } from './context.ts';
import { errorMessage } from './finding.ts';
import { buildReport, exitCode, renderText } from './report.ts';
import type { Category } from './types.ts';
import { VERSION } from './version.ts';

const HELP = `site-audit ${VERSION} - audit SEO, sécurité et vulnérabilités d'un site web

Utilisation :
  site-audit <url> [options]

Options :
  --only <liste>       catégories à vérifier, séparées par des virgules : seo,security,vuln (par défaut : toutes)
  --json               affiche le rapport complet en JSON
  --fail-on <niveau>   code de sortie 1 si un résultat atteint ce niveau : warn ou fail
  --timeout <ms>       délai maximal par requête en millisecondes (par défaut : 10000)
  -h, --help           affiche cette aide
  -v, --version        affiche la version

Codes de sortie :
  0  audit terminé (aucun seuil --fail-on atteint)
  1  un résultat atteint le niveau de --fail-on
  2  site injoignable ou arguments invalides

N'auditez que des sites dont vous êtes propriétaire ou que vous êtes autorisé à tester.

Exemples :
  site-audit example.com
  site-audit https://example.com --only seo,security
  site-audit https://example.com --json --fail-on fail > rapport.json`;

function fail(message: string): never {
  console.error(`site-audit : ${message}\nVoir site-audit --help.`);
  process.exit(2);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        only: { type: 'string' },
        json: { type: 'boolean' },
        'fail-on': { type: 'string' },
        timeout: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    });
  } catch (error) {
    fail(errorMessage(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return console.log(HELP);
  if (values.version) return console.log(VERSION);
  if (positionals.length !== 1) fail('indiquez une seule URL à auditer.');

  const categories = values.only ? values.only.split(',').map((c) => c.trim()) : CATEGORIES;
  const unknown = categories.filter((c) => !CATEGORIES.includes(c as Category));
  if (unknown.length || !categories.length) fail(`catégorie inconnue : ${unknown.join(', ')} (valeurs possibles : seo, security, vuln).`);
  const failOn = values['fail-on'];
  if (failOn !== undefined && failOn !== 'warn' && failOn !== 'fail') fail('--fail-on accepte warn ou fail.');
  const timeout = values.timeout === undefined ? 10_000 : Number(values.timeout);
  if (!Number.isInteger(timeout) || timeout <= 0) fail('--timeout attend un nombre de millisecondes positif.');

  const raw = positionals[0]!;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    fail(`URL invalide : ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail(`seuls http et https sont pris en charge : ${raw}`);

  let ctx;
  try {
    ctx = await buildContext(url, timeout);
  } catch (error) {
    console.error(`site-audit : impossible de joindre ${url.href} : ${errorMessage(error)}`);
    process.exit(2);
  }
  const selected = categories as Category[];
  const findings = await runChecks(ctx, ALL_CHECKS.filter((c) => selected.includes(c.category)));
  const report = buildReport(ctx, selected, findings);
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  console.log(values.json ? JSON.stringify(report, null, 2) : renderText(report, color));
  process.exitCode = exitCode(findings, failOn);
}

await main();
