'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {adminEndpoint} from '@/lib/browser-library';
import {normaliseId,normaliseOwner,validId,validOwner} from '@/lib/settings-id';
import {RefreshCw,Trash2} from 'lucide-react';

type Entry={id:string;owner:string;createdAt:string;updatedAt:string;saveCount:number;topics:number;articles:number;sites:number;fontSize:number|null};

const when=(value:string)=>{const date=new Date(value);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short'}).format(date);};

export default function MasterAdmin(){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tone,setTone]=useState<'ok'|'error'|''>(''),[entries,setEntries]=useState<Entry[]|null>(null),[key,setKey]=useState(''),[keyRequired,setKeyRequired]=useState(false);
 function note(text:string,kind:'ok'|'error'){setMessage(text);setTone(kind);}

 async function call(body:Record<string,unknown>){
  const response=await fetch(adminEndpoint(),{method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-Admin-Key':key}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await response.json() as Record<string,unknown> & {error?:string;keyRequired?:boolean};
  if(!response.ok){if(data.keyRequired)setKeyRequired(true);throw Error(data.error||'Master Admin request failed.');}
  return data;
 }

 async function load(quiet=false){
  setBusy(true);if(!quiet){setMessage('');setTone('');}
  try{
   const data=await call({action:'list'}) as unknown as {entries:Entry[]};
   setEntries(data.entries);
   if(!quiet)note(data.entries.length+' saved '+(data.entries.length===1?'ID':'IDs')+'.','ok');
  }catch(error){setEntries(null);note(error instanceof Error?error.message:'Master Admin request failed.','error');}finally{setBusy(false);}
 }

 // Opening is an event, not an effect, so the first list loads from the click.
 function openPanel(){setOpen(true);setMessage('');setTone('');void load(true);}

 async function edit(entry:Entry,field:'id'|'owner'){
  const current=field==='id'?entry.id:entry.owner;
  const input=prompt(field==='id'?'New Settings ID for "'+entry.id+'"':'Owner name for "'+entry.id+'"',current);
  if(input===null)return;
  const value=field==='id'?normaliseId(input):normaliseOwner(input);
  if(value===current)return;
  if(field==='id'&&!validId(value)){note('New IDs are 3 to 40 characters using letters, numbers, hyphens and underscores.','error');return;}
  if(field==='owner'&&!validOwner(value)){note('Owner names are 2 to 60 characters.','error');return;}
  setBusy(true);
  try{await call({action:'rename',id:entry.id,...(field==='id'?{newId:value}:{newOwner:value})});note(field==='id'?'Renamed '+entry.id+' to '+value+'.':'Owner of '+entry.id+' set to '+value+'.','ok');await load(true);}
  catch(error){note(error instanceof Error?error.message:'Could not save that change.','error');}finally{setBusy(false);}
 }

 async function remove(entry:Entry){
  if(!confirm('Delete "'+entry.id+'" permanently? Anyone using this ID will no longer be able to apply these settings.'))return;
  setBusy(true);
  try{await call({action:'delete',id:entry.id});note('Deleted '+entry.id+'.','ok');await load(true);}
  catch(error){note(error instanceof Error?error.message:'Could not delete that ID.','error');}finally{setBusy(false);}
 }

 return <><button className="admin-key" onClick={openPanel}>EDITION</button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="editor admin-panel">
  <DialogTitle>Master Admin</DialogTitle>
  <DialogDescription>Every Settings ID saved on the server, who created it, and when. Rename an ID, correct an owner name, or delete an entry.</DialogDescription>
  {keyRequired&&<label>Admin key<input type="password" value={key} onChange={e=>{setKey(e.target.value);setMessage('');setTone('');}} autoComplete="off" spellCheck={false} placeholder="This Worker has an ADMIN_KEY set" disabled={busy}/></label>}
  <div className="form-actions"><button className="primary" disabled={busy} onClick={()=>load()}><RefreshCw size={15} className={busy?'spin':''}/>{busy?'Working…':'Refresh list'}</button></div>
  {message&&<p role="status" className={tone==='error'?'settings-error':'settings-ok'}>{message}</p>}
  {entries&&(entries.length===0?<p className="sites-help">No settings have been saved yet.</p>:
   <div className="admin-list">{entries.map(entry=><div className="admin-row" key={entry.id}>
    <div className="admin-row-head">
     <div><strong>{entry.id}</strong><small>{entry.topics} topics · {entry.sites} sites · {entry.articles} saved · {entry.fontSize?entry.fontSize+'px':'default'}</small></div>
     <div className="admin-row-actions">
      <button className="backup-button" disabled={busy} onClick={()=>edit(entry,'id')}>Rename</button>
      <button className="backup-button" disabled={busy} onClick={()=>remove(entry)} aria-label={'Delete '+entry.id}><Trash2 size={14}/></button>
     </div>
    </div>
    <dl className="admin-facts">
     <div><dt>Owner</dt><dd>{entry.owner||'—'} <button className="link-button" disabled={busy} onClick={()=>edit(entry,'owner')}>Edit</button></dd></div>
     <div><dt>Created</dt><dd>{when(entry.createdAt)}</dd></div>
     <div><dt>Last saved</dt><dd>{when(entry.updatedAt)}</dd></div>
     <div><dt>Saves</dt><dd>{entry.saveCount}</dd></div>
    </dl>
   </div>)}</div>)}
 </DialogContent></Dialog></>;
}
