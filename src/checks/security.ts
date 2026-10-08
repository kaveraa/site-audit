import type { Check, Context, Finding, TlsInfo } from '../types.ts';
import { category } from '../finding.ts';

const { f, check } = category('security');

const DAY = 86_400_000;
const isHttps = (ctx: Context) => ctx.url.protocol === 'https:';

/** CSP directives as name -> value. Several policies (comma-separated) are merged. */
export function parseCsp(csp: string): Map<string, string> {
  const directives = new Map<string, string>();
  for (const part of csp.split(/[;,]/)) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives.set(name.toLowerCase(), `${directives.get(name.toLowerCase()) ?? ''} ${values.join(' ')}`.trim());
  }
  return directives;
}

/** Findings on the certificate and protocol of an HTTPS site. */
export function tlsFindings(tls: TlsInfo): Finding[] {
  const findings: Finding[] = [
    tls.error
      ? f('tls-valid', 'fail', 'Validité du certificat', `Certificat refusé par les navigateurs (${tls.error})`,
        'Installer un certificat valide pour ce nom de domaine, signé par une autorité reconnue (par exemple Let\'s Encrypt), avec la chaîne intermédiaire complète.')
      : f('tls-valid', 'pass', 'Validité du certificat', 'Certificat reconnu par les navigateurs'),
  ];
  if (Number.isNaN(tls.validTo.getTime())) {
    findings.push(f('tls-expiry', 'info', 'Expiration du certificat', 'Date d\'expiration illisible'));
  } else {
    const days = Math.floor((tls.validTo.getTime() - Date.now()) / DAY);
    const date = tls.validTo.toISOString().slice(0, 10);
    findings.push(f('tls-expiry', days < 7 ? 'fail' : days < 30 ? 'warn' : 'pass', 'Expiration du certificat',
      days < 0 ? `Expiré depuis le ${date}` : `Expire le ${date} (dans ${days} jours)`,
      'Renouveler le certificat et automatiser le renouvellement (ACME, certbot).'));
  }
  findings.push(f('tls-issuer', 'info', 'Émetteur du certificat', tls.issuer));
  const old = !tls.protocol || ['SSLv2', 'SSLv3', 'TLSv1', 'TLSv1.1'].includes(tls.protocol);
  findings.push(f('tls-protocol', old ? 'warn' : 'pass', 'Protocole TLS négocié', tls.protocol ?? 'inconnu',
    'Activer TLS 1.2 et 1.3 sur le serveur et désactiver les versions plus anciennes.'));
  return findings;
}

export const securityChecks: Check[] = [
  check('https', (ctx) => [
    isHttps(ctx)
      ? f('https', 'pass', 'Connexion HTTPS', 'La page est servie en HTTPS')
      : f('https', 'fail', 'Connexion HTTPS', 'La page est servie en HTTP, sans chiffrement',
        'Installer un certificat TLS (par exemple Let\'s Encrypt) et rediriger tout le trafic vers HTTPS.'),
  ]),

  check('tls', async (ctx) => (isHttps(ctx) ? tlsFindings(await ctx.tls()) : [])),

  check('hsts', (ctx) => {
    if (!isHttps(ctx)) return [];
    const hsts = ctx.headers.get('strict-transport-security');
    const fix = 'Ajouter l\'en-tête Strict-Transport-Security: max-age=31536000; includeSubDomains.';
    if (!hsts) return [f('hsts', 'fail', 'HSTS (Strict-Transport-Security)', 'En-tête absent', fix)];
    const maxAge = Number(/max-age\s*=\s*"?(\d+)/i.exec(hsts)?.[1] ?? 0);
    return [
      f('hsts', maxAge >= 15_552_000 ? 'pass' : 'warn', 'HSTS (Strict-Transport-Security)',
        `max-age=${maxAge} (${Math.floor(maxAge / 86_400)} jours)`, 'Porter max-age à au moins 15552000 (6 mois), idéalement 31536000.'),
      f('hsts-options', 'info', 'Options HSTS',
        `includeSubDomains : ${/includesubdomains/i.test(hsts) ? 'oui' : 'non'}, preload : ${/preload/i.test(hsts) ? 'oui' : 'non'}`),
    ];
  }),

  check('csp', (ctx) => {
    const csp = ctx.headers.get('content-security-policy');
    if (!csp) {
      const reportOnly = ctx.headers.has('content-security-policy-report-only');
      return [f('csp', 'warn', 'Content-Security-Policy', reportOnly ? 'Seule une politique report-only est présente' : 'En-tête absent',
        'Définir une Content-Security-Policy, en partant de default-src \'self\' puis en autorisant explicitement les domaines utiles.')];
    }
    const directives = parseCsp(csp);
    const scripts = `${directives.get('script-src') ?? ''} ${directives.get('default-src') ?? ''}`;
    const unsafe = ['unsafe-inline', 'unsafe-eval'].filter((k) => scripts.includes(`'${k}'`));
    return [f('csp', unsafe.length ? 'warn' : 'pass', 'Content-Security-Policy',
      unsafe.length ? `script-src/default-src autorise ${unsafe.map((k) => `'${k}'`).join(' et ')}` : 'Présente, sans unsafe-inline ni unsafe-eval pour les scripts',
      'Remplacer \'unsafe-inline\' par des nonces ou des hash, et supprimer \'unsafe-eval\' (éviter eval et new Function).')];
  }),

  check('nosniff', (ctx) => {
    const value = ctx.headers.get('x-content-type-options');
    return [f('nosniff', value?.toLowerCase() === 'nosniff' ? 'pass' : 'warn', 'X-Content-Type-Options', value ?? 'En-tête absent',
      'Ajouter l\'en-tête X-Content-Type-Options: nosniff.')];
  }),

  check('clickjacking', (ctx) => {
    const ancestors = parseCsp(ctx.headers.get('content-security-policy') ?? '').get('frame-ancestors');
    const xfo = ctx.headers.get('x-frame-options');
    const ok = ancestors !== undefined || /^(deny|sameorigin)$/i.test(xfo?.trim() ?? '');
    const detail = ancestors !== undefined ? `frame-ancestors ${ancestors}` : xfo ? `X-Frame-Options: ${xfo}` : 'Ni frame-ancestors ni X-Frame-Options';
    return [f('clickjacking', ok ? 'pass' : 'warn', 'Protection contre le clickjacking', detail,
      'Ajouter frame-ancestors \'self\' à la CSP (ou l\'en-tête X-Frame-Options: SAMEORIGIN).')];
  }),

  check('referrer-policy', (ctx) => {
    const value = ctx.headers.get('referrer-policy');
    const ok = Boolean(value && !/unsafe-url/i.test(value));
    return [f('referrer-policy', ok ? 'pass' : 'warn', 'Referrer-Policy', value ?? 'En-tête absent',
      'Ajouter l\'en-tête Referrer-Policy: strict-origin-when-cross-origin.')];
  }),

  check('permissions-policy', (ctx) => {
    const value = ctx.headers.get('permissions-policy');
    return [f('permissions-policy', value ? 'pass' : 'warn', 'Permissions-Policy', value ?? 'En-tête absent',
      'Ajouter un en-tête Permissions-Policy qui coupe les API inutiles, par exemple camera=(), microphone=(), geolocation=().')];
  }),

  check('cookies', (ctx) => {
    const cookies = ctx.headers.getSetCookie();
    if (!cookies.length) return [f('cookies', 'info', 'Cookies', 'Aucun cookie déposé par la page')];
    return cookies.map((cookie) => {
      const [pair = '', ...attrs] = cookie.split(';');
      const name = pair.split('=')[0]!.trim();
      const flags = attrs.map((a) => a.trim().split('=')[0]!.toLowerCase());
      const missing = (['Secure', 'HttpOnly', 'SameSite'] as const).filter((flag) => !flags.includes(flag.toLowerCase()));
      return f(`cookie.${name}`, missing.length ? 'warn' : 'pass', `Cookie "${name}"`,
        missing.length ? `Attributs manquants : ${missing.join(', ')}` : 'Secure, HttpOnly et SameSite présents',
        `Ajouter ${missing.join(', ')} au cookie, par exemple Set-Cookie: ${name}=...; Secure; HttpOnly; SameSite=Lax (sans HttpOnly seulement si le JavaScript doit le lire).`);
    });
  }),

  check('leaks', (ctx) => {
    const leaks: string[] = [];
    const server = ctx.headers.get('server');
    if (server && /\d/.test(server)) leaks.push(`Server: ${server}`);
    for (const name of ['X-Powered-By', 'X-AspNet-Version', 'X-AspNetMvc-Version']) {
      const value = ctx.headers.get(name);
      if (value) leaks.push(`${name}: ${value}`);
    }
    return [f('leaks', leaks.length ? 'warn' : 'pass', 'Fuite d\'informations techniques',
      leaks.length ? leaks.join(', ') : 'Aucune version de logiciel exposée dans les en-têtes',
      'Masquer ces en-têtes (server_tokens off pour nginx, ServerTokens Prod pour Apache, expose_php = Off pour PHP).')];
  }),

  check('mixed-content', (ctx) => {
    if (!isHttps(ctx)) return [];
    const insecure = (value: string | undefined) => Boolean(value && /^http:\/\//i.test(value.trim()));
    const active = [
      ...ctx.doc.querySelectorAll('script, iframe').map((el) => el.getAttribute('src')),
      ...ctx.doc.querySelectorAll('link').filter((l) => /stylesheet/i.test(l.getAttribute('rel') ?? '')).map((l) => l.getAttribute('href')),
    ].filter(insecure) as string[];
    const passive = ctx.doc.querySelectorAll('img').map((el) => el.getAttribute('src')).filter(insecure) as string[];
    const all = [...active, ...passive];
    return [f('mixed-content', active.length ? 'fail' : passive.length ? 'warn' : 'pass', 'Contenu mixte',
      all.length ? `${all.length} ressource(s) en http:// : ${all.slice(0, 3).join(', ')}${all.length > 3 ? ', ...' : ''}` : 'Aucune ressource chargée en http://',
      'Charger ces ressources en https:// ; le navigateur bloque les scripts, styles et iframes en HTTP sur une page HTTPS.')];
  }),

  check('security-txt', async (ctx) => {
    const res = await ctx.get('/.well-known/security.txt', { follow: true });
    const ok = res.status === 200 && /^contact\s*:/im.test(res.body);
    return [f('security-txt', ok ? 'pass' : 'info', 'Fichier security.txt',
      ok ? '/.well-known/security.txt présent' : `Absent (code ${res.status})`,
      'Publier /.well-known/security.txt avec au moins Contact: et Expires: (voir securitytxt.org).')];
  }),
];
