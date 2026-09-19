'use client';
import {useEffect,useState,useRef,type CSSProperties} from 'react';
import {Slider} from '@/components/ui/slider';
import SitesBar from './sites-bar';
import SourcesPicker from './sources-picker';
import CollapsibleArea from './collapsible-area';
import SettingsManager from './settings-manager';
import MasterAdmin from './master-admin';
import {ArrowUpRight,Bookmark,Plus,RefreshCw,Settings2,Trash2,Newspaper,BookOpen,Info,Eye,EyeOff} from 'lucide-react';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {Toaster,toast} from 'sonner';
import {defaults,safeUrl,allSources,sourceHost,matchTopic,engines,engineIds,type Topic,type Article,type NewsSite} from '@/lib/news';
import {readLibrary,writeLibrary,feedEndpoint,articleEndpoint,readFeedCache,writeFeedCache,restoreBackup,readSourceSelection,type SettingsBackup} from '@/lib/browser-library';
export default function Newsroom(){
 const [sites,setSites]=useState<NewsSite[]>([]),[sitesOpen,setSitesOpen]=useState(false),[sources,setSources]=useState<string[]>([]);
 const [removedSources,setRemovedSources]=useState<string[]>([]);
 // Every selected source is searched by site and no search service is on, so
 // there is nothing to run the searches. Offer the fix rather than the name of it.
 const [needsService,setNeedsService]=useState(false);
 function enableSearchServices(){
  const restored=removedSources.filter(id=>!engineIds.includes(id));
  if(restored.length!==removedSources.length)changeRemovedSources(restored);
  chooseSources([...new Set([...sources,...engineIds])]);
 }
 function changeRemovedSources(next:string[]){writeLibrary({action:'removedSources',removedSources:next});setRemovedSources(next);}
 function chooseSources(next:string[]){setSources(next);try{localStorage.setItem('mynews-sources',JSON.stringify(next));}catch{}}

 const [pendingBackup,setPendingBackup]=useState<SettingsBackup|null>(null);
 function confirmRestore(){if(!pendingBackup)return;try{const restored=restoreBackup(pendingBackup);setTopics(restored.topics);setSites(restored.sites);setRemovedSources(restored.removedSources);chooseSources(restored.sources!);setSaved(restored.articles);adjustFont(restored.fontSize);setLibraryReady(true);setLibraryError('');setSigned(true);setTab('All stories');setPendingBackup(null);toast.success('Sites, topics, saved URLs, and text size restored.');}catch{toast.error('Could not restore. Browser storage may be full or unavailable.');}}

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

 // Headline-only reading. A view preference like the collapsed sections, so
 // it stays in this browser rather than travelling in a settings backup.
 const [hideExcerpt,setHideExcerpt]=useState(false);
 useEffect(()=>{try{setHideExcerpt(localStorage.getItem('mynews-hide-excerpt')==='true');}catch{}},[]);
 function toggleExcerpt(){setHideExcerpt(old=>{const next=!old;try{localStorage.setItem('mynews-hide-excerpt',String(next));}catch{}return next;});}

 const [fontSize,setFontSize]=useState(16);
 useEffect(()=>{try{const n=Number(localStorage.getItem('mynews-font-size'));if(n>=12&&n<=24)setFontSize(n);}catch{}},[]);
 function adjustFont(n:number){const size=Math.max(12,Math.min(24,n));setFontSize(size);try{localStorage.setItem('mynews-font-size',String(size));}catch{}}

 const [topics,setTopics]=useState<Topic[]>(defaults),[saved,setSaved]=useState<Article[]>([]),[feed,setFeed]=useState<Article[]>([]),[tab,setTab]=useState('All stories'),[loading,setLoading]=useState(true),[error,setError]=useState(''),[signed,setSigned]=useState(false),[libraryReady,setLibraryReady]=useState(false),[libraryError,setLibraryError]=useState(''),[refresh,setRefresh]=useState(0),[fetchedAt,setFetchedAt]=useState(''),[dialog,setDialog]=useState<'article'|'topics'|null>(null),[draft,setDraft]=useState<Topic[]>(defaults),[busy,setBusy]=useState(false),[articleTopic,setArticleTopic]=useState('General');
 useEffect(()=>{try{const data=readLibrary();setSaved(data.articles);setTopics(data.topics);setSites(data.sites);setRemovedSources(data.removedSources);setSources(readSourceSelection(data));setSigned(true);setLibraryReady(true);}catch{setLibraryError('Browser storage is unavailable. Allow site storage to save articles and topics.');setLoading(false);}},[]);
 // Stories are fetched only when asked for: pressing Refresh news, or opening
 // a source selection that has nothing cached. Reopening the tab restores the
 // last edition rather than searching again.
 const feedKey=JSON.stringify({version:3,removedSources,sources:[...sources].sort(),topics:topics.map(t=>[t.name,t.keywords]),sites:sites.map(s=>[s.url,s.feedUrl])});
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
 // Each chosen source becomes its own set of requests: an engine searches
 // every topic, a source with a feed is read from that feed, and the ones
 // that have to be searched are combined into a single site-restricted query
 // per engine, so selecting twelve costs no more requests than selecting three.
 const chosen=new Set(sources);
 const picked=allSources(sites,removedSources).filter(x=>chosen.has(x.id));
 const chosenEngines=picked.filter(x=>x.kind==='engine').map(x=>x.id);
 const feedSources=picked.filter(x=>x.kind==='feed'&&x.feedUrl&&x.url);
 const searchHosts=picked.filter(x=>x.kind==='search'&&x.url).map(x=>sourceHost(x.url!)).slice(0,15);
 // Disabled engines must never be re-enabled to search publisher websites.
 const searchEngines=chosenEngines;
 const jobs=[
  ...topics.flatMap(t=>chosenEngines.map(p=>({topic:t as Topic|null,provider:p,feed:'',site:''}))),
  ...feedSources.map(x=>({topic:null,provider:'sitefeed',feed:x.feedUrl!,site:sourceHost(x.url!)})),
  ...(searchHosts.length?topics.flatMap(t=>searchEngines.map(p=>({topic:t,provider:p,feed:'',site:searchHosts.join(',')}))):[]),
 ];
 if(!jobs.length){setFeed([]);setLoading(false);setNeedsService(searchHosts.length>0);setError(searchHosts.length?'These websites have no full-text feed, so they can only be reached by searching. Turn on a search service and results still come only from the websites you selected — the service is the index, not a source of stories.':'No sources are selected. Choose at least one under Sources.');return;}
 const label=(job:{provider:string;site:string})=>job.provider==='sitefeed'?job.site:({bing:'Bing News',google:'Google News',hackernews:'Hacker News'} as Record<string,string>)[job.provider]||job.provider;
 Promise.allSettled(jobs.map(async job=>{const q=job.topic?job.topic.keywords.split(',').map(k=>k.trim()).filter(Boolean).join(' OR '):'';const params=new URLSearchParams({q,provider:job.provider,...(job.feed?{feed:job.feed}:{}),...(job.site?{site:job.site}:{})});const r=await fetch(feedEndpoint()+'?'+params,{signal:controller.signal});const data=await r.json() as {error:string;articles:Article[]};if(!r.ok)throw Error(data.error);return data.articles.map(a=>({...a,topic:job.topic?job.topic.name:matchTopic(a,topics)}));})).then(results=>{
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
 const articles=tab==='Reading list'?saved:tab==='All stories'?feed:feed.filter(a=>a.topic===tab);
 const date=new Intl.DateTimeFormat('en-SG',{day:'numeric',month:'long',year:'numeric'}).format(new Date());
 return <div className={"paper "+(hideExcerpt?"headlines-only":"")} style={{"--reading-size":fontSize+"px","--card-min":(fontSize*18)+"px","--card-space":(fontSize*.85)+"px"} as CSSProperties}><Toaster richColors/><div className="utility"><span>YOUR PERSONAL <MasterAdmin/></span><span>{date}</span></div><header className="masthead"><a href="./" className="brand">mynews<span>.</span></a><p>A little less noise.<br/><em>A lot more perspective.</em></p><p className="masthead-note">You can edit and personalise your Topic keywords and search source sites. Usage on corporate machines will prevent you from saving your personalised settings (topics and source sites). Save and Restore works on personal machines.</p><div className="header-actions"><div className="backup-controls"><SettingsManager fontSize={fontSize} ready={libraryReady} onApply={setPendingBackup}/></div></div></header><Tabs value={tab} onValueChange={setTab}><div className="navrow"><div className="tabscroll"><TabsList variant="line" className="topic-tabs">{['All stories',...topics.map(t=>t.name),'Reading list'].map(name=><TabsTrigger key={name} value={name}>{name==='Reading list'&&<Bookmark size={15}/>} {name}{name==='Reading list'&&saved.length>0&&<small>{saved.length}</small>}</TabsTrigger>)}</TabsList></div><button className="manage" onClick={()=>{setDraft(topics.map(t=>({...t})));setDialog('topics');}} aria-label="Manage topics"><Settings2 size={17}/><span>My topics</span></button></div></Tabs><main data-fetching={loading?"true":"false"}><div className="reading-toolbar"><div className="edition-status"><strong>{tab==='All stories'?'Latest stories':tab}</strong><span>{loading?'Updating…':articles.length+' articles'}</span></div><div className="refresh-group"><button className="refresh-main" onClick={refreshNews} disabled={loading} aria-busy={loading}><RefreshCw size={17} className={loading?'spin':''}/>{loading?'Fetching…':'Refresh news'}</button><button className="refresh" onClick={toggleExcerpt} aria-pressed={hideExcerpt} title={hideExcerpt?'Show the excerpt on each card':'Show headlines only and shorten the cards'}>{hideExcerpt?<Eye size={15}/>:<EyeOff size={15}/>}{hideExcerpt?'Show excerpt':'Hide excerpt'}</button><span className="last-refreshed">{loading?'Fetching the latest stories…':fetchedAt?'Last refreshed '+new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(fetchedAt)):'Not refreshed yet'}</span></div><div className="source-picker"><span id="sources-label">Sources</span><SourcesPicker removedSources={removedSources} sites={sites} sources={sources} onChange={next=>{chooseSources(next);if(tab==='Reading list')setTab('All stories');}}/></div><div className="font-controls"><span id="font-label">Text size</span><button aria-label="Decrease text size and fit more columns" disabled={fontSize<=12} onClick={()=>adjustFont(fontSize-1)}>A−</button><Slider aria-labelledby="font-label" min={12} max={24} step={1} value={[fontSize]} onValueChange={value=>adjustFont(value[0])}/><button aria-label="Increase text size" disabled={fontSize>=24} onClick={()=>adjustFont(fontSize+1)}>A+</button><output aria-live="polite">{fontSize}px</output><button className="font-reset" onClick={()=>adjustFont(16)}>Reset</button><Popover><PopoverTrigger asChild><button className="info-button" aria-label="What does Reset change?"><Info size={14}/></button></PopoverTrigger><PopoverContent className="info-pop" align="end"><strong>Reset changes the text size only</strong><p>It puts the reading text back to 16px, the default. Card width and spacing follow the text size, so the grid returns to its usual number of columns.</p><p>Your topics, source sites, reading list, saved Settings ID and stored headlines are left exactly as they are.</p></PopoverContent></Popover></div></div><CollapsibleArea id="radar" label="On your radar"><div className="radar-strip" aria-label="On your radar"><span className="eyebrow">ON YOUR RADAR</span><div className="radar-topics">{topics.map(t=><button key={t.name} aria-pressed={tab===t.name} title={t.keywords} onClick={()=>setTab(t.name)}>{t.name}</button>)}</div><button className="radar-edit" onClick={()=>{setDraft(topics.map(t=>({...t})));setDialog('topics');}}><Settings2 size={15}/>Edit topics</button></div></CollapsibleArea><SitesBar removedSources={removedSources} onRemovedSourcesChange={changeRemovedSources} sites={sites} onChange={setSites} sources={sources} onSourcesChange={next=>{chooseSources(next);if(tab==='Reading list')setTab('All stories');}} keywords={(tab==='All stories'||tab==='Reading list'?topics:topics.filter(t=>t.name===tab)).map(t=>t.keywords.split(',').map(k=>k.trim()).join(' OR ')).join(' OR ')} open={sitesOpen} onOpenChange={setSitesOpen}/>{libraryError&&<div className="notice" role="alert">{libraryError} <button onClick={()=>location.reload()}>Retry</button></div>}{error&&<div className="notice" role="alert">{error}{needsService&&<><br/><button className="primary notice-fix" onClick={enableSearchServices}>Turn on {engines.map(e=>e.name).join(", ")}</button></>}</div>}<div className="content-layout"><section aria-label="Articles" aria-busy={loading}>{loading?<div className="loading"><Newspaper size={38}/><h2>Putting your edition together</h2><p>Checking the latest stories across your topics…</p></div>:articles.length===0?<div className="loading"><Bookmark size={32}/><h2>{tab==='Reading list'?'Make room for a good read':'No stories just yet'}</h2><p>{tab==='Reading list'?'Save a headline or paste an article URL to start your collection.':fetchedAt?'Nothing matched these keywords last time. Try a broader keyword in My topics, or refresh.':'Press Refresh news to fetch the latest stories.'}</p><button className="primary" onClick={()=>tab==='Reading list'?setDialog('article'):refreshNews()}>{tab==='Reading list'?'Add an article':'Refresh news'}</button></div>:<div className="article-grid">{articles.map(a=><article className="story" key={a.url}><a className="story-link" href={a.url} target="_blank" rel="noopener noreferrer"><div className="story-meta"><span className={'tag '+(a.topic?'color-'+topics.findIndex(t=>t.name===a.topic)%3:'tag-source')}>{a.topic||a.source}</span><ArrowUpRight size={18}/></div><h2>{a.title}</h2><p>{summaries[a.url]?.text||a.excerpt||'Open the original article to read the full story.'}</p><div className="source"><strong>{a.source}</strong>{a.provider&&<span className="provider-label">via {a.provider}</span>}<span>{Number.isNaN(Date.parse(a.date))?'':new Intl.DateTimeFormat('en-SG',{month:'short',day:'numeric'}).format(new Date(a.date))}</span></div></a><button className="save" aria-label={(saved.some(x=>x.url===a.url)?'Remove saved article: ':'Save article: ')+a.title} onClick={()=>saved.some(x=>x.url===a.url)?remove(a):save(a)}><Bookmark size={16} fill={saved.some(x=>x.url===a.url)?'currentColor':'none'}/></button>{tab!=='Reading list'&&!hideExcerpt&&!summaries[a.url]?.text&&<button className="read-more" disabled={summaries[a.url]?.loading} onClick={()=>readMore(a)} title={summaries[a.url]?.error||'Read up to 250 words from the publisher'}><BookOpen size={14}/>{summaries[a.url]?.loading?'Reading…':summaries[a.url]?.error?'Unavailable':'Read more'}</button>}</article>)}</div>}</section></div></main><footer><span className="footer-brand">mynews.</span><span>Bing News · Google News · Hacker News. Excerpts where available; some links redirect to the publisher.</span><span>YOUR WORLD, WELL READ.</span></footer><Dialog open={pendingBackup!==null} onOpenChange={open=>{if(!open)setPendingBackup(null);}}><DialogContent className="editor"><DialogTitle>Apply these settings?</DialogTitle><DialogDescription>This replaces the sites, topics, and saved articles in this browser. Save your current settings first if you want to keep them.</DialogDescription><p>{pendingBackup?.sites.length} sites · {pendingBackup?.topics.length} topics · {pendingBackup?.articles.length} saved articles · {pendingBackup?.fontSize}px text</p><div className="form-actions"><button className="secondary" onClick={()=>setPendingBackup(null)}>Cancel</button><button className="primary" onClick={confirmRestore}>Apply settings</button></div></DialogContent></Dialog><Dialog open={dialog!==null} onOpenChange={open=>{if(!open&&!busy)setDialog(null);}}><DialogContent className="editor"><DialogTitle>{dialog==='article'?'Add to your reading list':'Make this edition yours'}</DialogTitle><DialogDescription>{dialog==='article'?'Paste a link, then add a headline and short excerpt for easy reading.':'Name a topic and add comma-separated keywords. A story can match any keyword in the list.'}</DialogDescription>{!libraryReady?<p>Browser storage is unavailable. Enable site storage and reload to save articles and topics.</p>:dialog==='article'?<form onSubmit={addArticle}><label>Article URL<input name="url" type="url" placeholder="https://…" maxLength={4096} required/></label><label>Headline<input name="title" placeholder="A headline worth keeping" maxLength={500}/></label><label>Short excerpt<textarea name="excerpt" placeholder="What is this story about?" maxLength={1000}/></label><label>Topic</label><Select value={articleTopic} onValueChange={setArticleTopic}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['General',...topics.map(t=>t.name).filter(n=>n!=='General')].map(n=><SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent></Select><button className="primary" disabled={busy}>{busy?'Saving…':'Save article'}</button></form>:<form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await mutate({action:'topics',topics:draft});setTopics(draft);setTab('All stories');setDialog(null);toast.success('Your topics are updated');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}><div className="topic-editor">{draft.map((t,i)=><div className="topic-edit" key={i}><div><label>Topic name<input required maxLength={40} value={t.name} onChange={e=>setDraft(old=>old.map((x,j)=>j===i?{...x,name:e.target.value}:x))}/></label><label>Keywords<input required maxLength={300} value={t.keywords} onChange={e=>setDraft(old=>old.map((x,j)=>j===i?{...x,keywords:e.target.value}:x))}/></label></div><button type="button" aria-label={'Remove topic '+t.name} disabled={draft.length===1} onClick={()=>setDraft(old=>old.filter((_,j)=>j!==i))}><Trash2 size={17}/></button></div>)}</div><div className="form-actions"><button type="button" className="secondary" disabled={draft.length>=20} onClick={()=>setDraft(old=>[...old,{name:'',keywords:''}])}><Plus size={16}/>New topic</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save topics'}</button></div></form>}</DialogContent></Dialog></div>;
}


