# site-audit

[Français](README.md) | English

A command-line tool that audits a website you own on three axes: **SEO**, **security** and **known vulnerabilities**. For every point that is not green, it gives a concrete fix.

The terminal output is in French.

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

## Install

You need Node.js 22 or newer.

```sh
git clone <repository> site-audit
cd site-audit
npm install
npm i -g .          # installs the site-audit command
```

Without a global install, from the project folder:

```sh
npx site-audit https://example.com
```

## Usage

```
site-audit <url> [--only seo,security,vuln] [--json] [--fail-on warn|fail] [--timeout <ms>]
```

| Option | Purpose |
| --- | --- |
| `<url>` | page to audit; `https://` is added when no scheme is given |
| `--only` | comma-separated categories to check (default: all) |
| `--json` | full report as JSON on stdout, nothing else |
| `--fail-on` | exit code 1 if a finding is at or above this level (`warn` or `fail`) |
| `--timeout` | maximum time per request, in milliseconds (default: 10000) |
| `--help` | help (in French) |

Examples:

```sh
site-audit mysite.com
site-audit https://mysite.com/blog --only seo
site-audit https://mysite.com --only security,vuln --fail-on fail
site-audit https://mysite.com --json > report.json
```

Colour is turned off when stdout is not a terminal or when `NO_COLOR` is set.

## Checks

The page is downloaded once and shared by all checks. Extra requests are made only when a check needs them (robots.txt, sitemap, sensitive files, and so on); checks run one after another, with the header `User-Agent: site-audit/<version>`.

### SEO

- HTTP status of the final page, redirect chain length (warn above one hop), HTTP -> HTTPS redirect.
- `<title>` present and 30 to 60 characters; meta description of 70 to 160 characters; exactly one `<h1>`; `lang` attribute on `<html>`; meta viewport; canonical link present and absolute; `noindex` in meta robots or the `X-Robots-Tag` header (fail).
- `robots.txt` reachable, no `Disallow: /` for all agents, with a `Sitemap:` line; sitemap (from robots.txt, else `/sitemap.xml`) reachable and in XML.
- Open Graph tags `og:title`, `og:description`, `og:image`; number of images without `alt`.
- Performance: time to first byte, download time, HTML size, compression (`gzip`, `br`, `zstd`), cache headers.

### Security

- HTTPS used; TLS certificate: trusted or refused by browsers (fail if refused: expired, self-signed, wrong host name, incomplete chain), days until expiry (fail if expired or under 7 days, warn under 30), issuer, negotiated protocol (warn below TLS 1.2).
- HSTS with `max-age` of at least 6 months (`includeSubDomains` and `preload` as info); Content-Security-Policy (warn on `unsafe-inline` or `unsafe-eval` in `script-src` or `default-src`); `X-Content-Type-Options: nosniff`; clickjacking protection (`frame-ancestors` or `X-Frame-Options`); `Referrer-Policy`; `Permissions-Policy`.
- Every cookie set by the page: `Secure`, `HttpOnly`, `SameSite` flags.
- Information leaks: `Server` header with a version number, `X-Powered-By`, `X-AspNet-Version`.
- Mixed content: scripts, styles, images and iframes loaded over `http://` on an HTTPS page.
- `/.well-known/security.txt` present (info if missing).

### Vulnerabilities

- Exposed sensitive files: `/.git/HEAD`, `/.env`, `/.DS_Store`, `/phpinfo.php`, `/server-status`, `/wp-config.php.bak`, `/backup.zip`, `/.svn/entries`, `/composer.lock`, `/package.json`. One GET per file, one after another. To avoid false positives (soft 404 pages, single page apps), a random missing URL is fetched first: an identical response is ignored, and the content of each file is validated (`.git/HEAD` must start with `ref:` or be a hash, `.env` must have `KEY=value` lines, and so on).
- Directory listing (`Index of /`) on the page and on `/uploads/`, `/images/`, `/assets/`.
- Technology fingerprint: `<meta name="generator">` (WordPress, Joomla, Drupal and their version) and JavaScript libraries whose version shows in script URLs (`jquery-3.4.1.min.js`, `/jquery@3.4.1/`, `bootstrap/4.3.1/`, `?ver=3.7.1`). For each known library the [OSV](https://osv.dev) database is queried, and each vulnerability is listed with its id, summary and fixed version when there is one: fail for high, critical or unknown severity, warn otherwise. If OSV cannot be reached, an info finding says so.

A network error in one check becomes an info finding: the audit always completes.

## Output format

Each finding looks like:

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

- `category`: `seo`, `security` or `vuln`.
- `level`: `pass` (OK), `warn` (ATTENTION), `fail` (ECHEC) or `info` (INFO).
- `detail`: measured value; `fix`: the fix, missing for a pass.

With `--json`, the full report has: `tool`, `version`, `date`, `url`, `finalUrl`, `status`, `redirects` (list of `{ url, status }`), `timings` (`ttfb` and `total` in ms), `categories`, `findings` and `summary` (per category: `pass`, `warn`, `fail`, `info`, `score`).

## Exit codes and CI

| Code | Meaning |
| --- | --- |
| 0 | audit done, no `--fail-on` threshold reached |
| 1 | at least one finding is at the `--fail-on` level or above |
| 2 | site unreachable or invalid arguments (a refused certificate gives a security report, not this code) |

Without `--fail-on`, the code is 0 as soon as the site answers. Example in CI:

```sh
site-audit https://staging.mysite.com --only security,vuln --fail-on fail
```

## Score

In each category, a pass is worth 1, a warn 0.5 and a fail 0. The score is the average scaled to 100 and rounded. Info findings do not count. A category with no scored finding shows `n/a`.

## Responsible use

Only audit sites you own or are allowed to test. The vulnerability checks are passive and light: a handful of GET requests to well-known paths, with no attempt to exploit, log in or bypass anything. They are still requests that the site's monitoring may notice.

## Development

```sh
npm install
npm test           # unit and integration tests (local HTTP server, no network)
npm run typecheck
npm run build      # compiles src/ to dist/
```

The `SITE_AUDIT_OSV_URL` environment variable replaces the OSV API address; it is used by the tests.

## License

MIT, see [LICENSE](LICENSE).
