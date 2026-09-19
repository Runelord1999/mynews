'use client';
import {useEffect,useRef,useState} from 'react';
import {DialogDescription} from '@/components/ui/dialog';
import {exportBackup,parseBackup,settingsEndpoint,apiOrigin,type SettingsBackup} from '@/lib/browser-library';
import {normaliseId,normaliseOwner,suggestId,validId,validOwner} from '@/lib/settings-id';

// One place to save and restore, with the same two destinations offered for
// each: the server, under a shared Settings ID, or a file on this device.
export default function SettingsManager({fontSize,ready,onApply,onDone}:{fontSize:number;ready:boolean;onApply:(backup:SettingsBackup)=>void;onDone:()=>void}){
 const [id,setId]=useState(''),[owner,setOwner]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[tone,setTone]=useState<'ok'|'error'|''>('');
 // Set when a save is refused because the ID already holds someone's settings.
 const [conflict,setConflict]=useState<{id:string;owner:string;updatedAt:string}|null>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{try{setId(localStorage.getItem('mynews-settings-id')||'');setOwner(localStorage.getItem('mynews-settings-owner')||'');}catch{}},[]);
 function note(text:string,kind:'ok'|'error'){setMessage(text);setTone(kind);}
 function clearNote(){setMessage('');setTone('');setConflict(null);}
 function remember(token:string,who:string){try{localStorage.setItem('mynews-settings-id',token);if(who)localStorage.setItem('mynews-settings-owner',who);}catch{}}
 function create(){const next=suggestId();setId(next);note('Created the ID '+next+'. Add an owner name, then choose Save online.','ok');}

 async function online(action:'save'|'apply',overwrite=false){
  setBusy(true);clearNote();
  try{
   const token=normaliseId(id);
   if(!validId(token))throw Error('Settings IDs are 3 to 40 characters using letters, numbers, hyphens and underscores.');
   if(action==='save'&&!validOwner(owner))throw Error('Add an owner name of 2 to 60 characters so you can tell later who created this ID.');
   const response=await fetch(settingsEndpoint(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:token,...(action==='save'?{owner:normaliseOwner(owner),overwrite,backup:JSON.parse(exportBackup(fontSize))}:{})}),signal:AbortSignal.timeout(20000)});
   const data=await response.json() as {error?:string;backup?:unknown;owner?:string;saveCount?:number;conflict?:boolean;existing?:{id:string;owner:string;updatedAt:string}};
   if(response.status===409&&data.conflict&&data.existing){setConflict(data.existing);setBusy(false);return;}
   if(!response.ok)throw Error((data.error||'Could not reach online settings.')+' ('+response.status+' from '+apiOrigin()+')');
   setId(token);remember(token,data.owner||'');
   if(data.owner)setOwner(data.owner);
   if(action==='apply'){const backup=parseBackup(JSON.stringify(data.backup));onDone();onApply(backup);}
   else note('Saved online under '+token+(data.saveCount&&data.saveCount>1?' (version '+data.saveCount+')':'')+', owned by '+(data.owner||normaliseOwner(owner))+'. Share this ID with anyone you want to give these settings to.','ok');
  }catch(error){note((error instanceof Error?error.message:'Could not reach online settings.')+(error instanceof Error&&!error.message.includes(apiOrigin())?' (no reply from '+apiOrigin()+')':''),'error');}finally{setBusy(false);}
 }

 // Chrome and Edge can offer a real Save As dialog, so the reader picks the
 // name and the folder. Everywhere else the browser takes the file into its
 // downloads folder, which is the only thing the web offered before.
 async function saveToFile(){
  let text,suggested;
  try{
   text=exportBackup(fontSize);
   const fileId=normaliseId(id).replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);
   suggested='mynews-settings-'+(fileId?fileId+'-':'')+new Date().toISOString().slice(0,10)+'.json';
  }catch{note('Could not build a settings file. Check browser storage and try again.','error');return;}

  const picker=(window as Window&{showSaveFilePicker?:(options:{suggestedName?:string;types?:{description?:string;accept:Record<string,string[]>}[]})=>Promise<{createWritable:()=>Promise<{write:(data:string)=>Promise<void>;close:()=>Promise<void>}>;name?:string}>}).showSaveFilePicker;
  if(picker){
   try{
    const handle=await picker({suggestedName:suggested,types:[{description:'Mynews settings',accept:{'application/json':['.json']}}]});
    const writable=await handle.createWritable();
    await writable.write(text);await writable.close();
    note('Saved '+(handle.name||suggested)+' where you chose. This works without any network.','ok');
   }catch(error){
    // Closing the dialog is a decision, not a failure.
    if(error instanceof DOMException&&error.name==='AbortError')return;
    note('That file could not be written. Try a different folder, or a different name.','error');
   }
   return;
  }

  try{
   const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download=suggested;
   document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
   note('Downloaded '+suggested+' to this browser\u2019s downloads folder. Keep it somewhere safe — this works without any network.','ok');
  }catch{note('Could not save that file. Check browser storage and try again.','error');}
 }

 async function fileChosen(event:React.ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  try{
   if(file.size>5*1024*1024)throw Error('too large');
   const backup=parseBackup(await file.text());
   onDone();onApply(backup);
  }catch{note('Choose a valid Mynews settings file (up to 5 MB). Your current settings have not changed.','error');}
 }

 return <div className="settings-panel">
  <DialogDescription>Keep your topics, source sites, reading list and text size. Save online to reach them from another browser, or to a file on this device.</DialogDescription>

  <div className="settings-id-row">
   <label>Settings ID<input value={id} onChange={e=>{setId(e.target.value);clearNote();}} autoComplete="off" spellCheck={false} maxLength={40} placeholder="Create an ID or type one to apply" disabled={busy}/></label>
   <label>Settings ID Owner Name<input value={owner} onChange={e=>{setOwner(e.target.value);clearNote();}} autoComplete="off" maxLength={60} placeholder="Who is creating this ID" disabled={busy}/></label>
  </div>
  <div className="form-actions">
   <button className="secondary" disabled={busy} onClick={create}>Create new ID</button>
   <button className="secondary" disabled={busy||!id} onClick={async()=>{try{await navigator.clipboard.writeText(normaliseId(id));note('ID copied to the clipboard.','ok');}catch{note('Select and copy the ID from the field above.','error');}}}>Copy ID</button>
  </div>
  <p className="sites-help">The ID and owner name are only needed for online saving. IDs are not secret and are meant to be shared; anyone with one can also overwrite what is stored under it.</p>

  <div className="settings-choice">
   <h3 className="site-form-title">Save your settings</h3>
   <div className="form-actions">
    <button className="primary" disabled={busy||!ready||!id||!owner} onClick={()=>online('save')}>Save online</button>
    <button className="secondary" disabled={busy||!ready} onClick={saveToFile}>Save to a file</button>
   </div>
  </div>

  <div className="settings-choice">
   <h3 className="site-form-title">Restore settings</h3>
   <div className="form-actions">
    <button className="secondary" disabled={busy||!id} onClick={()=>online('apply')}>Restore from online</button>
    <button className="secondary" disabled={busy} onClick={()=>fileInput.current?.click()}>Restore from a file</button>
   </div>
   <input ref={fileInput} type="file" accept=".json,application/json" aria-label="Choose a Mynews settings file" hidden onChange={fileChosen}/>
  </div>

  {conflict&&<div className="settings-confirm" role="alertdialog" aria-label="Replace saved settings"><p><strong>{conflict.id}</strong> already holds settings saved by <strong>{conflict.owner}</strong> on {new Intl.DateTimeFormat('en-SG',{dateStyle:'medium',timeStyle:'short'}).format(new Date(conflict.updatedAt))}. Replacing them cannot be undone.</p><div className="form-actions"><button className="secondary" disabled={busy} onClick={()=>setConflict(null)}>Cancel</button><button className="primary" disabled={busy} onClick={()=>online('save',true)}>{busy?'Replacing…':'Replace them'}</button></div></div>}{message&&<p role="status" className={tone==='error'?'settings-error':'settings-ok'}>{message}</p>}
 
 </div>;
}
