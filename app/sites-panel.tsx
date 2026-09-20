'use client';
import {useState,useRef,useEffect} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {ArrowUpRight,Search,Trash2,Plus,Pencil,Info,ChevronDown,ChevronUp,Check} from 'lucide-react';
import {toast} from 'sonner';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {safeUrl,siteSearchLink,services,defaultSources,siteSourceId,sourceHost,audiences,siteAudience,audienceAllows,type Topic,type Audience,type NewsSite} from '@/lib/news';
import {type SourceCandidate,type SuggestedSite} from '@/lib/suggested-sites';
import {feedEndpoint,discoverEndpoint,suggestEndpoint} from '@/lib/browser-library';
import {writeLibrary} from '@/lib/browser-library';
export default function SitesPanel({topics,maxAudience,sites,onChange,keywords,sources,onSourcesChange,removedSources,onRemovedSourcesChange}:{topics:Topic[];maxAudience:Audience;removedSources:string[];onRemovedSourcesChange:(ids:string[])=>void;sites:NewsSite[];onChange:(sites:NewsSite[])=>void;keywords:string;sources:string[];onSourcesChange:(next:string[])=>void}){
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
 // Who this website writes for. Used by the reading filters, and set here
 // because the reader is the only one who can say.
 const [audience,setAudience]=useState<Audience>('general');
 // A feed that cannot be read and a feed that matches no keywords both show an
 // empty topic, so the check reports the two separately.
 const [feedCheck,setFeedCheck]=useState('');
 const [checking,setChecking]=useState(false);
 const [bulkFeed,setBulkFeed]=useState('');
 // Live discovery uses the current topic list and excludes existing publishers.
 const [offered,setOffered]=useState<{site:SuggestedSite;items:number}[]|null>(null);
 const [picked,setPicked]=useState<string[]>([]);
 const [suggesting,setSuggesting]=useState(false);
 const suggestionRequest=useRef<AbortController|null>(null);
 useEffect(()=>()=>suggestionRequest.current?.abort(),[]);
 function cancelSuggestions(){suggestionRequest.current?.abort();suggestionRequest.current=null;setSuggesting(false);setChecking(false);setBulkFeed('Source lookup cancelled. No sites were added.');}
 async function addSuggested(){
  if(sites.length>=30){setBulkFeed('There is no room for more websites. Remove some first.');return;}
  if(!topics.length){setBulkFeed('Add a keyword topic first so suggestions can match your interests.');return;}
  const controller=new AbortController();suggestionRequest.current=controller;
  setChecking(true);setSuggesting(true);setBulkFeed('Searching for publishers across '+topics.length+' keyword topics…');
  try{
   const response=await fetch(suggestEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topics,sites:sites.map(s=>({url:s.url}))}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(100000)])});
   const data=await response.json() as {candidates?:SourceCandidate[];error?:string;partial?:boolean};
   if(!response.ok)throw Error(data.error||'Could not search for new sources.');
   const candidates=(data.candidates??[]).slice(0,12);
   if(!candidates.length){setBulkFeed('No new publishers were found for these topics. Try broader keywords; your existing sources are excluded.');return;}
   const working:({site:SuggestedSite;items:number}|null)[]=candidates.map(()=>null);
   let next=0,finished=0;
   await Promise.all(Array.from({length:Math.min(3,candidates.length)},async()=>{
    while(next<candidates.length&&!controller.signal.aborted){
     const index=next++,candidate=candidates[index];
     try{
      const r=await fetch(discoverEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:candidate.url}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000)])});
      const found=await r.json() as {feeds?:{url:string;items:number}[]};
      const feed=found.feeds?.find(f=>f.items>0);
      if(r.ok&&feed&&!sites.some(s=>s.feedUrl===feed.url))working[index]={site:{name:candidate.name.slice(0,60),url:candidate.url,searchUrl:'',feedUrl:feed.url,audience:'general',covers:candidate.topics.join(', '),sample:candidate.sample,sampleUrl:candidate.sampleUrl},items:feed.items};
     }catch{/* An unavailable publisher is not offered as a working source. */}
     finished++;if(!controller.signal.aborted)setBulkFeed('Checking publisher feeds… '+finished+' of '+candidates.length);
    }
   }));
   if(controller.signal.aborted)return;
   const seen=new Set<string>();
   const verified=working.filter((x):x is {site:SuggestedSite;items:number}=>Boolean(x)).filter(x=>{if(seen.has(x.site.feedUrl))return false;seen.add(x.site.feedUrl);return true;});
   if(!verified.length){setBulkFeed('Found relevant publishers, but none of the checked sites offered a readable feed. Try again later or add a website manually.');return;}
   setBulkFeed('Found '+verified.length+' new sources for your topics. '+(candidates.length-verified.length)+' publishers had no usable new feed.'+(data.partial?' Some index searches were unavailable; these are from the searches that responded.':''));
   setPicked(maxAudience==='general'?verified.map(x=>x.site.feedUrl):[]);setOffered(verified);
  }catch(error){if(!controller.signal.aborted)setBulkFeed(error instanceof Error&&error.name==='TimeoutError'?'The source lookup took too long. Try again.':error instanceof TypeError?'Could not reach source discovery. Try again.':error instanceof Error?error.message:'Could not find suggested sources.');}
  finally{if(suggestionRequest.current===controller){suggestionRequest.current=null;setChecking(false);setSuggesting(false);}}
 }
 function confirmSuggested(){
  const keep=(offered??[]).filter(x=>picked.includes(x.site.feedUrl)&&!sites.some(s=>sourceHost(s.url)===sourceHost(x.site.url)||s.feedUrl===x.site.feedUrl)).slice(0,30-sites.length);
  try{
   persist([...sites,...keep.map(({site})=>({name:site.name,url:site.url,searchUrl:site.searchUrl,feedUrl:site.feedUrl,audience:site.audience}))]);
   onSourcesChange([...new Set([...sources,...keep.map(x=>siteSourceId(x.site))])]);
   setBulkFeed('Added '+keep.length+' source'+(keep.length===1?'':'s')+'.');
  }catch{setBulkFeed('Those feeds work but could not be saved.');}
  setOffered(null);
 }
 const suggestionDialog=<Dialog open={offered!==null} onOpenChange={open=>{if(!open)setOffered(null);}}><DialogContent className="editor">
  <DialogTitle>Add these sources?</DialogTitle>
  <DialogDescription>These publishers appeared in searches for your topics and have a working feed. Review the example coverage and select the sources you want.</DialogDescription>
  <p className="sites-help">New sources start as General. Set an audience only after reviewing the website.{maxAudience!=='general'?' Your reading filter currently allows '+maxAudience+' and below.':''}</p>
  <div className="suggestion-list">{(offered??[]).map(({site,items})=>{const on=picked.includes(site.feedUrl);return <div className="suggested-source" key={site.feedUrl}>
   <button role="menuitemcheckbox" aria-checked={on} className={'source-option '+(on?'is-on':'')} onClick={()=>setPicked(old=>on?old.filter(x=>x!==site.feedUrl):[...old,site.feedUrl])}><span className="source-tick">{on&&<Check size={13}/>}</span><span className="source-name">{site.name}<small>Matches: {site.covers} · {items} feed articles</small></span></button>
   <a href={site.url} target="_blank" rel="noopener noreferrer">{sourceHost(site.url)}</a>
   <a href={site.sampleUrl} target="_blank" rel="noopener noreferrer" className="suggested-headline">Example coverage: {site.sample}</a>
   <label>Audience<select aria-label={'Audience for suggestion '+site.name} value={siteAudience(site)} onChange={e=>setOffered(old=>old?.map(x=>x.site.feedUrl===site.feedUrl?{...x,site:{...x.site,audience:e.target.value as Audience}}:x)??null)}>{audiences.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
   {!audienceAllows(maxAudience,siteAudience(site))&&<small>Your current reading filter will hold this source back.</small>}
  </div>;})}</div>
  <div className="form-actions"><button className="secondary" onClick={()=>setOffered(null)}>Cancel</button><button className="primary" disabled={!picked.length} onClick={confirmSuggested}>Add {picked.length} source{picked.length===1?'':'s'}</button></div>
 </DialogContent></Dialog>;

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
 function clearForm(){setShowForm(false);setEditing(null);setName('');setUrl('');setSearchUrl('');setFeedUrl('');setAudience('general');}
 function edit(site:NewsSite){setShowForm(true);setEditing(site.url);setName(site.name);setUrl(site.url);setSearchUrl(site.searchUrl);setFeedUrl(site.feedUrl||'');setAudience(siteAudience(site));formRef.current?.scrollIntoView({block:'nearest',behavior:'smooth'});}
 function submit(e:React.FormEvent){e.preventDefault();try{
 const normalized=safeUrl(url);
 if(sites.some(s=>s.url===normalized&&s.url!==editing))throw Error('duplicate');
 const entry={name:name.trim()||new URL(normalized).hostname,url:normalized,searchUrl:searchUrl.trim(),feedUrl:feedUrl.trim(),audience};
 if(entry.feedUrl)safeUrl(entry.feedUrl);
 const next=editing?sites.map(s=>s.url===editing?entry:s):[...sites,entry];
 persist(next);const oldId=editing?'site:'+editing:'';onSourcesChange([...sources.filter(id=>id!==oldId),...(!editing||chosen.has(oldId)?[siteSourceId(entry)]:[])]);toast.success(editing?'Website updated.':'Website added.');clearForm();
 }catch(e){toast.error(e instanceof Error&&e.message==='duplicate'?'That URL is already in your list. Edit the existing entry.':e instanceof Error&&e.message==='feed'?'The feed address must be on the same website.':'Enter a valid website URL. An optional search URL must use the same website and contain {query}. Maximum 30 sites.');}}
 return <div className="settings-panel">
  {suggestionDialog}
  <div className="panel-actions">
   <button type="button" className="primary" disabled={showForm} onClick={()=>{clearForm();setShowForm(true);}}><Plus size={15}/>Add Website</button>
   <button type="button" className="secondary" disabled={checking} onClick={addSuggested}>{suggesting?'Finding sources…':'Add suggested sources'}</button>{suggesting&&<button type="button" className="secondary" onClick={cancelSuggestions}>Cancel lookup</button>}
   {sites.some(x=>!x.feedUrl)&&<button type="button" className="secondary" disabled={checking} onClick={findAllFeeds}>{checking?'Looking…':'Find feeds for all'}</button>}
   <span className="count">{sites.length} saved · {visibleServices.length} services</span>
  </div>
  <p className="sites-help">Add suggested sources searches Google News and Bing for publishers covering your keyword topics, excludes existing sites and default services, then checks their feeds. It does not change your selected news services.</p>
  {bulkFeed&&<p className="sites-help feed-check">{bulkFeed}</p>}
  {showForm&&<form ref={formRef} onSubmit={submit}><h3 className="site-form-title">{editing?'Edit website':'Add website'}</h3><div className="site-form-row"><label>Website name<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} placeholder="e.g. TechCrunch"/></label><label>Website URL<input value={url} onChange={e=>setUrl(e.target.value)} type="url" required maxLength={4096} placeholder="https://techcrunch.com"/></label></div><label>Site search URL (optional)<input value={searchUrl} onChange={e=>setSearchUrl(e.target.value)} maxLength={4096} placeholder="https://example.com/search?q={query}"/></label><p className="sites-help">Use {'{query}'} where the keywords go. Leave this blank to search this website through Google. “Show stories” uses the selected news sources and may not find every page.</p><label>Full-text feed URL (optional)<input value={feedUrl} onChange={e=>setFeedUrl(e.target.value)} maxLength={4096} placeholder="https://example.com/feed"/></label><label>Written for<select aria-label="Written for" value={audience} onChange={e=>setAudience(e.target.value as Audience)}>{audiences.map(a=><option key={a.id} value={a.id}>{a.label} — {a.hint}</option>)}</select></label><p className="sites-help">Your own judgement about this website, used by the reading filters under Settings. It is not a rating anyone awards, and it says nothing about any one article.</p><div className="form-actions"><button type="button" className="secondary" disabled={checking||!url} onClick={findFeed}>{checking?'Looking…':'Find feed'}</button><button type="button" className="secondary" disabled={checking||!feedUrl} onClick={testFeed}>{checking?'Checking…':'Test feed'}</button></div>{feedCheck&&<p className="sites-help feed-check">{feedCheck}</p>}<p className="sites-help">An RSS or Atom address on this same website. Publishers that put the whole article in their feed give cards a long summary instead of a one-line teaser; publishers that only syndicate a teaser still show the teaser. Articles from the feed are filtered by your topic keywords.</p><div className="form-actions"><button type="button" className="secondary" onClick={clearForm}>Cancel</button><button className="primary" disabled={!editing&&sites.length>=30}>{editing?'Save changes':'Add site'}</button></div></form>}
  <DialogDescription>View your news services and saved websites. Add or edit website links below; your changes are saved in this browser.</DialogDescription><div className="all-source-services"><div className="source-section-heading"><button className="section-toggle" aria-expanded={servicesOpen} aria-controls="news-services" onClick={toggleServices} aria-label={(servicesOpen?"Minimize":"Expand")+" news services"} title={(servicesOpen?"Minimize":"Expand")+" news services"}>{servicesOpen?<ChevronUp size={15}/>:<ChevronDown size={15}/>}<h3 className="site-form-title">News services</h3><small>{visibleServices.filter(x=>chosen.has(x.id)).length} of {visibleServices.length} in use</small></button><Popover><PopoverTrigger asChild><button className="info-button" aria-label="How source controls and feeds work"><Info size={15}/></button></PopoverTrigger><PopoverContent className="info-pop" align="start"><strong>Source controls and feeds</strong><p className="sites-help">Remove hides a default source from your personal list until you reset the defaults. Stop using keeps it in the list but turns it off.</p><p className="sites-help">Only enabled news services retrieve search results. Websites without an RSS feed need at least one enabled service; RSS feeds work independently.</p></PopoverContent></Popover></div><div id="news-services" hidden={!servicesOpen}>{visibleServices.map(service=><div className="service-row" key={service.id}><a href={service.url||({bing:'https://www.bing.com/news',google:'https://news.google.com',hackernews:'https://news.ycombinator.com'} as Record<string,string>)[service.id]} target="_blank" rel="noopener noreferrer"><strong>{service.name}</strong><small>{service.kind==='feed'?'Direct RSS feed — works without search services':service.kind==='search'?'Needs an enabled search service':'Search service'}</small></a><span className="service-status">{chosen.has(service.id)?'In use':'Not selected'}<small className="audience-chip">General</small></span><button className="backup-button" onClick={()=>toggleSource(service.id)}>{chosen.has(service.id)?'Stop using':'Use this'}</button><button className="backup-button" aria-label={'Remove '+service.name} onClick={()=>{try{onRemovedSourcesChange([...removedSources,service.id]);onSourcesChange(sources.filter(id=>id!==service.id));}catch{toast.error('Could not save source changes.');}}}><Trash2 size={16}/></button></div>)}<button className="backup-button" onClick={()=>onSourcesChange([...visibleServices.map(e=>e.id),...sites.map(siteSourceId)])}>Use all services and websites</button><button className="backup-button" onClick={()=>{try{onRemovedSourcesChange([]);onSourcesChange([...defaultSources(),...sources.filter(id=>id.startsWith('site:'))]);toast.success('Default sources restored. Your custom websites and topics are unchanged.');}catch{toast.error('Could not restore default sources.');}}}>Reset to Default</button></div></div><div className="saved-sites"><div className="source-section-heading"><h3 className="site-form-title">Saved websites ({sites.length})</h3><small>{sites.filter(x=>chosen.has(siteSourceId(x))).length} of {sites.length} in use</small></div>{sites.length>0&&<>{sites.map(site=><div className="saved-site-row" key={site.url}><a href={site.url} target="_blank" rel="noopener noreferrer" title={site.name+' — '+site.url}><strong>{site.name}</strong><small>{site.feedUrl?'Direct RSS':'Needs search service'} · {chosen.has(siteSourceId(site))?'In use':'Off'}</small></a><select className="audience-select" aria-label={'Audience for '+site.name} value={siteAudience(site)} onChange={e=>{try{persist(sites.map(x=>x.url===site.url?{...x,audience:e.target.value as Audience}:x));}catch{toast.error('Could not save that label.');}}}>{audiences.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select><a className="site-link" href={site.url} target="_blank" rel="noopener noreferrer" title={'Open '+site.name} aria-label={'Open '+site.name}><ArrowUpRight size={15}/></a><a className="site-link" href={siteSearchLink(site,keywords)} target="_blank" rel="noopener noreferrer" title={'Search '+site.name+' for the current keywords'} aria-label={'Search selected keywords on '+site.name}><Search size={14}/></a><button className="backup-button" onClick={()=>toggleSource(siteSourceId(site))}>{chosen.has(siteSourceId(site))?'Stop using':'Use this'}</button><button className="edit-site" title={'Edit '+site.name} aria-label={'Edit '+site.name} onClick={()=>edit(site)}><Pencil size={15}/></button><button aria-label={'Remove '+site.name} onClick={()=>{try{persist(sites.filter(s=>s.url!==site.url));onSourcesChange(sources.filter(x=>x!==siteSourceId(site)));if(editing===site.url)clearForm();}catch{toast.error('Could not save site changes.');}}}><Trash2 size={16}/></button></div>)}</>}</div>{sites.length===0&&<p className="sites-help">No custom websites yet. Use Add suggested sources above, or add your own below.</p>}
 </div>;
}
