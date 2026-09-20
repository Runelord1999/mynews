import {plain,sourceHost,topicTerms,type Topic,type NewsSite} from './news';
import {publicHttpUrl} from './safe-remote';

export type SourceCandidate={name:string;url:string;topics:string[];sample:string;sampleUrl:string;matches:number};
export type SuggestedSite=NewsSite&{covers:string;sample:string;sampleUrl:string};

// Build a fresh search for every topic, rather than choosing from a catalogue.
export function sourceQuery(topic:Topic){
 const terms=topicTerms(topic);let query='';
 for(const term of terms.length?terms:[topic.name]){
  const phrase='"'+term.replace(/["<>]/g,' ').trim().slice(0,100)+'"';
  if(query.length+phrase.length+4>280)continue;
  query+=(query?' OR ':'')+phrase;
 }
 return query||topic.name;
}
function overlaps(a:string,b:string){return a===b||a.endsWith('.'+b)||b.endsWith('.'+a);}
export function searchPublishers(xml:string,topic:Topic,excluded:string[]):SourceCandidate[]{
 return (xml.match(/<item[ >][\s\S]*?<\/item>/gi)||[]).slice(0,30).flatMap(block=>{
  const tag=(name:string)=>plain(block.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+name+'>','i'))?.[1]||'');
  try{
   let article=publicHttpUrl(tag('link'));
   if(article.hostname.endsWith('bing.com')&&article.searchParams.has('url'))article=publicHttpUrl(article.searchParams.get('url')!);
   const declared=block.match(/<source\b[^>]*\burl=["']([^"']+)["']/i)?.[1];
   const publisher=declared?publicHttpUrl(plain(declared)):article;
   const host=sourceHost(publisher.href);
   const comparable=(h:string)=>h==='bbc.com'?'bbc.co.uk':h;
   if(['news.google.com','bing.com','msn.com','news.ycombinator.com'].some(h=>overlaps(host,h))||excluded.some(h=>overlaps(comparable(host),comparable(h))))return [];
   const title=tag('title');if(!title)return [];
   return [{name:(tag('source')||tag('News:Source')||host).slice(0,60),url:publisher.origin+'/',topics:[topic.name],sample:title.slice(0,500),sampleUrl:article.href,matches:1}];
  }catch{return [];}
 });
}
// Keep a mix of topics, not just the most frequently reported topic.
export function rankPublishers(candidates:SourceCandidate[],topics:Topic[],limit=12){
 const unique=new Map<string,SourceCandidate>();
 for(const candidate of candidates){
  const host=sourceHost(candidate.url),previous=unique.get(host);
  if(previous){previous.topics=[...new Set([...previous.topics,...candidate.topics])];previous.matches++;}
  else unique.set(host,{...candidate,topics:[...candidate.topics]});
 }
 const remaining=[...unique.values()];const selected:SourceCandidate[]=[];
 const coverage=new Map(topics.map(t=>[t.name,0]));
 while(remaining.length&&selected.length<limit){
  const score=(c:SourceCandidate)=>c.topics.reduce((n,t)=>n+1/(1+(coverage.get(t)||0)),0)+Math.min(c.matches,5)*0.05;
  remaining.sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name));
  const next=remaining.shift()!;selected.push(next);
  for(const topic of next.topics)coverage.set(topic,(coverage.get(topic)||0)+1);
 }
 return selected;
}
