import type {SettingsBackup} from '@/lib/browser-library';
import {allSources,services,siteSourceId,siteAudience,audiences,audienceAllows} from '@/lib/news';

export default function SettingsPreview({backup}:{backup:SettingsBackup}){
 const available=allSources(backup.sites,backup.removedSources);
 const selected=new Set(backup.sources??available.map(s=>s.id));
 const audienceLabel=(value:string)=>audiences.find(a=>a.id===value)?.label||value;
 const status=(id:string,audience:'children'|'teen'|'general')=>backup.removedSources.includes(id)?'Removed':!selected.has(id)?'Off':!audienceAllows(backup.maxAudience,audience)?'Selected — held back by audience filter':'In use';
 return <div className="settings-preview">
  <section aria-label="Reading filters preview">
   <h3>Reading filters</h3>
   <dl><dt>Show sources written for</dt><dd>{backup.maxAudience==='general'?'General — no audience filter':audienceLabel(backup.maxAudience)+' and below'}</dd>
   <dt>Hide stories containing these words</dt><dd>{backup.blockedWords.length?backup.blockedWords.join(', '):'None — word filter off'}</dd>
   <dt>Only from my sites</dt><dd>{backup.onlySites?'On':'Off'}</dd></dl>
  </section>
  <section aria-label="Display settings preview">
   <h3>Display and identification</h3>
   <dl><dt>Text size</dt><dd>{backup.fontSize}px</dd><dt>Article display</dt><dd>{backup.hideExcerpt?'Headlines only':'Headlines and excerpts'}</dd>
   <dt>News services section</dt><dd>{backup.servicesCollapsed?'Collapsed':'Expanded'}</dd>
   <dt>Settings ID</dt><dd>{backup.settingsId===undefined?'Keep current ID':backup.settingsId||'Not set'}</dd>
   <dt>Settings ID Owner Name</dt><dd>{backup.settingsOwner===undefined?'Keep current owner':backup.settingsOwner||'Not set'}</dd></dl>
  </section>
  <section aria-label="Keyword topics preview"><h3>Keyword topics ({backup.topics.length})</h3>
   {backup.topics.length?<ul>{backup.topics.map(t=><li key={t.name}><strong>{t.name}</strong><p>{t.keywords}</p></li>)}</ul>:<p>No keyword topics.</p>}
  </section>
  <section aria-label="News services preview"><h3>News services</h3><ul>{services.map(s=><li key={s.id}><strong>{s.name}</strong><p>{status(s.id,s.audience)} · {audienceLabel(s.audience)}</p></li>)}</ul></section>
  <section aria-label="Source websites preview"><h3>Saved source websites ({backup.sites.length})</h3>
   {backup.sites.length?<ul>{backup.sites.map(s=><li key={s.url}><strong>{s.name}</strong><p>{status(siteSourceId(s),siteAudience(s))} · {audienceLabel(siteAudience(s))}</p>
    <dl><dt>Website</dt><dd><a href={s.url} target="_blank" rel="noopener noreferrer">{s.url}</a></dd><dt>Feed</dt><dd>{s.feedUrl||'None — needs a search service'}</dd><dt>Search URL</dt><dd>{s.searchUrl||'Google search restricted to this website'}</dd></dl>
   </li>)}</ul>:<p>No saved websites. News services are listed above.</p>}
  </section>
  <section aria-label="Reading list preview"><h3>Saved articles ({backup.articles.length})</h3>{backup.articles.length?<ul>{backup.articles.map(a=><li key={a.url}><a href={a.url} target="_blank" rel="noopener noreferrer">{a.title}</a><p>{a.url}</p></li>)}</ul>:<p>No saved articles.</p>}</section>
 </div>;
}
