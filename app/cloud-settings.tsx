'use client';
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {exportBackup,parseBackup,settingsEndpoint,type SettingsBackup} from '@/lib/browser-library';

export default function CloudSettings({fontSize,ready,onRestore}:{fontSize:number;ready:boolean;onRestore:(backup:SettingsBackup)=>void}){
 const [open,setOpen]=useState(false),[id,setId]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{try{setId(localStorage.getItem('mynews-recovery-id')||'');}catch{}},[]);
 function create(){const next=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');setId(next);setMessage('New ID created. Save online, then keep a copy of this ID somewhere safe.');}
 async function run(action:'save'|'load'){
  setBusy(true);setMessage('');
  try{
   const token=id.trim().toLowerCase();
   if(!/^[a-f0-9]{64}$/.test(token))throw Error('Create an ID or paste your saved private user ID.');
   const response=await fetch(settingsEndpoint(),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,...(action==='save'?{backup:JSON.parse(exportBackup(fontSize))}:{})}),signal:AbortSignal.timeout(20000)});
   const data=await response.json() as {error?:string;backup?:unknown};if(!response.ok)throw Error(data.error||'Could not access online settings.');
   try{localStorage.setItem('mynews-recovery-id',token);}catch{}
   if(action==='load'){const backup=parseBackup(JSON.stringify(data.backup));setOpen(false);onRestore(backup);}
   else setMessage('Settings saved online. Keep this ID to restore them on another browser or device. Save again whenever you want to update this backup.');
  }catch(error){setMessage(error instanceof Error?error.message:'Could not access online settings. Please try again.');}finally{setBusy(false);}
 }
 return <><button className="backup-button" onClick={()=>setOpen(true)}>Online settings</button><Dialog open={open} onOpenChange={value=>{if(!busy)setOpen(value);}}><DialogContent className="editor"><DialogTitle>Save and restore online</DialogTitle><DialogDescription>Keep your topics, source sites, reading list, and text size on the server. No sign-in required.</DialogDescription><label>Private user ID<input value={id} onChange={e=>{setId(e.target.value);setMessage('');}} autoComplete="off" spellCheck={false} maxLength={64} placeholder="Create an ID or paste your saved ID" disabled={busy}/></label><p className="sites-help">Anyone with this ID can retrieve or replace your backup. Keep it private and save a copy outside this browser. A lost ID cannot be recovered.</p><div className="form-actions"><button className="secondary" disabled={busy} onClick={create}>Create new ID</button><button className="secondary" disabled={busy||!id} onClick={async()=>{try{await navigator.clipboard.writeText(id);setMessage('ID copied. Keep it somewhere safe.');}catch{setMessage('Select and copy the ID from the field above.');}}}>Copy ID</button></div><div className="form-actions"><button className="primary" disabled={busy||!ready||!id} onClick={()=>run('save')}>{busy?'Working…':'Save online'}</button><button className="secondary" disabled={busy||!id} onClick={()=>run('load')}>Retrieve settings</button></div>{message&&<p role="status">{message}</p>}</DialogContent></Dialog></>;
}
