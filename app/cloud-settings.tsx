'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {exportBackup,parseBackup,settingsEndpoint,type SettingsBackup} from '@/lib/browser-library';
import {normaliseId,suggestId,validId} from '@/lib/settings-id';
import {deviceInfo} from '@/lib/device-info';

export default function CloudSettings({fontSize,ready,onApply}:{fontSize:number;ready:boolean;onApply:(backup:SettingsBackup)=>void}){
 const [open,setOpen]=useState(false),[id,setId]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tone,setTone]=useState<'ok'|'error'|''>('');
 useEffect(()=>{try{setId(localStorage.getItem('mynews-settings-id')||'');}catch{}},[]);
 function note(text:string,kind:'ok'|'error'){setMessage(text);setTone(kind);}
 function create(){const next=suggestId();setId(next);note('Created the ID '+next+'. Press Save online to store your settings under it.','ok');}
 async function run(action:'save'|'apply'){
  setBusy(true);setMessage('');setTone('');
  try{
   const token=normaliseId(id);
   if(!validId(token))throw Error('Settings IDs are 3 to 40 characters using letters, numbers, hyphens and underscores.');
   const response=await fetch(settingsEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:token,device:deviceInfo(),...(action==='save'?{backup:JSON.parse(exportBackup(fontSize))}:{})}),signal:AbortSignal.timeout(20000)});
   const data=await response.json() as {error?:string;backup?:unknown;updatedAt?:string;saveCount?:number};
   if(!response.ok)throw Error(data.error||'Could not reach online settings.');
   setId(token);try{localStorage.setItem('mynews-settings-id',token);}catch{}
   if(action==='apply'){const backup=parseBackup(JSON.stringify(data.backup));setOpen(false);onApply(backup);}
   else note('Saved online under '+token+(data.saveCount&&data.saveCount>1?' (version '+data.saveCount+')':'')+'. Share this ID with anyone you want to give these settings to.','ok');
  }catch(error){note(error instanceof Error?error.message:'Could not reach online settings. Please try again.','error');}finally{setBusy(false);}
 }
 return <><button className="backup-button" onClick={()=>setOpen(true)}>Online settings</button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="editor"><DialogTitle>Save and share settings</DialogTitle><DialogDescription>Store your topics, source sites, reading list and text size under a Settings ID. Anyone with the ID can apply the same setup — like sharing a playlist.</DialogDescription><label>Settings ID<input value={id} onChange={e=>{setId(e.target.value);setMessage('');setTone('');}} autoComplete="off" spellCheck={false} maxLength={40} placeholder="Create an ID or type one to apply" disabled={busy}/></label><p className="sites-help">IDs are not secret and are meant to be shared. Anyone with an ID can also overwrite the settings stored under it, so pick a distinctive one for anything you want to keep.</p><div className="form-actions"><button className="secondary" disabled={busy} onClick={create}>Create new ID</button><button className="secondary" disabled={busy||!id} onClick={async()=>{try{await navigator.clipboard.writeText(normaliseId(id));note('ID copied to the clipboard.','ok');}catch{note('Select and copy the ID from the field above.','error');}}}>Copy ID</button></div><div className="form-actions"><button className="primary" disabled={busy||!ready||!id} onClick={()=>run('save')}>{busy?'Working…':'Save online'}</button><button className="secondary" disabled={busy||!id} onClick={()=>run('apply')}>Apply settings</button></div>{message&&<p role="status" className={tone==='error'?'settings-error':'settings-ok'}>{message}</p>}</DialogContent></Dialog></>;
}
