# site-audit

Français | [English](README.en.md)

Outil en ligne de commande qui audite un site web dont vous êtes propriétaire sur trois axes : **SEO**, **sécurité** et **vulnérabilités connues**. Pour chaque point qui n'est pas au vert, il indique un correctif concret.

```
$ site-audit example.com
site-audit 0.1.0 - https://example.com/
Page analysée : https://example.com/ (HTTP 200, 0 redirection(s))

== SEO ==
  OK         Code HTTP de la page
             200 pour https://example.com/
  ATTENTION  Balise <title>
             "Example Domain" (14 caractères)
             Correctif : Ajuster le titre entre 30 et 60 caractères pour qu'il soit complet dans les résultats de recherche.
  ...

== Résumé ==
  SEO              score  76/100   11 OK, 7 ATTENTION, 1 ECHEC, 0 INFO
  Sécurité         score  68/100   5 OK, 5 ATTENTION, 1 ECHEC, 3 INFO
  Vulnérabilités   score 100/100   3 OK, 0 ATTENTION, 0 ECHEC, 1 INFO
```

## Installation

Node.js 22 ou plus récent est nécessaire.

```sh
git clone <dépôt> site-audit
cd site-audit
npm install
npm i -g .          # installe la commande site-audit
```

Sans installation globale, depuis le dossier du projet :

```sh
npx site-audit https://example.com
```

## Utilisation

```
site-audit <url> [--only seo,security,vuln] [--json] [--fail-on warn|fail] [--timeout <ms>]
```

| Option | Rôle |
| --- | --- |
| `<url>` | page à auditer ; `https://` est ajouté si aucun schéma n'est donné |
| `--only` | catégories à vérifier, séparées par des virgules (par défaut : toutes) |
| `--json` | rapport complet en JSON sur la sortie standard, rien d'autre |
| `--fail-on` | code de sortie 1 si un résultat atteint ce niveau (`warn` ou `fail`) |
| `--timeout` | délai maximal par requête, en millisecondes (par défaut : 10000) |
| `--help` | aide en français |

Exemples :

```sh
site-audit monsite.fr
site-audit https://monsite.fr/blog --only seo
site-audit https://monsite.fr --only security,vuln --fail-on fail
site-audit https://monsite.fr --json > rapport.json
```

La couleur est désactivée automatiquement quand la sortie n'est pas un terminal ou quand la variable `NO_COLOR` est définie.

## Vérifications

La page est téléchargée une seule fois et partagée entre les vérifications. Des requêtes supplémentaires ne sont faites que lorsqu'une vérification en a besoin (robots.txt, sitemap, fichiers sensibles, etc.) ; les vérifications s'exécutent l'une après l'autre, avec l'en-tête `User-Agent: site-audit/<version>`.

### SEO

- Code HTTP de la page finale, longueur de la chaîne de redirections (ATTENTION au-delà d'une), redirection HTTP -> HTTPS.
- `<title>` présent et de 30 à 60 caractères ; meta description de 70 à 160 caractères ; un seul `<h1>` ; attribut `lang` sur `<html>` ; meta viewport ; lien canonical présent et absolu ; `noindex` dans la meta robots ou l'en-tête `X-Robots-Tag` (ECHEC).
- `robots.txt` accessible, sans `Disallow: /` pour tous les robots, avec une ligne `Sitemap:` ; sitemap (celui de robots.txt, sinon `/sitemap.xml`) accessible et au format XML.
- Balises Open Graph `og:title`, `og:description`, `og:image` ; nombre d'images sans attribut `alt`.
- Performance : temps de réponse du serveur (TTFB), temps de téléchargement, taille du HTML, compression (`gzip`, `br`, `zstd`), en-têtes de cache.

### Sécurité

- HTTPS utilisé ; certificat TLS : jours avant expiration (ECHEC si expiré ou moins de 7 jours, ATTENTION sous 30 jours), émetteur, protocole négocié (ATTENTION sous TLS 1.2).
- HSTS avec un `max-age` d'au moins 6 mois (avec `includeSubDomains` et `preload` en information) ; Content-Security-Policy (ATTENTION si `unsafe-inline` ou `unsafe-eval` dans `script-src` ou `default-src`) ; `X-Content-Type-Options: nosniff` ; protection contre le clickjacking (`frame-ancestors` ou `X-Frame-Options`) ; `Referrer-Policy` ; `Permissions-Policy`.
- Chaque cookie déposé par la page : attributs `Secure`, `HttpOnly`, `SameSite`.
- Fuites d'informations : en-tête `Server` avec un numéro de version, `X-Powered-By`, `X-AspNet-Version`.
- Contenu mixte : scripts, styles, images et iframes chargés en `http://` sur une page HTTPS.
- Présence de `/.well-known/security.txt` (INFO si absent).

### Vulnérabilités

- Fichiers sensibles exposés : `/.git/HEAD`, `/.env`, `/.DS_Store`, `/phpinfo.php`, `/server-status`, `/wp-config.php.bak`, `/backup.zip`, `/.svn/entries`, `/composer.lock`, `/package.json`. Une requête GET par fichier, trois à la fois au plus. Pour éviter les faux positifs (pages 404 qui répondent 200, applications monopage), une URL aléatoire inexistante est d'abord demandée : une réponse identique est ignorée, et le contenu de chaque fichier est validé (`.git/HEAD` doit commencer par `ref:` ou être un hash, `.env` doit contenir des lignes `CLE=valeur`, etc.).
- Listage de répertoires (`Index of /`) sur la page et sur `/uploads/`, `/images/`, `/assets/`.
- Empreinte technologique : `<meta name="generator">` (WordPress, Joomla, Drupal et leur version) et bibliothèques JavaScript dont la version apparaît dans l'URL des scripts (`jquery-3.4.1.min.js`, `/jquery@3.4.1/`, `bootstrap/4.3.1/`, `?ver=3.7.1`). Pour chaque bibliothèque connue, la base [OSV](https://osv.dev) est interrogée et chaque vulnérabilité est listée avec son identifiant, son résumé et la version corrigée quand elle existe : ECHEC pour une gravité haute, critique ou inconnue, ATTENTION sinon. Si OSV est injoignable, un résultat INFO le signale.

Une erreur réseau dans une vérification devient un résultat INFO : l'audit va toujours jusqu'au bout.

## Format de sortie

Chaque résultat a la forme :

```json
{
  "id": "seo.title",
  "category": "seo",
  "level": "warn",
  "title": "Balise <title>",
  "detail": "\"Example Domain\" (14 caractères)",
  "fix": "Ajuster le titre entre 30 et 60 caractères pour qu'il soit complet dans les résultats de recherche."
}
```

- `category` : `seo`, `security` ou `vuln`.
- `level` : `pass` (OK), `warn` (ATTENTION), `fail` (ECHEC) ou `info` (INFO).
- `detail` : valeur mesurée ; `fix` : correctif, absent pour un résultat OK.

Avec `--json`, le rapport complet contient : `tool`, `version`, `date`, `url`, `finalUrl`, `status`, `redirects` (liste `{ url, status }`), `timings` (`ttfb` et `total` en ms), `categories`, `findings` et `summary` (par catégorie : `pass`, `warn`, `fail`, `info`, `score`).

## Codes de sortie et intégration continue

| Code | Signification |
| --- | --- |
| 0 | audit terminé, aucun seuil `--fail-on` atteint |
| 1 | au moins un résultat atteint le niveau de `--fail-on` |
| 2 | site injoignable ou arguments invalides |

Sans `--fail-on`, le code est 0 dès que le site répond. Exemple dans une CI :

```sh
site-audit https://preprod.monsite.fr --only security,vuln --fail-on fail
```

## Score

Pour chaque catégorie, chaque résultat OK vaut 1, ATTENTION 0,5 et ECHEC 0. Le score est la moyenne ramenée sur 100 et arrondie. Les résultats INFO ne comptent pas. Une catégorie sans résultat noté affiche `n/a`.

## Usage responsable

N'auditez que des sites dont vous êtes propriétaire ou que vous êtes autorisé à tester. Les vérifications de vulnérabilités sont passives et légères : une poignée de requêtes GET vers des chemins connus, sans tentative d'exploitation, d'authentification ou de contournement. Elles restent des requêtes que les outils de détection du site peuvent remarquer.

## Développement

```sh
npm install
npm test           # tests unitaires et d'intégration (serveur HTTP local, sans réseau)
npm run typecheck
npm run build      # compile src/ vers dist/
```

La variable d'environnement `SITE_AUDIT_OSV_URL` remplace l'adresse de l'API OSV ; elle sert aux tests.

## Licence

MIT, voir [LICENSE](LICENSE).
