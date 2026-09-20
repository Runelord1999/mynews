import {plain} from './news';

// Extract visible article blocks, never a metadata teaser or hidden script body.
export function extractArticle(html: string) {
 const stripped=html.replace(/<!--[\s\S]*?-->/g,' ')
  .replace(/<(script|style|noscript|svg|form|figure|picture|iframe|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi,' ');
 const main=stripped.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
  ||stripped.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
 if(!main)return '';
 return Array.from(main.matchAll(/<(p|h[2-6]|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi),m=>plain(m[2])).filter(Boolean).join('\n\n');
}
