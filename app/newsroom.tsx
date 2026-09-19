'use client';
import {useEffect,useState,useRef,type CSSProperties} from 'react';
import {Slider} from '@/components/ui/slider';
import SourcesPicker from './sources-picker';
import SettingsPreview from './settings-preview';
import SettingsDialog,{type SettingsTab} from './settings-dialog';
import MasterAdmin from './master-admin';
import {ArrowUpRight,Bookmark,RefreshCw,Settings2,Newspaper,BookOpen,Info,Eye,EyeOff,ShieldCheck} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {Toaster,toast} from 'sonner';
import {defaults,safeUrl,allSources,sourceHost,matchTopic,topicQueryGroups,services,engines,engineIds,audiences,audienceAllows,blockedBy,type Topic,type Article,type NewsSite,type Audience} from '@/lib/news';
import {readLibrary,writeLibrary,feedEndpoint,articleEndpoint,readFeedCache,writeFeedCache,restoreBackup,readSourceSelection,type SettingsBackup} from '@/lib/browser-library';
export default function Newsroom(){
 const [sites,setSites]=useState<NewsSite[]>([]),[sources,setSources]=useState<string[]>([]);
 const [settingsOpen,setSettingsOpen]=useState(false),[settingsTab,setSettingsTab]=useState<SettingsTab>('topics');
 function openSettings(tab:SettingsTab){setSettingsTab(tab);setSettingsOpen(true);}
 const [removedSources,setRemovedSources]=useState<string[]>([]);
 // Reading filters. The audience label decides which sources are read at all,
 // so it belongs to the fetch; blocked words are applied to what is on screen,
 // so changing the list takes effect without fetching again.
 const [maxAudience,setMaxAudience]=useState<Audience>('general'),[blockedWords,setBlockedWords]=useState<string[]>([]);
 async function saveFilters(next:{maxAudience:Audience;blockedWords:string[]}){writeLibrary({action:'filters',...next});setMaxAudience(next.maxAudience);setBlockedWords(next.blockedWords);}
 // Every selected source is searched by site and no search service is on, so
 // there is nothing to run the searches. Offer the fix rather than the name of it.
 const [needsService,setNeedsService]=useState(false);
 const [onlySites,setOnlySites]=useState(()=>{try{return localStorage.getItem('mynews-only-sites')==='true';}catch{return false;}});
 function chooseOnlySites(next:boolean){setOnlySites(next);try{localStorage.setItem('mynews-only-sites',String(next));}catch{}}
 function enableSearchServices(){
  const restored=removedSources.filter(id=>!engineIds.includes(id));
  if(restored.length!==removedSources.length)changeRemovedSources(restored);
  chooseSources([...new Set([...sources,...engineIds])]);
 }
 function changeRemovedSources(next:string[]){writeLibrary({action:'removedSources',removedSources:next});setRemovedSources(next);}
 function clearSourceSites(){writeLibrary({action:'clearSources'});setSites([]);setRemovedSources(services.map(s=>s.id));chooseSources([]);setTab('All stories');}
 function chooseSources(next:string[]){setSources(next);try{localStorage.setItem('mynews-sources',JSON.stringify(next));}catch{}}

 const [restoreRevision,setRestoreRevision]=useState(0);
 const [pendingBackup,setPendingBackup]=useState<SettingsBackup|null>(null);
 function confirmRestore(){if(!pendingBackup)return;try{const restored=restoreBackup(pendingBackup);setTopics(restored.topics);setSites(restored.sites);setRemovedSources(restored.removedSources);setMaxAudience(restored.maxAudience);setBlockedWords(restored.blockedWords);chooseSources(restored.sources!);setSaved(restored.articles);setOnlySites(restored.onlySites);setHideExcerpt(restored.hideExcerpt);setRestoreRevision(n=>n+1);adjustFont(restored.fontSize);setLibraryReady(true);setLibraryError('');setSigned(true);setTab('All stories');setPendingBackup(null);toast.success('All settings restored, including reading filters and display preferences.');}catch{toast.error('Could not restore. Browser storage may be full or unavailable.');}}

 // Article text is fetched only when a reader asks for it, and the Worker
 // shares one read with everyone who opens the same link.
 const [summaries,setSummaries]=useState<Record<string,{text?:string;error?:string;loading?:boolean}>>({});
 async function readMore(a:Article){
  if(summaries[a.url]?.loading||summaries[a.url]?.text)return;
  setSummaries(old=>({...old,[a.url]:{loading:true}}));
  try{
   const r=await fetch(articleEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:a.url}),signal:AbortSignal.timeout(25000)});
   const data=await r.json() as {summary?:string;error?:string};
   if(!r.ok||!data.summary)throw Error(data.error||'That article could not be read.');
   setSummaries(old=>({...old,[a.url]:{text:data.summary}}));
  }catch(e){setSummaries(old=>({...old,[a.url]:{error:e instanceof Error?e.message:'That article could not be read.'}}));}
 }

 // Headline-only reading is stored locally and included in settings backups.
 const [hideExcerpt,setHideExcerpt]=useState(false);
 useEffect(()=>{try{setHideExcerpt(localStorage.getItem('mynews-hide-excerpt')==='true');}catch{}},[]);
 function toggleExcerpt(){setHideExcerpt(old=>{const next=!old;try{localStorage.setItem('mynews-hide-excerpt',String(next));}catch{}return next;});}

 const [fontSize,setFontSize]=useState(16);
 useEffect(()=>{try{const n=Number(localStorage.getItem('mynews-font-size'));if(n>=12&&n<=24)setFontSize(n);}catch{}},[]);
 function adjustFont(n:number){const size=Math.max(12,Math.min(24,n));setFontSize(size);try{localStorage.setItem('mynews-font-size',String(size));}catch{}}

 const [topics,setTopics]=useState<Topic[]>(defaults),[saved,setSaved]=useState<Article[]>([]),[feed,setFeed]=useState<Article[]>([]),[tab,setTab]=useState('All stories'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[signed,setSigned]=useState(false),[libraryReady,setLibraryReady]=useState(false),[libraryError,setLibraryError]=useState(''),[refresh,setRefresh]=useState(0),[fetchedAt,setFetchedAt]=useState(''),[dialog,setDialog]=useState<'article'|null>(null),[busy,setBusy]=useState(false),[articleTopic,setArticleTopic]=useState('General');
 useEffect(()=>{try{const data=readLibrary();setSaved(data.articles);setTopics(data.topics);setSites(data.sites);setRemovedSources(data.removedSources);setMaxAudience(data.maxAudience);setBlockedWords(data.blockedWords);setSources(readSourceSelection(data));setSigned(true);setLibraryReady(true);}catch{setLibraryError('Browser storage is unavailable. Allow site storage to save articles and topics.');setLoading(false);}},[]);
 // Stories are fetched only when asked for: pressing Refresh news, or opening
 // a source selection that has nothing cached. Reopening the tab restores the
 // last edition rather than searching again.
 const feedKey=JSON.stringify({version:6,onlySites,maxAudience,removedSources,sources:[...sources].sort(),topics:topics.map(t=>[t.name,t.keywords]),sites:sites.map(s=>[s.url,s.feedUrl,s.audience])});
 const forced=useRef(false);
 function refreshNews(){forced.current=true;setRefresh(x=>x+1);}
 useEffect(()=>{
 if(!libraryReady)return;
 const wasForced=forced.current;forced.current=false;
 if(!wasForced){
  const cached=readFeedCache(feedKey);
  if(cached){setFeed(cached.articles);setFetchedAt(cached.fetchedAt);setLoading(false);setError('');return;}
 }
 const controller=new AbortController();
 setFeed([]);setFetchedAt('');setLoading(true);setError('');setNeedsService(false);
 // Each chosen source becomes its own set of requests: an index answers as
 // few keyword queries as the length limit allows, a source with a feed is
 // read from that feed, and the sites that must be searched share one
 // site-restricted query per index.
 const chosen=new Set(sources);
 const selected=allSources(sites,removedSources).filter(x=>chosen.has(x.id));
 // A source above the chosen audience is not read at all, rather than read and
 // then filtered: it saves the request and it is the only honest reading of
 // "do not show me this source".
 const picked=selected.filter(x=>audienceAllows(maxAudience,x.audience));
 const heldBack=selected.length-picked.length;
 const chosenEngines=picked.filter(x=>x.kind==='engine').map(x=>x.id);
 const feedSources=picked.filter(x=>x.kind==='feed'&&x.feedUrl&&x.url);
 const searchHosts=picked.filter(x=>x.kind==='search'&&x.url).map(x=>sourceHost(x.url!)).slice(0,15);
 const groups=topicQueryGroups(topics);
 const jobs=[
  ...(onlySites&&searchHosts.length?[]:groups.flatMap(q=>chosenEngines.map(p=>({q,provider:p,feed:'',site:''})))),
  ...feedSources.map(x=>({q:'',provider:'sitefeed',feed:x.feedUrl!,site:sourceHost(x.url!)})),
  ...(searchHosts.length?groups.flatMap(q=>chosenEngines.map(p=>({q,provider:p,feed:'',site:searchHosts.join(',')}))):[]),
 ];
 if(!jobs.length){setFeed([]);setLoading(false);setNeedsService(searchHosts.length>0&&!heldBack);setError(heldBack&&!picked.length?'Reading filters are set to “'+audiences.find(a=>a.id===maxAudience)!.label+' and below”, and none of your '+heldBack+' selected source'+(heldBack===1?' is':'s are')+' labelled that way. Label a website under Settings › Source sites, or change the filter under Settings › Reading filters.':searchHosts.length?'These websites have no full-text feed, so they can only be reached by searching. Turn on a search service to use as the index. Tick “Only from my sites” under Sources to keep results to these websites alone.':'No sources are selected. Choose at least one under Sources.');return;}
 const label=(job:{provider:string;site:string})=>job.provider==='sitefeed'?job.site:({bing:'Bing News',google:'Google News',hackernews:'Hacker News'} as Record<string,string>)[job.provider]||job.provider;
 Promise.allSettled(jobs.map(async job=>{const q=job.q;const params=new URLSearchParams({q,provider:job.provider,...(job.feed?{feed:job.feed}:{}),...(job.site?{site:job.site}:{})});const r=await fetch(feedEndpoint()+'?'+params,{signal:controller.signal});const data=await r.json() as {error:string;articles:Article[]};if(!r.ok)throw Error(data.error);return data.articles.map(a=>({...a,topic:matchTopic(a,topics)}));})).then(results=>{
 if(controller.signal.aborted)return;
 const all=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);
 const seen=new Set<string>();const unique=all.filter(a=>{const title=a.title.toLowerCase().replace(/[^a-z0-9]/g,'');if(seen.has(a.url)||seen.has(title))return false;seen.add(a.url);seen.add(title);return true;});
 const sorted=unique.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
 setFeed(sorted);
 const broken=Array.from(new Set(results.flatMap((r,i)=>r.status==='rejected'?[label(jobs[i])]:[])));
 if(results.every(r=>r.status==='rejected')){setError('Nothing could be loaded from '+broken.join(', ')+'. Check the addresses under View / edit sites, or press Refresh news to try again.');}
 else if(broken.length){setError('Some sources did not answer: '+broken.join(', ')+'. Everything else below is up to date.');}
 else{const at=new Date().toISOString();setFetchedAt(at);writeFeedCache(feedKey,{articles:sorted,fetchedAt:at});}
 setLoading(false);
 });return()=>controller.abort();
 },[feedKey,refresh,libraryReady]);// eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{const context=(document as Document & {modelContext?:{registerTool:(t:unknown,o:unknown)=>void|Promise<void>}}).modelContext;if(!context)return;const lifecycle=new AbortController();try{void Promise.resolve(context.registerTool({name:'view_news_topic',description:'Switch the visible news view to an existing topic or the reading list.',inputSchema:{type:'object',properties:{topic:{type:'string'}},required:['topic'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:{topic:string})=>{if(!['All stories','Reading list',...topics.map(t=>t.name)].includes(input.topic))throw Error('Unknown topic');setTab(input.topic);return {selectedTopic:input.topic};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}return()=>lifecycle.abort();},[topics]);
 async function mutate(body:unknown){writeLibrary(body);}
 async function save(a:Article){if(!signed){toast.error('Browser storage is unavailable.');return;}try{await mutate({action:'save',article:a});setSaved(old=>[a,...old.filter(x=>x.url!==a.url)]);toast.success('Added to your reading list');}catch(e){toast.error((e as Error).message);}}
 async function remove(a:Article){try{await mutate({action:'remove',id:a.id});setSaved(old=>old.filter(x=>x.id!==a.id));toast.success('Removed from reading list');}catch(e){toast.error((e as Error).message);}}
 async function addArticle(event:React.FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const data=new FormData(form);setBusy(true);try{const url=safeUrl(String(data.get('url')));const a:Article={id:url,url,title:String(data.get('title')).trim()||new URL(url).hostname,excerpt:String(data.get('excerpt')).trim(),source:new URL(url).hostname.replace(/^www\./,''),date:new Date().toISOString(),topic:articleTopic};await mutate({action:'save',article:a});setSaved(old=>[a,...old.filter(x=>x.url!==url)]);setDialog(null);setTab('Reading list');toast.success('Article saved');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 const inTab=tab==='Reading list'?saved:tab==='All stories'?feed:feed.filter(a=>a.topic===tab);
 const articles=tab==='Reading list'?inTab:inTab.filter(a=>!blockedBy(a,blockedWords));
 const hiddenByWords=inTab.length-articles.length;
 const filtersOn=maxAudience!=='general'||blockedWords.length>0;
 const date=new Intl.DateTimeFormat('en-SG',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
 return <div className={"paper "+(hideExcerpt?"headlines-only":"")} style={{"--reading-size":fontSize+"px","--card-min":(fontSize*18)+"px","--card-space":(fontSize*.85)+"px"} as CSSProperties}><Toaster richColors/><div className="utility"><span>YOUR PERSONAL <MasterAdmin/></span><span>{date}</span></div><header className="masthead"><a href="./" className="brand">mynews<span>.</span></a><p>A little less noise.<br/><em>A lot more perspective.</em></p><p className="masthead-note">You can edit and personalise your Topic keywords and search source sites. Usage on corporate machines will prevent you from saving your personalised settings (topics and source sites). Save and Restore works on personal machines.</p><div className="header-actions"><div className="backup-controls"><button className="settings-icon" onClick={()=>openSettings('topics')} aria-label="Open settings"><Settings2 size={16}/>Settings</button></div></div></header><Tabs value={tab} onValueChange={setTab}><div className="navrow"><div className="tabscroll"><TabsList variant="line" className="topic-tabs">{['All stories',...topics.map(t=>t.name),'Reading list'].map(name=><TabsTrigger key={name} value={name}>{name==='Reading list'&&<Bookmark size={15}/>} {name}{name==='Reading list'&&saved.length>0&&<small>{saved.length}</small>}</TabsTrigger>)}</TabsList></div><button className="manage" onClick={()=>openSettings('topics')} aria-label="Manage topics"><Settings2 size={17}/><span>My topics</span></button></div></Tabs><main data-fetching={loading?"true":"false"}><div className="reading-toolbar"><div className="edition-status"><strong>{tab==='All stories'?'Latest stories':tab}</strong><span>{loading?'Updating…':articles.length+' articles'}</span>{filtersOn&&<button className="filter-note" onClick={()=>openSettings('filters')} title="Change the reading filters"><ShieldCheck size={13}/>{maxAudience!=='general'?audiences.find(a=>a.id===maxAudience)!.label+' and below':'Word filter on'}{hiddenByWords>0?' · '+hiddenByWords+' hidden':''}</button>}</div><div className="refresh-group"><button className="refresh-main" onClick={refreshNews} disabled={loading} aria-busy={loading}><RefreshCw size={17} className={loading?'spin':''}/>{loading?'Fetching…':'Refresh news'}</button><button className="refresh" onClick={toggleExcerpt} aria-pressed={hideExcerpt} title={hideExcerpt?'Show the excerpt on each card':'Show headlines only and shorten the cards'}>{hideExcerpt?<Eye size={15}/>:<EyeOff size={15}/>}{hideExcerpt?'Show excerpt':'Hide excerpt'}</button><span className="last-refreshed">{loading?'Fetching the latest stories…':fetchedAt?'Last refreshed '+new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(fetchedAt)):'Not refreshed yet'}</span></div><div className="source-picker"><span id="sources-label">Sources</span><SourcesPicker key={restoreRevision} removedSources={removedSources} sites={sites} sources={sources} onlySites={onlySites} onOnlySitesChange={chooseOnlySites} onChange={next=>{chooseSources(next);if(tab==='Reading list')setTab('All stories');}}/></div><div className="font-controls"><span id="font-label">Text size</span><button aria-label="Decrease text size and fit more columns" disabled={fontSize<=12} onClick={()=>adjustFont(fontSize-1)}>A−</button><Slider aria-labelledby="font-label" min={12} max={24} step={1} value={[fontSize]} onValueChange={value=>adjustFont(value[0])}/><button aria-label="Increase text size" disabled={fontSize>=24} onClick={()=>adjustFont(fontSize+1)}>A+</button><output aria-live="polite">{fontSize}px</output><button className="font-reset" onClick={()=>adjustFont(16)}>Reset</button><Popover><PopoverTrigger asChild><button className="info-button" aria-label="What does Reset change?"><Info size={14}/></button></PopoverTrigger><PopoverContent className="info-pop" align="end"><strong>Reset changes the text size only</strong><p>It puts the reading text back to 16px, the default. Card width and spacing follow the text size, so the grid returns to its usual number of columns.</p><p>Your topics, source sites, reading list, saved Settings ID and stored headlines are left exactly as they are.</p></PopoverContent></Popover></div></div>{libraryError&&<div className="notice" role="alert">{libraryError} <button onClick={()=>location.reload()}>Retry</button></div>}{error&&<div className="notice" role="alert">{error}{needsService&&<><br/><button className="primary notice-fix" onClick={enableSearchServices}>Turn on {engines.map(e=>e.name).join(", ")}</button></>}</div>}<div className="content-layout"><section aria-label="Articles" aria-busy={loading}>{loading?<div className="loading"><Newspaper size={38}/><h2>Putting your edition together</h2><p>Checking the latest stories across your topics…</p></div>:articles.length===0?<div className="loading"><Bookmark size={32}/><h2>{tab==='Reading list'?'Make room for a good read':'No stories just yet'}</h2><p>{tab==='Reading list'?'Save a headline or paste an article URL to start your collection.':fetchedAt?'Nothing matched these keywords last time. Try a broader keyword in My topics, or refresh.':'Press Refresh news to fetch the latest stories.'}</p><button className="primary" onClick={()=>tab==='Reading list'?setDialog('article'):refreshNews()}>{tab==='Reading list'?'Add an article':'Refresh news'}</button></div>:<div className="article-grid">{articles.map(a=><article className="story" key={a.url}><a className="story-link" href={a.url} target="_blank" rel="noopener noreferrer"><div className="story-meta"><span className={'tag '+(a.topic?'color-'+topics.findIndex(t=>t.name===a.topic)%3:'tag-source')}>{a.topic||a.source}</span><ArrowUpRight size={18}/></div><h2>{a.title}</h2><p>{summaries[a.url]?.text||a.excerpt||'Open the original article to read the full story.'}</p><div className="source"><strong>{a.source}</strong>{a.provider&&<span className="provider-label">via {a.provider}</span>}<span>{Number.isNaN(Date.parse(a.date))?'':new Intl.DateTimeFormat('en-SG',{month:'short',day:'numeric'}).format(new Date(a.date))}</span></div></a><button className="save" aria-label={(saved.some(x=>x.url===a.url)?'Remove saved article: ':'Save article: ')+a.title} onClick={()=>saved.some(x=>x.url===a.url)?remove(a):save(a)}><Bookmark size={16} fill={saved.some(x=>x.url===a.url)?'currentColor':'none'}/></button>{tab!=='Reading list'&&!hideExcerpt&&!summaries[a.url]?.text&&<button className="read-more" disabled={summaries[a.url]?.loading} onClick={()=>readMore(a)} title={summaries[a.url]?.error||'Read up to 250 words from the publisher'}><BookOpen size={14}/>{summaries[a.url]?.loading?'Reading…':summaries[a.url]?.error?'Unavailable':'Read more'}</button>}</article>)}</div>}</section></div></main><footer><span className="footer-brand">mynews.</span><span>Bing News · Google News · Hacker News. Excerpts where available; some links redirect to the publisher.</span><span>YOUR WORLD, WELL READ.</span></footer><Dialog open={pendingBackup!==null} onOpenChange={open=>{if(!open)setPendingBackup(null);}}><DialogContent className="editor"><DialogTitle>Apply these settings?</DialogTitle><DialogDescription>This replaces the topics, sources, reading filters, saved articles and display preferences in this browser. Save your current settings first if you want to keep them.</DialogDescription>{pendingBackup&&<SettingsPreview backup={pendingBackup}/>}<div className="form-actions"><button className="secondary" onClick={()=>setPendingBackup(null)}>Cancel</button><button className="primary" onClick={confirmRestore}>Apply settings</button></div></DialogContent></Dialog><Dialog open={dialog!==null} onOpenChange={open=>{if(!open&&!busy)setDialog(null);}}><DialogContent className="editor"><DialogTitle>Add to your reading list</DialogTitle><DialogDescription>Paste a link, then add a headline and short excerpt for easy reading.</DialogDescription>{!libraryReady?<p>Browser storage is unavailable. Enable site storage and reload to save articles.</p>:<form onSubmit={addArticle}><label>Article URL<input name="url" type="url" placeholder="https://…" maxLength={4096} required/></label><label>Headline<input name="title" placeholder="A headline worth keeping" maxLength={500}/></label><label>Short excerpt<textarea name="excerpt" placeholder="What is this story about?" maxLength={1000}/></label><label>Topic</label><Select value={articleTopic} onValueChange={setArticleTopic}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['General',...topics.map(t=>t.name).filter(n=>n!=='General')].map(n=><SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select><button className="primary" disabled={busy}>{busy?'Saving…':'Save article'}</button></form>}</DialogContent></Dialog><SettingsDialog key={restoreRevision} onClearSources={clearSourceSites} open={settingsOpen} onOpenChange={setSettingsOpen} tab={settingsTab} onTabChange={setSettingsTab} topics={topics} onSaveTopics={async next=>{await mutate({action:'topics',topics:next});setTopics(next);setTab('All stories');}} sites={sites} onSitesChange={setSites} keywords={(tab==='All stories'||tab==='Reading list'?topics:topics.filter(t=>t.name===tab)).map(t=>t.keywords.split(',').map(k=>k.trim()).join(' OR ')).join(' OR ')} sources={sources} onSourcesChange={next=>{chooseSources(next);if(tab==='Reading list')setTab('All stories');}} removedSources={removedSources} onRemovedSourcesChange={changeRemovedSources} maxAudience={maxAudience} blockedWords={blockedWords} onSaveFilters={saveFilters} fontSize={fontSize} libraryReady={libraryReady} onApplyBackup={setPendingBackup}/></div>;
}


