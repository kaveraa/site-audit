import type { HTMLElement } from 'node-html-parser';

/** Content of <meta name=...> or <meta property=...>, case-insensitive on the name. */
export function meta(doc: HTMLElement, name: string): string | undefined {
  for (const el of doc.querySelectorAll('meta')) {
    const key = (el.getAttribute('name') ?? el.getAttribute('property'))?.toLowerCase();
    if (key === name) return el.getAttribute('content')?.trim() ?? '';
  }
  return undefined;
}

export const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
export const length = (text: string) => [...text].length;
