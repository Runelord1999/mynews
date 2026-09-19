'use client';
import {useState,useRef} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {ArrowUpRight,Search,Trash2,Plus,Pencil,Info,ChevronDown,ChevronUp} from 'lucide-react';
import {toast} from 'sonner';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {safeUrl,siteSearchLink,services,defaultSources,siteSourceId,sourceHost,type NewsSite} from '@/lib/news';
import {suggestedSites} from '@/lib/suggested-sites';
import {feedEndpoint,discoverEndpoint} from '@/lib/browser-library';
import CollapsibleArea from './collapsible-area';
import {writeLibrary} from '@/lib/browser-library';
export default function SitesBar({sites,onChange,keywords,open,onOpenChange,sources,onSourcesChange,removedSources,onRemovedSourcesChange}:{removedSources:string[];onRemovedSourcesChange:(ids:string[])=>void;sites:NewsSite[];onChange:(sites:NewsSite[])=>void;keywords:string;open:boolean;onOpenChange:(open:boolean)=>void;sources:string[];onSourcesChange:(next:string[])=>void}){
 const visibleServices=services.filter(s=>!removedSources.includes(s.id));
 const [showForm,setShowForm]=useState(false);
 // Twelve service rows push the saved websites and the add form off screen, so
 // the section folds away and remembers that it was folded.
 const [servicesOpen,setServicesOpen]=useState(()=>{try{return localStorage.getItem('mynews-collapsed-services')!=='true';}catch{return true;}});
 function toggleServices(){setServicesOpen(open=>{const next=!open;try{localStorage.setItem('mynews-collapsed-services',String(!next));}catch{}return next;});}
 const chosen=new Set(sources);
 function toggleSource(id:string){onSourcesChange(chosen.has(id)?sources.filter(x=>x!==id):[...sources,id]);}
 const formRef=useRef<HTMLFormElement>(null);
 const [editing,setEditing]=useState<string|null>(null);
 const [name,setName]=useState(''),[url,setUrl]=useState(''),[searchUrl,setSearchUrl]=useState(''),[feedUrl,setFeedUrl]=useState('');
 // A feed that cannot be read and a feed that matches no keywords both show an
 // empty topic, so the check reports the two separately.
 const [feedCheck,setFeedCheck]=useState('');
 const [checking,setChecking]=useState(false);
 const [bulkFeed,setBulkFeed]=useState('');
 // Suggested sources are candidates, not recommendations taken on trust: each
 // feed is read through the Worker first and only the ones that answer with a
 // real feed are added.
 async function addSuggested(){
  const have=new Set(sites.map(x=>sourceHost(x.url)));
  const candidates=suggestedSites.filter(x=>!have.has(sourceHost(x.url))||!sites.some(y=>y.feedUrl===x.feedUrl));
  const room=30-sites.length;
  if(room<=0){setBulkFeed('There is no room for more websites. Remove some first.');return;}
  setChecking(true);
  const working:typeof suggestedSites=[];const failed:string[]=[];
  for(let i=0;i<candidates.length&&working.length<room;i++){
   const candidate=candidates[i];
   setBulkFeed('Checking suggested sources… '+(i+1)+' of '+candidates.length+' ('+candidate.name+')');
   try{
    const params=new URLSearchParams({provider:'sitefeed',feed:candidate.feedUrl,site:sourceHost(candidate.url)});
    const response=await fetch(feedEndpoint()+'?'+params,{signal:AbortSignal.timeout(20000)});
    const data=await response.json() as {articles?:unknown[];total?:number};
    const total=data.total??data.articles?.length??0;
    if(response.ok&&total>0)working.push(candidate);else failed.push(candidate.name);
   }catch{failed.push(candidate.name);}
  }
  if(working.length){
   const next=[...sites,...working.map(({name,url,searchUrl,feedUrl})=>({name,url,searchUrl,feedUrl}))].slice(0,30);
   try{persist(next);onSourcesChange([...new Set([...sources,...working.map(x=>siteSourceId(x))])]);}
   catch{setChecking(false);setBulkFeed('Those feeds work but could not be saved.');return;}
  }
  setChecking(false);
  setBulkFeed(working.length?'Added '+working.length+' source'+(working.length===1?'':'s')+' with a working feed: '+working.map(x=>x.name).join(', ')+'.'+(failed.length?' Skipped '+failed.length+' that did not answer.':''):'None of the suggested feeds answered just now. Try again in a moment.');
 }
 // Asking every website where its feed is, one after another, so a list of
 // sources that can only be searched becomes a list that can be read directly.
 async function findAllFeeds(){
  const blanks=sites.filter(x=>!x.feedUrl);
  const targets=blanks.length?blanks:sites;
  if(!targets.length){setBulkFeed('There are no saved websites yet.');return;}
  setChecking(true);
  const found:Record<string,string>=({});const missed:string[]=[];
  for(let i=0;i<targets.length;i++){
   const site=targets[i];
   setBulkFeed('Looking for feeds… '+(i+1)+' of '+targets.length+' ('+site.name+')');
   try{
    const response=await fetch(discoverEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:site.url}),signal:AbortSignal.timeout(25000)});
    const data=await response.json() as {feeds?:{url:string;items:number}[]};
    if(response.ok&&data.feeds?.length)found[site.url]=data.feeds[0].url;else missed.push(site.name);
   }catch{missed.push(site.name);}
  }
  const hits=Object.keys(found).length;
  if(hits){
   try{persist(sites.map(x=>found[x.url]?{...x,feedUrl:found[x.url]}:x));}
   catch{setChecking(false);setBulkFeed('Feeds were found but could not be saved.');return;}
  }
  setChecking(false);
  setBulkFeed(hits+' of '+targets.length+' websites now have a feed and are read directly.'+(missed.length?' No feed was found for: '+missed.join(', ')+'. Those still need a search service.':''));
 }
 async function testFeed(){
  setChecking(true);setFeedCheck('');
  try{
   const feed=safeUrl(feedUrl);
   const params=new URLSearchParams({provider:'sitefeed',feed,site:sourceHost(safeUrl(url))});
   const response=await fetch(feedEndpoint()+'?'+params,{signal:AbortSignal.timeout(20000)});
   const data=await response.json() as {articles?:{title:string;excerpt:string}[];total?:number;error?:string};
   if(!response.ok)throw Error(data.error||'That feed could not be read.');
   // An older Worker sends no total, so fall back to what it did send rather
   // than calling a working feed empty.
   const items=data.articles??[];
   const total=data.total??items.length;
   const terms=keywords.split(/\s+OR\s+/).map(k=>k.trim().toLowerCase()).filter(Boolean);
   const matched=terms.length?items.filter(a=>terms.some(t=>(a.title+' '+a.excerpt).toLowerCase().includes(t))).length:items.length;
   setFeedCheck(total===0?'That address was read but held no articles. It may not be an RSS or Atom feed.':'Feed works — '+total+' articles'+(terms.length?', '+matched+' match the current topic keywords. Items that match no topic still appear under All stories.':'.'));
  }catch(error){setFeedCheck(error instanceof Error?error.message:'That feed could not be read.');}finally{setChecking(false);}
 }

 // Ask the site where its feed is, rather than making the reader find it.
 async function findFeed(){
  setChecking(true);setFeedCheck('');
  try{
   const response=await fetch(discoverEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:safeUrl(url)}),signal:AbortSignal.timeout(25000)});
   const data=await response.json() as {feeds?:{url:string;title:string;items:number}[];error?:string};
   if(!response.ok||!data.feeds?.length)throw Error(data.error||'No feed was found on that website.');
   const best=data.feeds[0];
   setFeedUrl(best.url);
   setFeedCheck('Found '+(best.title||best.url)+' — '+best.items+' articles.'+(data.feeds.length>1?' '+(data.feeds.length-1)+' other feed(s) were found; this is the first.':''));
  }catch(error){setFeedCheck(error instanceof Error?error.message:'No feed was found on that website.');}finally{setChecking(false);}
 }
 function persist(next:NewsSite[]){writeLibrary({action:'sites',sites:next});onChange(next);}
 function clearForm(){setShowForm(false);setEditing(null);setName('');setUrl('');setSearchUrl('');setFeedUrl('');}
 function edit(site:NewsSite){setShowForm(true);setEditing(site.url);setName(site.name);setUrl(site.url);setSearchUrl(site.searchUrl);setFeedUrl(site.feedUrl||'');formRef.current?.scrollIntoView({block:'nearest',behavior:'smooth'});}
 function submit(e:React.FormEvent){e.preventDefault();try{
 const normalized=safeUrl(url);
 if(sites.some(s=>s.url===normalized&&s.url!==editing))throw Error('duplicate');
 const entry={name:name.trim()||new URL(normalized).hostname,url:normalized,searchUrl:searchUrl.trim(),feedUrl:feedUrl.trim()};
 if(entry.feedUrl)safeUrl(entry.feedUrl);
 const next=editing?sites.map(s=>s.url===editing?entry:s):[...sites,entry];
 persist(next);const oldId=editing?'site:'+editing:'';onSourcesChange([...sources.filter(id=>id!==oldId),...(!editing||chosen.has(oldId)?[siteSourceId(entry)]:[])]);toast.success(editing?'Website updated.':'Website added.');clearForm();
 }catch(e){toast.error(e instanceof Error&&e.message==='duplicate'?'That URL is already in your list. Edit the existing entry.':e instanceof Error&&e.message==='feed'?'The feed address must be on the same website.':'Enter a valid website URL. An optional search URL must use the same website and contain {query}. Maximum 30 sites.');}}
 return <><CollapsibleArea id="sites" label="Your Search Source Sites"><div className="sites-strip"><span className="eyebrow">YOUR SEARCH SOURCE SITES</span><button className="site-scope" onClick={()=>onOpenChange(true)} aria-haspopup="dialog">All sites ({sites.length+visibleServices.length})</button>{sites.map(site=><div className="site-entry" key={site.url}><button className={'site-scope '+(chosen.has(siteSourceId(site))?'active':'')} aria-pressed={chosen.has(siteSourceId(site))} title={(chosen.has(siteSourceId(site))?'Stop using ':'Use ')+new URL(site.url).hostname+' as a source'} onClick={()=>toggleSource(siteSourceId(site))}>{site.name}</button><a href={site.url} target="_blank" rel="noopener noreferrer" title={'Open '+site.name} aria-label={'Open '+site.name}><span className="site-url">{new URL(site.url).hostname}</span><ArrowUpRight size={15}/></a><a href={siteSearchLink(site,keywords)} target="_blank" rel="noopener noreferrer" title={'Search selected keywords on '+site.name} aria-label={'Search selected keywords on '+site.name}><Search size={14}/></a></div>)}{sites.length===0&&<span className="sites-hint">Add websites to search with your topic keywords.</span>}<button className="radar-edit" onClick={()=>onOpenChange(true)}><Plus size={15}/>View / edit sites</button></div></CollapsibleArea><Dialog open={open} onOpenChange={value=>{onOpenChange(value);if(!value)clearForm();}}><DialogContent className="editor"><DialogTitle>All search sites</DialogTitle><DialogDescription>View your news services and saved websites. Add or edit website links below; your changes are saved in this browser.</DialogDescription><div className="all-source-services"><div className="source-section-heading"><button className="section-toggle" aria-expanded={servicesOpen} aria-controls="news-services" onClick={toggleServices} aria-label={(servicesOpen?"Minimize":"Expand")+" news services"} title={(servicesOpen?"Minimize":"Expand")+" news services"}>{servicesOpen?<ChevronUp size={15}/>:<ChevronDown size={15}/>}<h3 className="site-form-title">News services</h3><small>{visibleServices.filter(x=>chosen.has(x.id)).length} of {visibleServices.length} in use</small></button><Popover><PopoverTrigger asChild><button className="info-button" aria-label="How source controls and feeds work"><Info size={15}/></button></PopoverTrigger><PopoverContent className="info-pop" align="start"><strong>Source controls and feeds</strong><p className="sites-help">Remove hides a default source from your personal list until you reset the defaults. Stop using keeps it in the list but turns it off.</p><p className="sites-help">Only enabled news services retrieve search results. Websites without an RSS feed need at least one enabled service; RSS feeds work independently.</p></PopoverContent></Popover></div><div id="news-services" hidden={!servicesOpen}>{visibleServices.map(service=><div className="service-row" key={service.id}><a href={service.url||({bing:'https://www.bing.com/news',google:'https://news.google.com',hackernews:'https://news.ycombinator.com'} as Record<string,string>)[service.id]} target="_blank" rel="noopener noreferrer"><strong>{service.name}</strong><small>{service.kind==='feed'?'Direct RSS feed — works without search services':service.kind==='search'?'Needs an enabled search service':'Search service'}</small></a><span className="service-status">{chosen.has(service.id)?'In use':'Not selected'}</span><button className="backup-button" onClick={()=>toggleSource(service.id)}>{chosen.has(service.id)?'Stop using':'Use this'}</button><button className="backup-button" aria-label={'Remove '+service.name} onClick={()=>{try{onRemovedSourcesChange([...removedSources,service.id]);onSourcesChange(sources.filter(id=>id!==service.id));}catch{toast.error('Could not save source changes.');}}}><Trash2 size={16}/></button></div>)}<button className="backup-button" onClick={()=>onSourcesChange([...visibleServices.map(e=>e.id),...sites.map(siteSourceId)])}>Use all services and websites</button><button className="backup-button" onClick={()=>{try{onRemovedSourcesChange([]);onSourcesChange([...defaultSources(),...sources.filter(id=>id.startsWith('site:'))]);toast.success('Default sources restored. Your custom websites and topics are unchanged.');}catch{toast.error('Could not restore default sources.');}}}>Reset to Default</button></div></div>{sites.length>0&&<div className="saved-sites"><div className="source-section-heading"><h3 className="site-form-title">Saved websites ({sites.length})</h3><small>{sites.filter(x=>chosen.has(siteSourceId(x))).length} of {sites.length} in use</small>{sites.some(x=>!x.feedUrl)&&<button className="backup-button" disabled={checking} onClick={findAllFeeds}>{checking?'Looking…':'Find feeds for all'}</button>}<button className="backup-button" disabled={checking} onClick={addSuggested}>{checking?'Checking…':'Add suggested sources'}</button></div>{bulkFeed&&<p className="sites-help feed-check">{bulkFeed}</p>}{sites.map(site=><div className="saved-site-row" key={site.url}><a href={site.url} target="_blank" rel="noopener noreferrer" title={site.name+' — '+site.url}><strong>{site.name}</strong><small>{site.feedUrl?'Direct RSS':'Needs search service'} · {chosen.has(siteSourceId(site))?'In use':'Off'}</small></a><button className="backup-button" onClick={()=>toggleSource(siteSourceId(site))}>{chosen.has(siteSourceId(site))?'Stop using':'Use this'}</button><button className="edit-site" title={'Edit '+site.name} aria-label={'Edit '+site.name} onClick={()=>edit(site)}><Pencil size={15}/></button><button aria-label={'Remove '+site.name} onClick={()=>{try{persist(sites.filter(s=>s.url!==site.url));onSourcesChange(sources.filter(x=>x!==siteSourceId(site)));if(editing===site.url)clearForm();}catch{toast.error('Could not save site changes.');}}}><Trash2 size={16}/></button></div>)}</div>}{sites.length===0&&<p className="sites-help">No custom websites yet. Add your first website below.</p>}{!showForm&&<button className="backup-button" onClick={()=>{clearForm();setShowForm(true);}}><Plus size={15}/>Add Website</button>}{showForm&&<form ref={formRef} onSubmit={submit}><h3 className="site-form-title">{editing?'Edit website':'Add website'}</h3><div className="site-form-row"><label>Website name<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} placeholder="e.g. TechCrunch"/></label><label>Website URL<input value={url} onChange={e=>setUrl(e.target.value)} type="url" required maxLength={4096} placeholder="https://techcrunch.com"/></label></div><label>Site search URL (optional)<input value={searchUrl} onChange={e=>setSearchUrl(e.target.value)} maxLength={4096} placeholder="https://example.com/search?q={query}"/></label><p className="sites-help">Use {'{query}'} where the keywords go. Leave this blank to search this website through Google. “Show stories” uses the selected news sources and may not find every page.</p><label>Full-text feed URL (optional)<input value={feedUrl} onChange={e=>setFeedUrl(e.target.value)} maxLength={4096} placeholder="https://example.com/feed"/></label><div className="form-actions"><button type="button" className="secondary" disabled={checking||!url} onClick={findFeed}>{checking?'Looking…':'Find feed'}</button><button type="button" className="secondary" disabled={checking||!feedUrl} onClick={testFeed}>{checking?'Checking…':'Test feed'}</button></div>{feedCheck&&<p className="sites-help feed-check">{feedCheck}</p>}<p className="sites-help">An RSS or Atom address on this same website. Publishers that put the whole article in their feed give cards a long summary instead of a one-line teaser; publishers that only syndicate a teaser still show the teaser. Articles from the feed are filtered by your topic keywords.</p><div className="form-actions"><button type="button" className="secondary" onClick={clearForm}>Cancel</button><button className="primary" disabled={!editing&&sites.length>=30}>{editing?'Save changes':'Add site'}</button></div></form>}</DialogContent></Dialog></>;
}
