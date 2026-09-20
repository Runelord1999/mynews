import {z} from 'zod';
import {corsHeaders,checkOrigin} from './api-cors';
import {readRemote,publicHttpUrl} from './safe-remote';
import {services,sourceHost} from './news';
import {sourceQuery,searchPublishers,rankPublishers,type SourceCandidate} from './suggested-sites';
import type {SettingsRateLimiter} from './api-settings';

const inputSchema=z.object({
 topics:z.array(z.object({name:z.string().trim().min(1).max(40),keywords:z.string().trim().min(1).max(300)})).min(1).max(20),
 sites:z.array(z.object({url:z.string().max(4096).transform(value=>publicHttpUrl(value).href)})).max(30),
});

export async function handleSuggest(request:Request,options:{allowedOrigins:string[];rateLimiter?:SettingsRateLimiter}){
 const headers={...corsHeaders(request,options.allowedOrigins,'POST'),'Cache-Control':'no-store'};
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply({error:'Use POST to find suggested sources.'},405);
 if(!checkOrigin(request,options.allowedOrigins).allowed)return reply({error:'Invalid origin.'},403);
 if(options.rateLimiter){
  try{if(!(await options.rateLimiter.limit({key:'suggest:'+(request.headers.get('cf-connecting-ip')||'anonymous')})).success)return reply({error:'Too many lookups. Wait a minute and try again.'},429);}
  catch{return reply({error:'Source discovery is temporarily unavailable. Try again shortly.'},503);}
 }
 let input;
 try{
  const reader=request.body?.getReader();if(!reader)return reply({error:'Add keyword topics before looking for sources.'},400);
  let size=0,raw='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>128*1024){await reader.cancel();return reply({error:'Source lookup request is too large.'},413);}raw+=decoder.decode(value,{stream:true});}
  input=inputSchema.parse(JSON.parse(raw+decoder.decode()));
 }catch{return reply({error:'Provide 1–20 keyword topics and valid existing website URLs.'},400);}
 const excluded=[...input.sites.map(s=>sourceHost(s.url)),...services.flatMap(s=>s.url?[sourceHost(s.url)]:[])];
 const jobs=input.topics.flatMap(topic=>['google','bing'].map(provider=>({topic,provider})));
 const found:SourceCandidate[][]=Array.from({length:jobs.length},()=>[]);
 let index=0,succeeded=0;
 const failed=new Set<string>();
 // Four simultaneous searches, at most forty for the maximum twenty topics.
 await Promise.all(Array.from({length:Math.min(4,jobs.length)},async()=>{
  while(index<jobs.length){
   const i=index++,job=jobs[i],q=encodeURIComponent(sourceQuery(job.topic));
   const url=job.provider==='google'?'https://news.google.com/rss/search?q='+q+'&hl=en-US&gl=US&ceid=US:en':'https://www.bing.com/news/search?q='+q+'&format=rss';
   try{const xml=await readRemote(url,400000,8000);if(!/<rss\b/i.test(xml))throw Error('Not RSS');found[i]=searchPublishers(xml,job.topic,excluded);succeeded++;}
   catch{failed.add(job.provider==='google'?'Google News':'Bing News');}
  }
 }));
 if(!succeeded)return reply({error:'The search indexes did not respond. Try finding suggested sources again later.'},502);
 return reply({candidates:rankPublishers(found.flat(),input.topics),topicsSearched:input.topics.map(t=>t.name),partial:failed.size>0,unavailable:[...failed]});
}
