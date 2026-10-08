# Changelog

**FR** Toutes les évolutions notables du paquet sont listées ici. Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le projet respecte le [versionnage sémantique](https://semver.org/lang/fr/).

**EN** All important changes of the package are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-08

### Ajouté / Added

- **FR** Commande `site-audit <url>` avec `--only`, `--json`, `--fail-on` et `--timeout`, sortie en français avec un score sur 100 par axe, rapport JSON et codes de sortie pour la CI.
  **EN** `site-audit <url>` command with `--only`, `--json`, `--fail-on` and `--timeout`, French output with a score out of 100 per axis, JSON report and exit codes for CI.
- **FR** SEO : statut, redirections, passage de HTTP à HTTPS, title, meta description, h1, lang, viewport, canonical, noindex, robots.txt, sitemap, Open Graph, alt des images, temps de réponse, poids, compression, en-têtes de cache.
  **EN** SEO: status, redirects, HTTP to HTTPS redirect, title, meta description, h1, lang, viewport, canonical, noindex, robots.txt, sitemap, Open Graph, image alt, response time, size, compression, cache headers.
- **FR** Sécurité : HTTPS, certificat TLS (refusé par les navigateurs, expiration, émetteur, protocole), HSTS, CSP, nosniff, clickjacking, Referrer-Policy, Permissions-Policy, drapeaux des cookies, fuites d'informations techniques, contenu mixte, security.txt.
  **EN** Security: HTTPS, TLS certificate (refused by browsers, expiry, issuer, protocol), HSTS, CSP, nosniff, clickjacking, Referrer-Policy, Permissions-Policy, cookie flags, technical information leaks, mixed content, security.txt.
- **FR** Un certificat refusé qui bloque la page, directement ou après une redirection depuis HTTP, donne un rapport de sécurité au lieu d'un échec.
  **EN** A refused certificate that blocks the page, directly or after a redirect from HTTP, gives a security report instead of a failure.
- **FR** L'interception du HTTPS par un antivirus ou un proxy (Norton, Avast, Kaspersky, ESET, Bitdefender, Zscaler...) est signalée ; l'expiration et le protocole ne sont alors pas notés.
  **EN** HTTPS interception by an antivirus or proxy (Norton, Avast, Kaspersky, ESET, Bitdefender, Zscaler...) is reported; expiry and protocol are then not scored.
- **FR** Vulnérabilités : fichiers sensibles exposés avec protection contre les fausses 404, listing de dossier, meta generator, bibliothèques JavaScript vérifiées dans la base OSV (toutes les pages de résultats).
  **EN** Vulnerabilities: exposed sensitive files with soft 404 protection, directory listing, meta generator, JavaScript libraries checked against the OSV database (every page of results).
