import type { Check, Context } from '../types.ts';
import { category } from '../finding.ts';
import { clean, length, meta } from '../html.ts';

const { f, check } = category('seo');

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1).replace('.', ',')} Ko`;
const ms = (value: number) => `${Math.round(value)} ms`;

/** True when a robots.txt group for all agents disallows the whole site. */
export function blocksAll(robots: string): boolean {
  let agents: string[] = [];
  let inRules = false;
  for (const raw of robots.split(/\r?\n/)) {
    const m = /^([\w-]+)\s*:\s*(.*)$/.exec(raw.replace(/#.*/, '').trim());
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === 'user-agent') {
      if (inRules) [agents, inRules] = [[], false];
      agents.push(value);
    } else {
      inRules = true;
      if (key === 'disallow' && value === '/' && agents.includes('*')) return true;
    }
  }
  return false;
}

export const sitemapUrls = (robots: string) =>
  [...robots.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]!);

async function robotsTxt(ctx: Context) {
  const res = await ctx.get('/robots.txt', { follow: true });
  return { status: res.status, body: res.status === 200 && !/^\s*</.test(res.body) ? res.body : null };
}

export const seoChecks: Check[] = [
  check('status', (ctx) => {
    const ok = ctx.status >= 200 && ctx.status < 300;
    return [f('status', ok ? 'pass' : 'fail', 'Code HTTP de la page', `${ctx.status} pour ${ctx.url.href}`,
      'Faire répondre la page avec un code 200 : corriger l\'erreur serveur ou la ressource manquante.')];
  }),

  check('redirects', (ctx) => {
    const hops = ctx.redirects.length;
    const chain = [...ctx.redirects.map((h) => `${h.url} (${h.status})`), ctx.url.href].join(' -> ');
    return [f('redirects', hops > 1 ? 'warn' : 'pass', 'Chaîne de redirections',
      hops === 0 ? 'Aucune redirection' : `${hops} redirection(s) : ${chain}`,
      'Faire pointer les liens et la première redirection directement vers l\'URL finale (une redirection au plus).')];
  }),

  check('https-redirect', async (ctx) => {
    const title = 'Redirection HTTP -> HTTPS';
    if (ctx.url.protocol !== 'https:') {
      return [f('https-redirect', 'warn', title, 'La page finale est servie en HTTP',
        'Servir le site en HTTPS et rediriger tout le trafic HTTP vers HTTPS (301).')];
    }
    if (ctx.startUrl.protocol === 'http:') return [f('https-redirect', 'pass', title, `${ctx.startUrl.href} redirige vers HTTPS`)];
    const http = new URL(ctx.url);
    http.protocol = 'http:';
    http.port = '';
    const res = await ctx.get(http.href);
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location && new URL(location, http).protocol === 'https:') {
      return [f('https-redirect', 'pass', title, `${http.href} -> ${res.status} ${location}`)];
    }
    return [f('https-redirect', 'warn', title, `${http.href} répond ${res.status} sans rediriger vers HTTPS`,
      'Rediriger toutes les URL HTTP vers leur équivalent HTTPS avec un code 301.')];
  }),

  check('title', (ctx) => {
    const title = clean(ctx.doc.querySelector('title')?.text ?? '');
    if (!title) return [f('title', 'fail', 'Balise <title>', 'Absente ou vide', 'Ajouter un <title> unique et descriptif de 30 à 60 caractères.')];
    const n = length(title);
    return [f('title', n >= 30 && n <= 60 ? 'pass' : 'warn', 'Balise <title>', `"${title}" (${n} caractères)`,
      'Ajuster le titre entre 30 et 60 caractères pour qu\'il soit complet dans les résultats de recherche.')];
  }),

  check('description', (ctx) => {
    const desc = clean(meta(ctx.doc, 'description') ?? '');
    if (!desc) return [f('description', 'warn', 'Meta description', 'Absente ou vide',
      'Ajouter <meta name="description" content="..."> de 70 à 160 caractères qui résume la page.')];
    const n = length(desc);
    return [f('description', n >= 70 && n <= 160 ? 'pass' : 'warn', 'Meta description', `${n} caractères : "${desc}"`,
      'Ajuster la description entre 70 et 160 caractères.')];
  }),

  check('h1', (ctx) => {
    const n = ctx.doc.querySelectorAll('h1').length;
    return [f('h1', n === 1 ? 'pass' : n === 0 ? 'fail' : 'warn', 'Titre <h1>', `${n} balise(s) <h1>`,
      n === 0 ? 'Ajouter un <h1> qui décrit le sujet principal de la page.' : 'Garder un seul <h1> par page et passer les autres en <h2>.')];
  }),

  check('lang', (ctx) => {
    const lang = ctx.doc.querySelector('html')?.getAttribute('lang')?.trim();
    return [f('lang', lang ? 'pass' : 'warn', 'Langue du document', lang ? `lang="${lang}"` : 'Attribut lang absent sur <html>',
      'Déclarer la langue : <html lang="fr">.')];
  }),

  check('viewport', (ctx) => {
    const viewport = meta(ctx.doc, 'viewport');
    return [f('viewport', viewport ? 'pass' : 'fail', 'Meta viewport', viewport ?? 'Absente',
      'Ajouter <meta name="viewport" content="width=device-width, initial-scale=1"> pour l\'affichage mobile.')];
  }),

  check('canonical', (ctx) => {
    const link = ctx.doc.querySelectorAll('link').find((l) => l.getAttribute('rel')?.toLowerCase().split(/\s+/).includes('canonical'));
    const href = link?.getAttribute('href')?.trim();
    if (!href) return [f('canonical', 'warn', 'Lien canonical', 'Absent',
      `Ajouter <link rel="canonical" href="${ctx.url.href}"> pour indiquer l'URL de référence.`)];
    const absolute = /^https?:\/\//i.test(href);
    return [f('canonical', absolute ? 'pass' : 'warn', 'Lien canonical', href, 'Utiliser une URL absolue (avec https:// et le domaine) dans le lien canonical.')];
  }),

  check('noindex', (ctx) => {
    const sources = [meta(ctx.doc, 'robots') && `meta robots : ${meta(ctx.doc, 'robots')}`, ctx.headers.get('x-robots-tag') && `X-Robots-Tag : ${ctx.headers.get('x-robots-tag')}`]
      .filter((s): s is string => Boolean(s));
    const blocked = sources.filter((s) => /noindex/i.test(s));
    return [f('noindex', blocked.length ? 'fail' : 'pass', 'Indexation autorisée',
      blocked.length ? `La page demande à ne pas être indexée (${blocked.join(', ')})` : sources.join(', ') || 'Aucune directive noindex',
      'Retirer noindex de la balise meta robots et de l\'en-tête X-Robots-Tag si la page doit apparaître dans les moteurs.')];
  }),

  check('robots-txt', async (ctx) => {
    const robots = await robotsTxt(ctx);
    if (robots.body === null) return [f('robots-txt', 'warn', 'robots.txt', `Introuvable (code ${robots.status})`,
      'Publier un fichier /robots.txt, même minimal, avec une ligne Sitemap:.')];
    const sitemaps = sitemapUrls(robots.body);
    return [
      blocksAll(robots.body)
        ? f('robots-txt', 'fail', 'robots.txt', 'Disallow: / pour tous les robots : le site entier est bloqué', 'Retirer "Disallow: /" du groupe "User-agent: *".')
        : f('robots-txt', 'pass', 'robots.txt', 'Accessible et n\'interdit pas tout le site'),
      f('robots-sitemap', sitemaps.length ? 'pass' : 'warn', 'Sitemap déclaré dans robots.txt',
        sitemaps.length ? sitemaps.join(', ') : 'Aucune ligne Sitemap:', `Ajouter "Sitemap: ${new URL('/sitemap.xml', ctx.url).href}" dans robots.txt.`),
    ];
  }),

  check('sitemap', async (ctx) => {
    const robots = await robotsTxt(ctx);
    const url = (robots.body && sitemapUrls(robots.body)[0]) || new URL('/sitemap.xml', ctx.url).href;
    const res = await ctx.get(url, { follow: true });
    const xml = res.status === 200 && /<(urlset|sitemapindex)[\s>]/i.test(res.body);
    return [f('sitemap', xml ? 'pass' : 'warn', 'Sitemap XML',
      xml ? `${url} accessible` : `${url} : code ${res.status}${res.status === 200 ? ', contenu non XML' : ''}`,
      'Générer un sitemap XML (<urlset>) listant les pages à indexer et le déclarer dans robots.txt.')];
  }),

  check('open-graph', (ctx) => {
    const missing = ['og:title', 'og:description', 'og:image'].filter((p) => !meta(ctx.doc, p));
    return [f('open-graph', missing.length ? 'warn' : 'pass', 'Balises Open Graph',
      missing.length ? `Manquantes : ${missing.join(', ')}` : 'og:title, og:description et og:image présentes',
      `Ajouter ${missing.map((p) => `<meta property="${p}" content="...">`).join(', ')} pour soigner l'aperçu sur les réseaux sociaux.`)];
  }),

  check('img-alt', (ctx) => {
    const images = ctx.doc.querySelectorAll('img');
    const missing = images.filter((img) => !img.hasAttribute('alt')).length;
    return [f('img-alt', missing ? 'warn' : 'pass', 'Attribut alt des images', `${missing} image(s) sans alt sur ${images.length}`,
      'Ajouter un attribut alt descriptif à chaque image (alt="" pour une image décorative).')];
  }),

  check('ttfb', (ctx) => {
    const t = ctx.timings.ttfb;
    return [f('ttfb', t <= 600 ? 'pass' : t <= 1500 ? 'warn' : 'fail', 'Temps de réponse du serveur (TTFB)', ms(t),
      'Réduire le temps de génération de la page : cache côté serveur, CDN, requêtes plus légères.')];
  }),

  check('download', (ctx) => {
    const t = ctx.timings.total;
    return [f('download', t <= 2000 ? 'pass' : t <= 5000 ? 'warn' : 'fail', 'Temps de téléchargement de la page', ms(t),
      'Alléger la page HTML et activer la compression et un CDN.')];
  }),

  check('html-size', (ctx) => [
    f('html-size', ctx.bytes <= 500 * 1024 ? 'pass' : 'warn', 'Taille du HTML', kb(ctx.bytes),
      'Réduire le HTML : retirer le CSS/JS en ligne volumineux, paginer les longues listes.'),
  ]),

  check('compression', (ctx) => {
    const encoding = ctx.headers.get('content-encoding')?.toLowerCase();
    const ok = Boolean(encoding && /\b(gzip|br|zstd|deflate)\b/.test(encoding));
    return [f('compression', ok ? 'pass' : 'warn', 'Compression', ok ? `content-encoding: ${encoding}` : 'Page servie sans compression',
      'Activer la compression gzip ou Brotli sur le serveur (par exemple gzip on; dans nginx).')];
  }),

  check('cache', (ctx) => {
    const found = ['cache-control', 'etag', 'last-modified'].filter((h) => ctx.headers.has(h)).map((h) => `${h}: ${ctx.headers.get(h)}`);
    return [f('cache', found.length ? 'pass' : 'warn', 'En-têtes de cache', found.join(', ') || 'Aucun en-tête Cache-Control, ETag ou Last-Modified',
      'Ajouter Cache-Control (par exemple "public, max-age=300") et ETag pour permettre la revalidation.')];
  }),
];
