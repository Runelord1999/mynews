import {defaults, safeUrl, type Article, type Topic} from './news';
import {z} from 'zod';
const key = 'mynews-library-v1';
const topicSchema=z.object({name:z.string().trim().min(1).max(40),keywords:z.string().trim().min(1).max(300)});
const articleSchema=z.object({id:z.string(),url:z.string().transform(safeUrl),title:z.string().trim().min(1).max(500),excerpt:z.string().max(1000),source:z.string().max(200),date:z.string().max(100),topic:z.string().max(40)});
const librarySchema=z.object({topics:z.array(topicSchema).min(1).max(20),articles:z.array(articleSchema)});
export function readLibrary():{topics:Topic[];articles:Article[]}{const raw=localStorage.getItem(key);return raw?librarySchema.parse(JSON.parse(raw)):{topics:defaults,articles:[]};}
export function writeLibrary(input:unknown){const b=z.discriminatedUnion('action',[
 z.object({action:z.literal('topics'),topics:z.array(topicSchema).min(1).max(20)}),
 z.object({action:z.literal('save'),article:articleSchema}),
 z.object({action:z.literal('remove'),id:z.string()})
]).parse(input);const state=readLibrary();
 if(b.action==='topics'){if(new Set(b.topics.map(t=>t.name.toLowerCase())).size!==b.topics.length)throw Error('Topic names must be unique.');state.topics=b.topics;}
 if(b.action==='save'){b.article.id=b.article.url;state.articles=[b.article,...state.articles.filter(a=>a.url!==b.article.url)];}
 if(b.action==='remove')state.articles=state.articles.filter(a=>a.id!==b.id);
 localStorage.setItem(key,JSON.stringify(state));
}
export function feedEndpoint(){return location.hostname==='runelord1999.github.io'?'https://mynews-daryl.runelord1999.chatgpt.site/api/feed':'/api/feed';}
