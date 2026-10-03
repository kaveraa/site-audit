import { randomUUID } from 'node:crypto';
import type { Check, Finding, FetchResult, Level } from '../types.ts';
import { category, errorMessage } from '../finding.ts';
import { meta } from '../html.ts';
import { extractLibraries, fixedVersion } from '../libraries.ts';

const { f, check } = category('vuln');

const looksHtml = (body: string) => /^\s*</.test(body);
const jsonWith = (body: string, ...keys: string[]) => {
  try {
    const data: unknown = JSON.parse(body);
    return typeof data === 'object' && data !== null && keys.some((k) => k in data);
  } catch {
    return false;
  }
};

/** Sensitive files and a content test, so soft 404 pages and SPA fallbacks are not reported. */
export const SENSITIVE_FILES: { path: string; level: Level; test: (body: string) => boolean }[] = [
  { path: '/.git/HEAD', level: 'fail', test: (b) => /^(ref: refs\/\S+|[0-9a-f]{40})$/.test(b.trim()) },
  { path: '/.env', level: 'fail', test: (b) => !looksHtml(b) && /^\s*(export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/m.test(b) },
  { path: '/.DS_Store', level: 'warn', test: (b) => b.slice(4, 8) === 'Bud1' },
  { path: '/phpinfo.php', level: 'fail', test: (b) => /phpinfo\(\)|PHP Version \d/i.test(b) },
  { path: '/server-status', level: 'warn', test: (b) => /Apache Server Status|Server Version:/i.test(b) },
  { path: '/wp-config.php.bak', level: 'fail', test: (b) => /DB_(NAME|USER|PASSWORD)|define\s*\(/.test(b) },
  { path: '/backup.zip', level: 'fail', test: (b) => b.startsWith('PK\u0003\u0004') },
  { path: '/.svn/entries', level: 'fail', test: (b) => /^\d+\s*(\n|$)/.test(b) || /<wc-entries/.test(b) },
  { path: '/composer.lock', level: 'warn', test: (b) => jsonWith(b, 'packages', 'content-hash') },
  { path: '/package.json', level: 'warn', test: (b) => jsonWith(b, 'dependencies', 'devDependencies', 'scripts') },
];

const slug = (path: string) => path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const isListing = (body: string) => /<(title|h1)>\s*Index of \//i.test(body);

const SEVERITY: Record<string, [Level, string]> = {
  CRITICAL: ['fail', 'critique'], HIGH: ['fail', 'haute'], MODERATE: ['warn', 'moyenne'], MEDIUM: ['warn', 'moyenne'], LOW: ['warn', 'faible'],
};

export const vulnChecks: Check[] = [
  check('exposed-files', async (ctx) => {
    const baseline = await ctx.get(`/site-audit-${randomUUID()}`);
    const sameAsBaseline = (r: FetchResult) => r.status === baseline.status && r.body === baseline.body;
    const results: { file: (typeof SENSITIVE_FILES)[number]; exposed?: boolean; error?: string }[] = [];
    for (const file of SENSITIVE_FILES) {
      try {
        const res = await ctx.get(file.path);
        results.push({ file, exposed: res.status === 200 && !sameAsBaseline(res) && file.test(res.body) });
      } catch (error) {
        results.push({ file, error: errorMessage(error) });
      }
    }
    const findings: Finding[] = results.filter((r) => r.exposed).map(({ file }) =>
      f(`exposed.${slug(file.path)}`, file.level, `Fichier sensible exposé : ${file.path}`, `${new URL(file.path, ctx.url).href} est accessible publiquement`,
        `Supprimer ${file.path} du serveur ou en bloquer l'accès (réponse 403 ou 404) dans la configuration du serveur web.`));
    const failed = results.filter((r) => r.error);
    if (!findings.length) findings.push(f('exposed-files', 'pass', 'Fichiers sensibles', `Aucun des ${SENSITIVE_FILES.length - failed.length} fichiers testés n'est exposé`));
    if (failed.length) findings.push(f('exposed-files-errors', 'info', 'Fichiers sensibles non vérifiés', failed.map((r) => `${r.file.path} (${r.error})`).join(', ')));
    if (baseline.status === 200) {
      findings.push(f('soft-404', 'info', 'Réponse 200 pour une page inexistante', 'Le site renvoie 200 au lieu de 404 (les fichiers sont validés par leur contenu)',
        'Renvoyer un vrai code 404 pour les URL inexistantes, ce qui aide aussi le référencement.'));
    }
    return findings;
  }),

  check('directory-listing', async (ctx) => {
    const listed = isListing(ctx.html) ? [ctx.url.pathname] : [];
    for (const dir of ['/uploads/', '/images/', '/assets/']) {
      try {
        const res = await ctx.get(dir);
        if (res.status === 200 && isListing(res.body)) listed.push(dir);
      } catch {}
    }
    return [f('directory-listing', listed.length ? 'fail' : 'pass', 'Listage de répertoires',
      listed.length ? `Contenu listé publiquement : ${listed.join(', ')}` : 'Aucun listage de répertoire détecté',
      'Désactiver le listage (Options -Indexes pour Apache, autoindex off pour nginx).')];
  }),

  check('generator', (ctx) => {
    const generator = meta(ctx.doc, 'generator');
    if (!generator) return [f('generator', 'pass', 'Version du CMS', 'Aucune balise meta generator')];
    const cms = /wordpress|joomla|drupal/i.exec(generator)?.[0];
    const versioned = /\d+\.\d+/.test(generator);
    return [f('generator', versioned ? 'warn' : 'info', 'Version du CMS', `${cms ? `${cms} détecté, ` : ''}meta generator : "${generator}"`,
      'Retirer la balise <meta name="generator"> (ou au moins la version) et garder le CMS et ses extensions à jour.')];
  }),

  check('libraries', async (ctx) => {
    const sources = ctx.doc.querySelectorAll('script').flatMap((s) => {
      const src = s.getAttribute('src');
      if (!src) return [];
      try {
        return [new URL(src, ctx.url).href];
      } catch {
        return [];
      }
    });
    const libraries = extractLibraries(sources);
    if (!libraries.length) return [f('libraries', 'info', 'Bibliothèques JavaScript', 'Aucune bibliothèque connue avec une version visible dans les URL de scripts')];
    const findings: Finding[] = [];
    for (const lib of libraries) {
      const label = `${lib.name} ${lib.version}`;
      let vulns;
      try {
        vulns = await ctx.osv(lib.name, lib.version);
      } catch (error) {
        findings.push(f(`osv.${lib.name}`, 'info', `${label} : base OSV injoignable`, `Vulnérabilités non vérifiées (${errorMessage(error)})`));
        continue;
      }
      if (!vulns.length) findings.push(f(`lib.${lib.name}`, 'pass', label, 'Aucune vulnérabilité connue dans OSV'));
      for (const vuln of vulns) {
        const [level, severity] = SEVERITY[vuln.database_specific?.severity?.toUpperCase() ?? ''] ?? ['fail', 'inconnue'];
        const fixed = fixedVersion(vuln, lib);
        const summary = vuln.summary ?? vuln.details?.split('\n')[0] ?? 'Vulnérabilité connue';
        findings.push(f(`osv.${lib.name}.${vuln.id}`, level, `${label} : ${vuln.id}`, `${summary} (gravité : ${severity})`,
          fixed ? `Mettre à jour ${lib.name} vers la version ${fixed} ou plus récente.` : `Aucune version corrigée connue : consulter https://osv.dev/vulnerability/${vuln.id} et remplacer ${lib.name}.`));
      }
    }
    return findings;
  }),
];
