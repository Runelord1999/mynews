'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {adminEndpoint} from '@/lib/browser-library';
import {normaliseId,validId} from '@/lib/settings-id';
import {RefreshCw,Trash2} from 'lucide-react';

type Entry={id:string;createdAt:string;updatedAt:string;saveCount:number;topics:number;articles:number;sites:number;fontSize:number|null;lastIp:string;lastCountry:string;lastCity:string;lastUserAgent:string;lastDevice:string};
type Event={action:string;at:string;ip:string|null;country:string|null;city:string|null;user_agent:string|null;device:string|null};

const when=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short'}).format(date);};

function describeDevice(raw:string){
 if(!raw)return '';
 try{
  const d=JSON.parse(raw) as {platform?:string;mobile?:boolean;screen?:string;viewport?:string;timezone?:string;language?:string;memoryGb?:number|null;cores?:number|null};
  return [d.platform,d.mobile?'mobile':'desktop',d.screen&&'screen '+d.screen,d.cores&&d.cores+' cores',d.memoryGb&&d.memoryGb+' GB',d.timezone,d.language].filter(Boolean).join(' · ');
 }catch{return raw;}
}

export default function MasterAdmin(){
 const [open,setOpen]=useState(false),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tone,setTone]=useState<'ok'|'error'|''>('');
 const [entries,setEntries]=useState<Entry[]|null>(null),[history,setHistory]=useState<Record<string,Event[]>>({}),[expanded,setExpanded]=useState('');

 function note(text:string,kind:'ok'|'error'){setMessage(text);setTone(kind);}

 async function call(body:Record<string,unknown>){
  const response=await fetch(adminEndpoint(),{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Key':key},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json() as Record<string,unknown> & {error?:string};
  if(!response.ok)throw Error(data.error||'Master Admin request failed.');
  return data;
 }

 async function load(quiet=false){
  setBusy(true);if(!quiet){setMessage('');setTone('');}
  try{
   const data=await call({action:'list'}) as unknown as {entries:Entry[];history:Record<string,Event[]>};
   setEntries(data.entries);setHistory(data.history||{});
   if(!quiet)note(data.entries.length+' saved '+(data.entries.length===1?'ID':'IDs')+' loaded.','ok');
  }catch(error){setEntries(null);note(error instanceof Error?error.message:'Master Admin request failed.','error');}finally{setBusy(false);}
 }

 async function rename(entry:Entry){
  const input=prompt('New Settings ID for "'+entry.id+'"',entry.id);
  if(input===null)return;
  const newId=normaliseId(input);
  if(!validId(newId)){note('New IDs are 3 to 40 characters using letters, numbers, hyphens and underscores.','error');return;}
  if(newId===entry.id)return;
  setBusy(true);
  try{await call({action:'rename',id:entry.id,newId});note('Renamed '+entry.id+' to '+newId+'.','ok');await load(true);}
  catch(error){note(error instanceof Error?error.message:'Could not rename that ID.','error');}finally{setBusy(false);}
 }

 async function remove(entry:Entry){
  if(!confirm('Delete "'+entry.id+'" permanently? Anyone using this ID will no longer be able to apply these settings.'))return;
  setBusy(true);
  try{await call({action:'delete',id:entry.id});note('Deleted '+entry.id+'.','ok');await load(true);}
  catch(error){note(error instanceof Error?error.message:'Could not delete that ID.','error');}finally{setBusy(false);}
 }

 return <><button className="backup-button" onClick={()=>setOpen(true)}>Master Admin</button>
 <Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="editor admin-panel">
  <DialogTitle>Master Admin</DialogTitle>
  <DialogDescription>Every Settings ID saved on the server, with when it was created and where it was last used. The admin key is checked by the Worker and is never stored in this page.</DialogDescription>
  <label>Admin key<input type="password" value={key} onChange={e=>{setKey(e.target.value);setMessage('');setTone('');}} autoComplete="off" spellCheck={false} placeholder="Set with: wrangler secret put ADMIN_KEY" disabled={busy}/></label>
  <div className="form-actions"><button className="primary" disabled={busy||!key} onClick={()=>load()}><RefreshCw size={15} className={busy?'spin':''}/>{busy?'Working…':entries?'Refresh list':'Load saved IDs'}</button></div>
  {message&&<p role="status" className={tone==='error'?'settings-error':'settings-ok'}>{message}</p>}
  {entries&&(entries.length===0?<p className="sites-help">No settings have been saved yet.</p>:
   <div className="admin-list">{entries.map(entry=><div className="admin-row" key={entry.id}>
    <div className="admin-row-head">
     <div><strong>{entry.id}</strong><small>{entry.topics} topics · {entry.sites} sites · {entry.articles} saved · {entry.fontSize?entry.fontSize+'px':'default'}</small></div>
     <div className="admin-row-actions">
      <button className="backup-button" disabled={busy} onClick={()=>rename(entry)}>Rename</button>
      <button className="backup-button" disabled={busy} onClick={()=>remove(entry)} aria-label={'Delete '+entry.id}><Trash2 size={14}/></button>
     </div>
    </div>
    <dl className="admin-facts">
     <div><dt>Created</dt><dd>{when(entry.createdAt)}</dd></div>
     <div><dt>Last saved</dt><dd>{when(entry.updatedAt)} · {entry.saveCount} {entry.saveCount===1?'save':'saves'}</dd></div>
     <div><dt>Last IP</dt><dd>{entry.lastIp||'—'}{entry.lastCountry?' · '+[entry.lastCity,entry.lastCountry].filter(Boolean).join(', '):''}</dd></div>
     <div><dt>Device</dt><dd>{describeDevice(entry.lastDevice)||'—'}</dd></div>
     <div className="admin-wide"><dt>Browser</dt><dd>{entry.lastUserAgent||'—'}</dd></div>
    </dl>
    <button className="text-button" onClick={()=>setExpanded(expanded===entry.id?'':entry.id)} aria-expanded={expanded===entry.id}>Recent activity<span>{history[entry.id]?.length??0}</span></button>
    {expanded===entry.id&&<div className="admin-events">{(history[entry.id]||[]).map((event,index)=><div key={index}><span>{event.action}</span><span>{when(event.at)}</span><span>{event.ip||'—'}{event.country?' · '+event.country:''}</span><span>{describeDevice(event.device||'')||event.user_agent||'—'}</span></div>)}{!history[entry.id]?.length&&<p className="sites-help">No activity recorded yet.</p>}</div>}
   </div>)}</div>)}
  <p className="sites-help">IP addresses and browser details are personal data. Tell people you are collecting it, and delete IDs you no longer need.</p>
 </DialogContent></Dialog></>;
}
