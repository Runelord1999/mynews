'use client';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {Check,ChevronDown} from 'lucide-react';
import {allSources,engines,type NewsSite} from '@/lib/news';

export default function SourcesPicker({sites,sources,onChange}:{sites:NewsSite[];sources:string[];onChange:(next:string[])=>void}){
 const list=allSources(sites);
 const chosen=new Set(sources);
 const active=list.filter(s=>chosen.has(s.id));
 const label=active.length===0?'No sources':active.length===list.length?'All sources':active.length===1?active[0].name:active.length+' sources';
 function toggle(id:string){onChange(chosen.has(id)?sources.filter(s=>s!==id):[...sources,id]);}
 const siteSources=list.filter(s=>s.kind!=='engine');
 const row=(s:{id:string;name:string;hint:string})=><button key={s.id} role="menuitemcheckbox" aria-checked={chosen.has(s.id)} className={'source-option '+(chosen.has(s.id)?'is-on':'')} onClick={()=>toggle(s.id)}>
  <span className="source-tick">{chosen.has(s.id)&&<Check size={13}/>}</span>
  <span className="source-name">{s.name}<small>{s.hint}</small></span>
 </button>;
 return <Popover><PopoverTrigger asChild>
  <button className="sources-trigger" aria-label={'Sources: '+label}>{label}<ChevronDown size={14}/></button>
 </PopoverTrigger><PopoverContent className="source-menu" align="start">
  <div className="source-menu-head"><strong>Sources</strong><div><button className="link-button" onClick={()=>onChange(list.map(s=>s.id))}>Select all</button><button className="link-button" onClick={()=>onChange([])}>Clear</button></div></div>
  <div className="source-group"><span className="eyebrow">NEWS SERVICES</span>{engines.map(row)}</div>
  <div className="source-group"><span className="eyebrow">YOUR SITES</span>{siteSources.length?siteSources.map(row):<p className="sites-help">No saved sites yet. Add one under Your Search Source Sites.</p>}</div>
  <p className="sites-help">Sites with a full-text feed are read directly. Sites without one are searched through the selected news services, restricted to that website.</p>
 </PopoverContent></Popover>;
}
