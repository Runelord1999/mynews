'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {ChevronDown,ChevronUp} from 'lucide-react';
export default function CollapsibleArea({id,label,children}:{id:string;label:string;children:ReactNode}){
 const [collapsed,setCollapsed]=useState(false);
 useEffect(()=>{try{setCollapsed(localStorage.getItem('mynews-collapsed-'+id)==='true');}catch{}},[id]);
 function toggle(){setCollapsed(old=>{const next=!old;try{localStorage.setItem('mynews-collapsed-'+id,String(next));}catch{}return next;});}
 return <section className={'collapsible-area '+(collapsed?'is-collapsed':'')} aria-label={label}>
  {collapsed&&<span className="collapsed-label">{label}</span>}
  <button className="area-toggle" aria-label={(collapsed?'Expand ':'Minimize ')+label} title={(collapsed?'Expand ':'Minimize ')+label} aria-expanded={!collapsed} aria-controls={'area-'+id} onClick={toggle}>{collapsed?<ChevronDown size={16}/>:<ChevronUp size={16}/>}</button>
  <div id={'area-'+id} hidden={collapsed}>{children}</div>
 </section>;
}
