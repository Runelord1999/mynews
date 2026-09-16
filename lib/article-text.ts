import {plain, summarise} from './news';

// Pulls the readable body out of an article page. This is deliberately plain:
// drop the furniture, prefer the element publishers use for the story itself,
// then keep the paragraphs. It is a best effort and fails to a short result
// rather than guessing.
export function extractArticle(html: string) {
 const stripped = html
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<(script|style|noscript|svg|form|figure|picture|iframe)\b[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');

 const main = stripped.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
  || stripped.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
  || stripped;

 const paragraphs = Array.from(main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi), m => plain(m[1]))
  .filter(text => text.length > 40);

 const body = paragraphs.join(' ');
 if (body.split(/\s+/).filter(Boolean).length >= 40) return body;

 // Too little real text: fall back to whatever the page says about itself.
 const meta = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i)?.[1]
  || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i)?.[1]
  || '';
 return plain(meta);
}

export {summarise};
