'use client';
import {useState} from 'react';
import {DialogDescription} from '@/components/ui/dialog';
import {Check} from 'lucide-react';
import {toast} from 'sonner';
import {audiences,audienceAllows,siteAudience,services,blockedWordsText,parseBlockedWords,type Audience,type NewsSite} from '@/lib/news';

// Two filters, both honest about what they are. Neither is a content rating:
// nobody issues ratings for articles, no feed format carries one, and the
// reader is the only one who can say who a source writes for.
export default function FiltersPanel({sites,removedSources,maxAudience,blockedWords,onSave,onDone}:{
 sites:NewsSite[];removedSources:string[];maxAudience:Audience;blockedWords:string[];
 onSave:(next:{maxAudience:Audience;blockedWords:string[]})=>Promise<void>|void;onDone:()=>void;
}){
 const [tier,setTier]=useState<Audience>(maxAudience);
 const [words,setWords]=useState(()=>blockedWordsText(blockedWords));
 const [busy,setBusy]=useState(false);
 const parsed=parseBlockedWords(words);
 const changed=tier!==maxAudience||blockedWordsText(parsed)!==blockedWordsText(blockedWords);
 // What this setting would leave in place, counted from the sources that are
 // actually available rather than from the ones in use.
 const shownServices=services.filter(s=>!removedSources.includes(s.id));
 const keptServices=shownServices.filter(s=>audienceAllows(tier,s.audience)).length;
 const keptSites=sites.filter(s=>audienceAllows(tier,siteAudience(s))).length;
 async function submit(event:React.FormEvent){
  event.preventDefault();setBusy(true);
  try{await onSave({maxAudience:tier,blockedWords:parsed});toast.success('Reading filters updated');onDone();}
  catch(error){toast.error(error instanceof Error?error.message:'Could not save those filters.');}
  finally{setBusy(false);}
 }
 return <div className="settings-panel">
  <form onSubmit={submit}>
   <div className="panel-actions">
    <button className="primary" disabled={busy||!changed}>{busy?'Saving…':changed?'Save filters':'Saved'}</button>
    <button type="button" className="secondary" disabled={busy||(tier==='general'&&!parsed.length)} onClick={()=>{setTier('general');setWords('');}}>Turn both off</button>
    <span className="count">{keptServices+keptSites} of {shownServices.length+sites.length} sources pass</span>
   </div>
   <DialogDescription>These two filters run in this browser, on what a source says about itself and on the words in a headline. Neither is a content rating — nothing issues ratings for articles — and neither can see the article behind a harmless-looking headline.</DialogDescription>

   <fieldset className="audience-choice">
    <legend className="site-form-title">Show sources written for</legend>
    <div className="audience-options">{[...audiences].reverse().map(({id,label,hint})=>
     <button type="button" key={id} role="radio" aria-checked={tier===id} className={'source-option '+(tier===id?'is-on':'')} onClick={()=>setTier(id)}>
      <span className="source-tick">{tier===id&&<Check size={13}/>}</span>
      <span className="source-name">{label}{id==='general'?' — no filter':' and below'}<small>{hint}</small></span>
     </button>)}</div>
    <p className="sites-help">You set the label on each website under Source sites. A website you have not labelled counts as General, so it is held back rather than let through by accident. Bing News, Google News, Hacker News and the built-in publishers are all General: a search of the whole web cannot be held to an audience, so choosing Children or Teen switches them off.</p>
    {tier!=='general'&&keptServices+keptSites===0&&<p className="settings-error">Nothing passes this setting yet. Label at least one website Children or Teen under Source sites, or there will be no stories.</p>}
   </fieldset>

   <div className="blocked-words">
    <label className="site-form-title" htmlFor="blocked-words">Hide stories containing these words</label>
    <textarea id="blocked-words" value={words} onChange={e=>setWords(e.target.value)} rows={4} maxLength={4000} placeholder="murder, shooting, overdose, war crime"/>
    <p className="sites-help">Separate terms with commas or new lines, up to 200. Whole words only, so “gun” does not hide “Burgundy”; a term with a space is matched as a phrase. A story is hidden when its headline or its excerpt contains one. {parsed.length} term{parsed.length===1?'':'s'} in use.</p>
   </div>

   <p className="sites-help">What this does not do: it does not read the article, so a mild headline on a grim story still gets through, and a story worth reading can be hidden by an unlucky word. Treat it as a coarse filter you tune, not a safety net.</p>
  </form>
 </div>;
}
