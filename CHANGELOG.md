# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Banner at the top of the README files.

### Changed

- The default README is now in English (`README.md`), the French version is in `README.fr.md`.

- A TLS certificate refused by browsers (expired, self-signed, wrong host name, incomplete chain) is a security failure. When it blocks the page, the report shows the certificate findings instead of exiting with code 2.

## [0.1.0] - 2026-10-04

### Added

- `site-audit <url>` command with `--only`, `--json`, `--fail-on` and `--timeout`.
- SEO checks: status, redirects, HTTP to HTTPS redirect, title, meta description, h1, lang, viewport, canonical, noindex, robots.txt, sitemap, Open Graph, image alt, response time, size, compression, cache headers.
- Security checks: HTTPS, TLS certificate expiry, issuer and protocol, HSTS, CSP, nosniff, clickjacking, Referrer-Policy, Permissions-Policy, cookie flags, information leaks, mixed content, security.txt.
- Vulnerability checks: exposed sensitive files with soft 404 protection, directory listing, meta generator, JavaScript libraries checked against OSV.
- French terminal output with a score out of 100 per category, JSON report, exit codes for CI.
