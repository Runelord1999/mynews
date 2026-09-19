export type Topic = {name:string; keywords:string};
export type Article = {id:string; title:string; excerpt:string; url:string; source:string; date:string; topic:string; provider?:string};
export type NewsSite = {name:string;url:string;searchUrl:string;feedUrl:string};
export function siteSearchLink(site:NewsSite,keywords:string){return site.searchUrl?safeUrl(site.searchUrl.replaceAll('{query}',encodeURIComponent(keywords))):'https://www.google.com/search?q='+encodeURIComponent('site:'+new URL(site.url).hostname+' ('+keywords+')');}
export const defaults:Topic[] = ['Trump','Anthropic','OpenAI','Singularity','AGI','AI Governance'].map(name=>({name,keywords:name}));
export function safeUrl(value:string) { const u=new URL(value); if(!['http:','https:'].includes(u.protocol)||u.username||u.password) throw new Error('Use a valid HTTP or HTTPS article URL.'); return u.href; }
export function plain(value:string) { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]*>/g,' ').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Math.min(Number(n),0x10ffff))).replace(/\s+/g,' ').trim(); }
// Longest useful text an article card shows. Feeds that carry the full body
// fill this; a feed that only carries a teaser simply comes up short.
export const summaryWords = 250;

export function summarise(html:string,limit=summaryWords) {
 const words = plain(html).split(/\s+/).filter(Boolean);
 return words.length > limit ? words.slice(0,limit).join(' ') + '…' : words.join(' ');
}

// Handles RSS <item> and Atom <entry>. Content is taken from the richest field
// the feed offers: a full-text feed fills content:encoded, an aggregator feed
// leaves only a teaser in description.
export function parseFeed(xml:string,topic:string,limit=summaryWords):Article[] {
 const blocks = xml.match(/<item[ >][\s\S]*?<\/item>/g) || xml.match(/<entry[ >][\s\S]*?<\/entry>/g) || [];
 return blocks.slice(0,12).flatMap(block=>{
  const tag=(n:string)=>block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`))?.[1]||'';
  // Atom carries the article URL in a link attribute rather than element text.
  const linkAttr=()=>block.match(/<link[^>]*\srel=["']alternate["'][^>]*\shref=["']([^"']+)["']/)?.[1]||block.match(/<link[^>]*\shref=["']([^"']+)["']/)?.[1]||'';
  try {
   let url=safeUrl(plain(tag('link'))||linkAttr());
   const bing=new URL(url);
   if(bing.hostname.endsWith('bing.com')&&bing.searchParams.has('url')) url=safeUrl(bing.searchParams.get('url')!);
   const title=plain(tag('title')); if(!title)return [];
   const body=tag('content:encoded')||tag('content')||tag('description')||tag('summary');
   return [{id:url,title,excerpt:summarise(body,limit),url,source:plain(tag('News:Source')||tag('source')||tag('dc:creator'))||new URL(url).hostname.replace(/^www\./,''),date:tag('pubDate')||tag('published')||tag('updated'),topic}];
  } catch{return [];}
 });
}

// Every place a story can come from. The three aggregators and the publishers
// this reader ships with are all services: they need no setup and are the same
// for everyone. "Your sites" holds only what a reader adds themselves.
export type SourceKind='engine'|'feed'|'search';
export type Source={id:string;name:string;kind:SourceKind;hint:string;url?:string;feedUrl?:string};
const publisher=(name:string,url:string,feedUrl=''):Source=>({id:'service:'+new URL(url).hostname.replace(/^www\./,''),name,kind:feedUrl?'feed':'search',hint:feedUrl?'Full-text feed':'Searched by site',url,feedUrl});
export const engines:Source[]=[
 {id:'bing',name:'Bing News',kind:'engine',hint:'News index'},
 {id:'google',name:'Google News',kind:'engine',hint:'News index'},
 {id:'hackernews',name:'Hacker News',kind:'engine',hint:'Discussions'},
];
export const publishers:Source[]=[
 publisher('Associated Press','https://apnews.com/'),
 publisher('Ars Technica','https://arstechnica.com/','https://arstechnica.com/feed/'),
 publisher('Futurism','https://futurism.com/','https://futurism.com/feed'),
 publisher('BBC','https://www.bbc.co.uk/news'),
 publisher('Reuters','https://www.reuters.com/'),
 publisher('Guardian','https://www.theguardian.com/international'),
 publisher('Aljazeera','https://www.aljazeera.com/'),
 publisher('CNA','https://www.channelnewsasia.com/'),
 publisher('CBC','https://www.cbc.ca/news'),
];
export const services:Source[]=[...engines,...publishers];
export const engineIds=engines.map(e=>e.id);
export const serviceHosts=new Set(publishers.map(p=>new URL(p.url!).hostname.replace(/^www\./,'')));
export function siteSourceId(site:NewsSite){return 'site:'+site.url;}
// The hostname a site: query should name. Keeping the www. prefix makes the
// query stricter than the site really is, so a page served without it is
// missed; dropping it matches the bare host and every subdomain.
export function sourceHost(url:string){return new URL(url).hostname.replace(/^www\./,'');}
export function allSources(sites:NewsSite[],removed:string[]=[]):Source[]{
 return [...services.filter(s=>!removed.includes(s.id)),...sites.map(s=>({id:siteSourceId(s),name:s.name,kind:(s.feedUrl?'feed':'search') as SourceKind,hint:s.feedUrl?'Full-text feed':'Searched by site',url:s.url,feedUrl:s.feedUrl}))];
}
// Everything the reader ships with is on to begin with. Sites a reader adds
// are opted into deliberately.
export function defaultSources(){return services.map(s=>s.id);}
