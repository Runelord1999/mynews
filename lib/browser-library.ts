import {defaults, safeUrl, type Article, type Topic, type NewsSite} from './news';
import {z} from 'zod';
import {starterSites, starterSitesVersion} from './starter-sites';
const key = 'mynews-library-v1';
const topicSchema=z.object({name:z.string().trim().min(1).max(40),keywords:z.string().trim().min(1).max(300)});
const articleSchema=z.object({id:z.string(),url:z.string().transform(safeUrl),title:z.string().trim().min(1).max(500),excerpt:z.string().max(1000),source:z.string().max(200),date:z.string().max(100),topic:z.string().max(40)});
const siteSchema=z.object({name:z.string().trim().min(1).max(60),url:z.string().max(4096).transform(safeUrl),searchUrl:z.string().max(4096).default(''),feedUrl:z.string().max(4096).default('')})
 .refine(s=>!s.searchUrl||(s.searchUrl.includes('{query}')&&new URL(safeUrl(s.searchUrl.replaceAll('{query}','test'))).hostname===new URL(s.url).hostname),'Search URL must use this website and include {query}.')
 .refine(s=>!s.feedUrl||new URL(safeUrl(s.feedUrl)).hostname===new URL(s.url).hostname,'Feed URL must use this website.');
const librarySchema=z.object({topics:z.array(topicSchema).min(1).max(20),articles:z.array(articleSchema),sites:z.array(siteSchema).max(30).default([]),starterSitesVersion:z.number().optional()});
const backupSchema=librarySchema.extend({format:z.literal('mynews-settings'),version:z.literal(1),exportedAt:z.string(),fontSize:z.number().int().min(12).max(24)});
export type SettingsBackup=z.infer<typeof backupSchema>;
export function parseBackup(text:string):SettingsBackup {
 if(new Blob([text]).size>5*1024*1024)throw Error('Choose a settings file smaller than 5 MB.');
 const backup=backupSchema.parse(JSON.parse(text));
 if(new Set(backup.topics.map(t=>t.name.toLowerCase())).size!==backup.topics.length)throw Error('Topic names must be unique.');
 backup.articles=Array.from(new Map(backup.articles.map(a=>[a.url,{...a,id:a.url}])).values());
 return backup;
}
export function exportBackup(fontSize:number):string {
 return JSON.stringify(parseBackup(JSON.stringify({format:'mynews-settings',version:1,exportedAt:new Date().toISOString(),fontSize,...readLibrary()})),null,2);
}
export function restoreBackup(backup:SettingsBackup) {
 const valid=parseBackup(JSON.stringify(backup));
 localStorage.setItem(key,JSON.stringify({topics:valid.topics,articles:valid.articles,sites:valid.sites,starterSitesVersion}));
 return valid;
}
export function readLibrary():{topics:Topic[];articles:Article[];sites:NewsSite[]}{
 const raw=localStorage.getItem(key);
 const state=raw?librarySchema.parse(JSON.parse(raw)):{topics:defaults,articles:[],sites:[] as NewsSite[],starterSitesVersion:0};
 const version=state.starterSitesVersion??0;
 if(version<starterSitesVersion){
  const host=(url:string)=>new URL(url).hostname.replace(/^www\./,'');
  // Browsers stuck before version 2 still carry publishers that were added
  // automatically and then withdrawn. Drop those before topping up, or they
  // would look like the reader put them back.
  if(version>0&&version<2){
   const withdrawn=new Set(['technologyreview.com','sciencenews.org']);
   state.sites=state.sites.filter(s=>!withdrawn.has(host(s.url)));
  }
  const hosts=new Set(state.sites.map(s=>host(s.url)));
  state.sites=[...state.sites,...starterSites.filter(s=>!hosts.has(host(s.url)))].slice(0,30);
  state.starterSitesVersion=starterSitesVersion;
  localStorage.setItem(key,JSON.stringify(state));
 }
 return state;
}
export function writeLibrary(input:unknown){const b=z.discriminatedUnion('action',[
 z.object({action:z.literal('topics'),topics:z.array(topicSchema).min(1).max(20)}),
 z.object({action:z.literal('save'),article:articleSchema}),
 z.object({action:z.literal('remove'),id:z.string()}),
 z.object({action:z.literal('sites'),sites:z.array(siteSchema).max(30)})
]).parse(input);const state=readLibrary();
 if(b.action==='sites'){state.sites=b.sites;}
 if(b.action==='topics'){if(new Set(b.topics.map(t=>t.name.toLowerCase())).size!==b.topics.length)throw Error('Topic names must be unique.');state.topics=b.topics;}
 if(b.action==='save'){b.article.id=b.article.url;state.articles=[b.article,...state.articles.filter(a=>a.url!==b.article.url)];}
 if(b.action==='remove')state.articles=state.articles.filter(a=>a.id!==b.id);
 localStorage.setItem(key,JSON.stringify(state));
}
// Base URL of the Mynews API. Set MYNEWS_API_BASE at build time to point the
// static reader at its own Worker; an empty value keeps same-origin requests,
// which is what the local dev server and the legacy private site use.
declare const __MYNEWS_API_BASE__: string | undefined;
export function apiBase(){
 const configured = typeof __MYNEWS_API_BASE__ === 'string' ? __MYNEWS_API_BASE__ : '';
 if (configured) return configured.replace(/\/+$/, '');
 // The published reader talks to the Mynews API Worker. This is the default
 // rather than a build variable so a deploy that forgets to set one cannot
 // silently send settings somewhere else.
 return location.hostname.endsWith('github.io') ? 'https://mynews-api.darylysm.workers.dev' : '';
}
export function feedEndpoint(){return apiBase()+'/api/feed';}
export function settingsEndpoint(){return apiBase()+'/api/settings';}
export function adminEndpoint(){return apiBase()+'/api/admin';}
export function articleEndpoint(){return apiBase()+'/api/article';}
// Shown in error messages so a build pointed at the wrong backend is obvious.
export function apiOrigin(){return apiBase()||location.origin;}

// Headlines are kept between visits so reopening the tab shows the last
// edition instead of firing a fresh round of searches. Keyed by the source
// selection, because that is what changes which stories come back.
const feedKey='mynews-feed-cache-v1';
export type FeedCache={articles:Article[];fetchedAt:string};
export function readFeedCache(key:string):FeedCache|null{
 try{const all=JSON.parse(localStorage.getItem(feedKey)||'{}') as Record<string,FeedCache>;const hit=all[key];return hit&&Array.isArray(hit.articles)?hit:null;}catch{return null;}
}
export function writeFeedCache(key:string,value:FeedCache){
 const entry={articles:value.articles.slice(0,200),fetchedAt:value.fetchedAt};
 let all:Record<string,FeedCache>={};
 try{all=JSON.parse(localStorage.getItem(feedKey)||'{}');}catch{}
 all[key]=entry;
 // Keep only the four most recent source selections so storage stays small.
 const trimmed=Object.fromEntries(Object.entries(all).sort((a,b)=>Date.parse(b[1].fetchedAt||'')-Date.parse(a[1].fetchedAt||'')).slice(0,4));
 try{localStorage.setItem(feedKey,JSON.stringify(trimmed));}
 catch{try{localStorage.setItem(feedKey,JSON.stringify({[key]:entry}));}catch{/* storage is full or blocked; the edition is still on screen */}}
}
