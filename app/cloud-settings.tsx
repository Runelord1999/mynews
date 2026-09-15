'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {exportBackup,parseBackup,settingsEndpoint,type SettingsBackup} from '@/lib/browser-library';
import {normaliseId,normaliseOwner,suggestId,validId,validOwner} from '@/lib/settings-id';

export default function CloudSettings({fontSize,ready,onApply}:{fontSize:number;ready:boolean;onApply:(backup:SettingsBackup)=>void}){
 const [open,setOpen]=useState(false),[id,setId]=useState(''),[owner,setOwner]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tone,setTone]=useState<'ok'|'error'|''>('');
 useEffect(()=>{try{setId(localStorage.getItem('mynews-settings-id')||'');setOwner(localStorage.getItem('mynews-settings-owner')||'');}catch{}},[]);
 function note(text:string,kind:'ok'|'error'){setMessage(text);setTone(kind);}
 function clearNote(){setMessage('');setTone('');}
 function create(){const next=suggestId();setId(next);note('Created the ID '+next+'. Add an owner name, then press Save online.','ok');}
 async function run(action:'save'|'apply'){
  setBusy(true);clearNote();
  try{
   const token=normaliseId(id);
   if(!validId(token))throw Error('Settings IDs are 3 to 40 characters using letters, numbers, hyphens and underscores.');
   if(action==='save'&&!validOwner(owner))throw Error('Add an owner name of 2 to 60 characters so you can tell later who created this ID.');
   const response=await fetch(settingsEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:token,...(action==='save'?{owner:normaliseOwner(owner),backup:JSON.parse(exportBackup(fontSize))}:{})}),signal:AbortSignal.timeout(20000)});
   const data=await response.json() as {error?:string;backup?:unknown;owner?:string;saveCount?:number};
   if(!response.ok)throw Error(data.error||'Could not reach online settings.');
   setId(token);try{localStorage.setItem('mynews-settings-id',token);}catch{}
   if(action==='apply'){
    if(data.owner){setOwner(data.owner);try{localStorage.setItem('mynews-settings-owner',data.owner);}catch{}}
    const backup=parseBackup(JSON.stringify(data.backup));setOpen(false);onApply(backup);
   }else{
    if(data.owner){setOwner(data.owner);try{localStorage.setItem('mynews-settings-owner',data.owner);}catch{}}
    note('Saved online under '+token+(data.saveCount&&data.saveCount>1?' (version '+data.saveCount+')':'')+', owned by '+(data.owner||normaliseOwner(owner))+'. Share this ID with anyone you want to give these settings to.','ok');
   }
  }catch(error){note(error instanceof Error?error.message:'Could not reach online settings. Please try again.','error');}finally{setBusy(false);}
 }
 return <><button className="backup-button" onClick={()=>setOpen(true)}>Online settings</button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="editor"><DialogTitle>Save and share settings</DialogTitle><DialogDescription>Store your topics, source sites, reading list and text size under a Settings ID. Anyone with the ID can apply the same setup — like sharing a playlist.</DialogDescription>
 <div className="settings-id-row">
  <label>Settings ID<input value={id} onChange={e=>{setId(e.target.value);clearNote();}} autoComplete="off" spellCheck={false} maxLength={40} placeholder="Create an ID or type one to apply" disabled={busy}/></label>
  <label>Settings ID Owner Name<input value={owner} onChange={e=>{setOwner(e.target.value);clearNote();}} autoComplete="off" maxLength={60} placeholder="Who is creating this ID" disabled={busy}/></label>
 </div>
 <p className="sites-help">IDs are not secret and are meant to be shared. Anyone with an ID can also overwrite the settings stored under it. The owner name is recorded when the ID is first saved, so you can tell later who created it.</p>
 <div className="form-actions"><button className="secondary" disabled={busy} onClick={create}>Create new ID</button><button className="secondary" disabled={busy||!id} onClick={async()=>{try{await navigator.clipboard.writeText(normaliseId(id));note('ID copied to the clipboard.','ok');}catch{note('Select and copy the ID from the field above.','error');}}}>Copy ID</button></div>
 <div className="form-actions"><button className="primary" disabled={busy||!ready||!id||!owner} onClick={()=>run('save')}>{busy?'Working…':'Save online'}</button><button className="secondary" disabled={busy||!id} onClick={()=>run('apply')}>Apply settings</button></div>
 {message&&<p role="status" className={tone==='error'?'settings-error':'settings-ok'}>{message}</p>}</DialogContent></Dialog></>;
}
