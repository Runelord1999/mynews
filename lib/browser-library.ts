import {defaults, safeUrl, type Article, type Topic, type NewsSite} from './news';
import {z} from 'zod';
import {starterSites} from './starter-sites';
const key = 'mynews-library-v1';
const topicSchema=z.object({name:z.string().trim().min(1).max(40),keywords:z.string().trim().min(1).max(300)});
const articleSchema=z.object({id:z.string(),url:z.string().transform(safeUrl),title:z.string().trim().min(1).max(500),excerpt:z.string().max(1000),source:z.string().max(200),date:z.string().max(100),topic:z.string().max(40)});
const siteSchema=z.object({name:z.string().trim().min(1).max(60),url:z.string().max(4096).transform(safeUrl),searchUrl:z.string().max(4096).default('')}).refine(s=>!s.searchUrl||(s.searchUrl.includes('{query}')&&new URL(safeUrl(s.searchUrl.replaceAll('{query}','test'))).hostname===new URL(s.url).hostname),'Search URL must use this website and include {query}.');
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
 localStorage.setItem(key,JSON.stringify({topics:valid.topics,articles:valid.articles,sites:valid.sites,starterSitesVersion:1}));
 return valid;
}
export function readLibrary():{topics:Topic[];articles:Article[];sites:NewsSite[]}{
 const raw=localStorage.getItem(key);
 const state=raw?librarySchema.parse(JSON.parse(raw)):{topics:defaults,articles:[],sites:[] as NewsSite[],starterSitesVersion:0};
 if(!state.starterSitesVersion){
  const hosts=new Set(state.sites.map(s=>new URL(s.url).hostname.replace(/^www\./,'')));
  state.sites=[...state.sites,...starterSites.filter(s=>!hosts.has(new URL(s.url).hostname.replace(/^www\./,'')))].slice(0,30);
  state.starterSitesVersion=1;
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
export function feedEndpoint(){return location.hostname==='runelord1999.github.io'?'https://mynews-daryl.runelord1999.chatgpt.site/api/feed':'/api/feed';}
