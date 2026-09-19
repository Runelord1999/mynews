'use client';
import {useState} from 'react';
import {DialogDescription} from '@/components/ui/dialog';
import {Plus,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import type {Topic} from '@/lib/news';

// Topics are edited here rather than on the page: the strip that used to sit
// above the stories was a copy of the tabs with an edit button attached.
export default function TopicsPanel({topics,onSave,onDone}:{topics:Topic[];onSave:(topics:Topic[])=>Promise<void>|void;onDone:()=>void}){
 const [draft,setDraft]=useState<Topic[]>(()=>topics.map(t=>({...t})));
 const [busy,setBusy]=useState(false);
 const changed=JSON.stringify(draft)!==JSON.stringify(topics);
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);
  try{await onSave(draft);toast.success('Your topics are updated');onDone();}
  catch(error){toast.error(error instanceof Error?error.message:'Could not save those topics.');}
  finally{setBusy(false);}
 }
 return <div className="settings-panel">
  <form onSubmit={submit}>
   <div className="panel-actions">
    <button type="button" className="secondary" disabled={draft.length>=20} onClick={()=>setDraft(old=>[...old,{name:'',keywords:''}])}><Plus size={16}/>New topic</button>
    <button className="primary" disabled={busy||!changed}>{busy?'Saving…':changed?'Save topics':'Saved'}</button>
    <span className="count">{draft.length} of 20 topics</span>
   </div>
   <DialogDescription>Name a topic and give it comma-separated keywords. A story matches a topic when it mentions any of them, and anything matching none still appears under All stories.</DialogDescription>
   {draft.length===0&&<p className="sites-help">No keyword topics. Add a new topic or load a default settings set under Save settings.</p>}<div className="topic-editor">{draft.map((topic,index)=><div className="topic-edit" key={index}>
    <div>
     <label>Topic name<input required maxLength={40} value={topic.name} onChange={e=>setDraft(old=>old.map((x,i)=>i===index?{...x,name:e.target.value}:x))}/></label>
     <label>Keywords<input required maxLength={300} value={topic.keywords} onChange={e=>setDraft(old=>old.map((x,i)=>i===index?{...x,keywords:e.target.value}:x))}/></label>
    </div>
    <button type="button" aria-label={'Remove topic '+(topic.name||'without a name')} onClick={()=>setDraft(old=>old.filter((_,i)=>i!==index))}><Trash2 size={17}/></button>
   </div>)}</div>
   <p className="sites-help">Removing a topic does not remove anything already saved to your reading list.</p>
  </form>
 </div>;
}
