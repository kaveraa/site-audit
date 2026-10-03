import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blocksAll, sitemapUrls } from '../src/checks/seo.ts';
import { level, makeContext, run, find } from './helpers.ts';

const page = (head: string, body = '') => `<html><head>${head}</head><body>${body}</body></html>`;

test('title: missing, too short, good', async () => {
  assert.equal(level(await run('seo.title', makeContext({ html: page('') })), 'seo.title'), 'fail');
  assert.equal(level(await run('seo.title', makeContext({ html: page('<title>Accueil</title>') })), 'seo.title'), 'warn');
  const good = await run('seo.title', makeContext({ html: page('<title>Atelier de poterie à Lyon - cours et stages</title>') }));
  assert.equal(good[0]!.level, 'pass');
  assert.match(good[0]!.detail!, /43 caractères/);
});

test('meta description length', async () => {
  assert.equal((await run('seo.description', makeContext({ html: page('') })))[0]!.level, 'warn');
  const desc = 'x'.repeat(100);
  assert.equal((await run('seo.description', makeContext({ html: page(`<meta name="Description" content="${desc}">`) })))[0]!.level, 'pass');
});

test('h1 count', async () => {
  assert.equal((await run('seo.h1', makeContext({ html: page('', '<p>x</p>') })))[0]!.level, 'fail');
  assert.equal((await run('seo.h1', makeContext({ html: page('', '<h1>a</h1>') })))[0]!.level, 'pass');
  assert.equal((await run('seo.h1', makeContext({ html: page('', '<h1>a</h1><h1>b</h1>') })))[0]!.level, 'warn');
});

test('lang, viewport and canonical', async () => {
  assert.equal((await run('seo.lang', makeContext({ html: '<html lang="fr"><body></body></html>' })))[0]!.level, 'pass');
  assert.equal((await run('seo.lang', makeContext({ html: page('') })))[0]!.level, 'warn');
  assert.equal((await run('seo.viewport', makeContext({ html: page('') })))[0]!.level, 'fail');
  assert.equal((await run('seo.viewport', makeContext({ html: page('<meta name="viewport" content="width=device-width">') })))[0]!.level, 'pass');
  assert.equal((await run('seo.canonical', makeContext({ html: page('<link rel="canonical" href="/page">') })))[0]!.level, 'warn');
  assert.equal((await run('seo.canonical', makeContext({ html: page('<link rel="canonical" href="https://example.test/">') })))[0]!.level, 'pass');
  assert.equal((await run('seo.canonical', makeContext({ html: page('') })))[0]!.level, 'warn');
});

test('noindex in meta robots or X-Robots-Tag fails', async () => {
  assert.equal((await run('seo.noindex', makeContext({ html: page('<meta name="robots" content="noindex, follow">') })))[0]!.level, 'fail');
  assert.equal((await run('seo.noindex', makeContext({ headers: { 'x-robots-tag': 'noindex' } })))[0]!.level, 'fail');
  assert.equal((await run('seo.noindex', makeContext({ html: page('<meta name="robots" content="index, follow">') })))[0]!.level, 'pass');
});

test('robots.txt parsing', () => {
  assert.equal(blocksAll('User-agent: *\nDisallow: /'), true);
  assert.equal(blocksAll('User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin'), false);
  assert.equal(blocksAll('User-agent: Googlebot\nUser-agent: *\nDisallow: / # all'), true);
  assert.equal(blocksAll('User-agent: *\nDisallow:'), false);
  assert.deepEqual(sitemapUrls('Sitemap: https://a.test/s.xml\nsitemap:https://a.test/b.xml'), ['https://a.test/s.xml', 'https://a.test/b.xml']);
});

test('robots.txt and sitemap checks use the declared sitemap', async () => {
  const ctx = makeContext({
    routes: {
      '/robots.txt': { body: 'User-agent: *\nDisallow: /admin\nSitemap: https://example.test/map.xml' },
      '/map.xml': { body: '<?xml version="1.0"?><urlset xmlns="x"><url><loc>a</loc></url></urlset>' },
    },
  });
  const robots = await run('seo.robots-txt', ctx);
  assert.equal(level(robots, 'seo.robots-txt'), 'pass');
  assert.equal(level(robots, 'seo.robots-sitemap'), 'pass');
  assert.equal((await run('seo.sitemap', ctx))[0]!.level, 'pass');
});

test('robots.txt served as an HTML fallback counts as missing', async () => {
  const ctx = makeContext({ fallback: { status: 200, body: '<!doctype html><html></html>' } });
  assert.equal(level(await run('seo.robots-txt', ctx), 'seo.robots-txt'), 'warn');
  const sitemap = await run('seo.sitemap', ctx);
  assert.equal(sitemap[0]!.level, 'warn');
  assert.match(sitemap[0]!.detail!, /non XML/);
});

test('robots.txt blocking everything fails', async () => {
  const ctx = makeContext({ routes: { '/robots.txt': { body: 'User-agent: *\nDisallow: /' } } });
  const findings = await run('seo.robots-txt', ctx);
  assert.equal(level(findings, 'seo.robots-txt'), 'fail');
  assert.equal(level(findings, 'seo.robots-sitemap'), 'warn');
});

test('redirect chain and http to https', async () => {
  const redirects = [{ url: 'http://a.test/', status: 301 }, { url: 'https://a.test/', status: 301 }];
  assert.equal((await run('seo.redirects', makeContext({ redirects })))[0]!.level, 'warn');
  assert.equal((await run('seo.redirects', makeContext({ redirects: redirects.slice(1) })))[0]!.level, 'pass');

  const redirecting = makeContext({ routes: { 'http://example.test/': { status: 301, headers: { location: 'https://example.test/' } } } });
  assert.equal((await run('seo.https-redirect', redirecting))[0]!.level, 'pass');
  const plain = makeContext({ routes: { 'http://example.test/': { status: 200, body: 'hi' } } });
  assert.equal((await run('seo.https-redirect', plain))[0]!.level, 'warn');
  assert.equal((await run('seo.https-redirect', makeContext({ url: 'http://example.test/' })))[0]!.level, 'warn');
});

test('open graph and images without alt', async () => {
  const og = await run('seo.open-graph', makeContext({ html: page('<meta property="og:title" content="T">') }));
  assert.equal(og[0]!.level, 'warn');
  assert.match(og[0]!.detail!, /og:description, og:image/);
  const images = await run('seo.img-alt', makeContext({ html: page('', '<img src="a.png"><img src="b.png" alt=""><img src="c.png" alt="c">') }));
  assert.equal(images[0]!.level, 'warn');
  assert.match(images[0]!.detail!, /^1 image\(s\) sans alt sur 3/);
});

test('performance hints', async () => {
  assert.equal((await run('seo.ttfb', makeContext({ timings: { ttfb: 2000, total: 2100 } })))[0]!.level, 'fail');
  assert.equal((await run('seo.download', makeContext({ timings: { ttfb: 100, total: 3000 } })))[0]!.level, 'warn');
  assert.equal((await run('seo.html-size', makeContext({ bytes: 600 * 1024 })))[0]!.level, 'warn');
  assert.equal((await run('seo.compression', makeContext({ headers: { 'content-encoding': 'zstd' } })))[0]!.level, 'pass');
  assert.equal((await run('seo.compression', makeContext()))[0]!.level, 'warn');
  assert.equal((await run('seo.cache', makeContext({ headers: { etag: '"abc"' } })))[0]!.level, 'pass');
  const cache = await run('seo.cache', makeContext());
  assert.equal(cache[0]!.level, 'warn');
  assert.ok(find(cache, 'seo.cache')!.fix);
});

test('status of the final page', async () => {
  assert.equal((await run('seo.status', makeContext({ status: 500 })))[0]!.level, 'fail');
  assert.equal((await run('seo.status', makeContext()))[0]!.level, 'pass');
});
