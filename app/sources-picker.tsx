'use client';
import {useState} from 'react';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {Check,ChevronDown,ChevronUp} from 'lucide-react';
import {allSources,services,type NewsSite} from '@/lib/news';

export default function SourcesPicker({sites,sources,onChange,removedSources}:{removedSources:string[];sites:NewsSite[];sources:string[];onChange:(next:string[])=>void}){
 // Folded with the same preference as the services list in All sites: one
 // answer to "do I want to see the built-in sources right now".
 const [servicesOpen,setServicesOpen]=useState(()=>{try{return localStorage.getItem('mynews-collapsed-services')!=='true';}catch{return true;}});
 function toggleServices(){setServicesOpen(open=>{const next=!open;try{localStorage.setItem('mynews-collapsed-services',String(!next));}catch{}return next;});}
 const list=allSources(sites,removedSources);
 const chosen=new Set(sources);
 const active=list.filter(s=>chosen.has(s.id));
 const label=active.length===0?'No sources':active.length===list.length?'All sources ('+list.length+')':active.length===1?active[0].name:active.length+' of '+list.length+' sources';
 function toggle(id:string){onChange(chosen.has(id)?sources.filter(s=>s!==id):[...sources,id]);}
 const shownServices=services.filter(s=>!removedSources.includes(s.id));
 const serviceIds=new Set(services.map(x=>x.id));
 const ownSites=list.filter(s=>!serviceIds.has(s.id));
 const row=(s:{id:string;name:string;hint:string})=><button key={s.id} role="menuitemcheckbox" aria-checked={chosen.has(s.id)} className={'source-option '+(chosen.has(s.id)?'is-on':'')} onClick={()=>toggle(s.id)}>
  <span className="source-tick">{chosen.has(s.id)&&<Check size={13}/>}</span>
  <span className="source-name">{s.name}<small>{s.hint}</small></span>
 </button>;
 return <Popover><PopoverTrigger asChild>
  <button className="sources-trigger" aria-label={'Sources: '+label}>{label}<ChevronDown size={14}/></button>
 </PopoverTrigger><PopoverContent className="source-menu" align="start">
  <div className="source-menu-head"><strong>Sources</strong><div><button className="link-button" onClick={()=>onChange(list.map(s=>s.id))}>Select all</button><button className="link-button" onClick={()=>onChange([])}>Clear</button></div></div>
  <div className="source-group"><button className="section-toggle eyebrow" aria-expanded={servicesOpen} aria-controls="source-services" onClick={toggleServices} aria-label={(servicesOpen?"Minimize":"Expand")+" news services"}>{servicesOpen?<ChevronUp size={13}/>:<ChevronDown size={13}/>}NEWS SERVICES<small>{shownServices.filter(s=>chosen.has(s.id)).length} of {shownServices.length}</small></button><div id="source-services" hidden={!servicesOpen}>{shownServices.map(row)}</div></div>
  <div className="source-group"><span className="eyebrow">YOUR SITES</span>{ownSites.length?ownSites.map(row):<p className="sites-help">Nothing here yet. Websites you add under Your Search Source Sites appear in this group.</p>}</div>
  <p className="sites-help">Sources with a full-text feed are read directly. The rest are searched through the selected news indexes, restricted to those websites, in one query.</p>
 </PopoverContent></Popover>;
}
