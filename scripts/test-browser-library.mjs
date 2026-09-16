import {build} from 'esbuild';
import assert from 'node:assert/strict';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
const result=await build({entryPoints:['lib/browser-library.ts'],bundle:true,platform:'node',format:'esm',write:false});
const lib=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
assert.equal(lib.readLibrary().topics.length,6);
assert.deepEqual(lib.readLibrary().sites,[],'shipped publishers are services now, not the reader\u2019s sites');
lib.writeLibrary({action:'sites',sites:[{name:'My Blog',url:'https://example.org/',searchUrl:'',feedUrl:''}]});
assert.equal(lib.readLibrary().sites.length,1,'a site the reader adds is kept');
const current=lib.readLibrary();
// A library that stored the publishers before they became services loses the
// stored copies, so they are not listed twice, and keeps everything else.
memory.set('mynews-library-v1',JSON.stringify({...current,starterSitesVersion:3,sites:[
 {name:'Custom',url:'https://example.org/',searchUrl:'',feedUrl:''},
 {name:'Reuters',url:'https://www.reuters.com/',searchUrl:'',feedUrl:''},
 {name:'BBC',url:'https://www.bbc.co.uk/news',searchUrl:'',feedUrl:''},
 {name:'Ars Technica',url:'https://arstechnica.com/',searchUrl:'',feedUrl:''},
]}));
const migrated=lib.readLibrary();
assert.deepEqual(migrated.sites.map(s=>s.name),['Custom'],'only the reader\u2019s own site remains');
assert.equal(lib.readLibrary().sites.length,1,'the clean-up runs once, not on every read');

// A library still at version 1 also loses the publishers withdrawn back then.
memory.set('mynews-library-v1',JSON.stringify({...current,starterSitesVersion:1,sites:[
 {name:'Custom',url:'https://example.org/',searchUrl:'',feedUrl:''},
 {name:'technologyreview.com',url:'https://www.technologyreview.com/',searchUrl:'',feedUrl:''},
 {name:'Guardian',url:'https://www.theguardian.com/international',searchUrl:'',feedUrl:''},
]}));
assert.deepEqual(lib.readLibrary().sites.map(s=>s.name),['Custom']);

const article={id:'https://example.com/',url:'https://example.com/',title:'Saved story',excerpt:'An excerpt',source:'example.com',date:new Date().toISOString(),topic:'OpenAI'};
lib.writeLibrary({action:'save',article});
lib.writeLibrary({action:'save',article});
assert.equal(lib.readLibrary().articles.length,1);
lib.writeLibrary({action:'topics',topics:[{name:'Research',keywords:'AGI, AI'}]});
assert.equal(lib.readLibrary().topics[0].name,'Research');
const backup=lib.exportBackup(14);
lib.writeLibrary({action:'sites',sites:[{name:'Example',url:'https://example.com',searchUrl:'https://example.com/search?q={query}'}]});
const sitesBackup=lib.exportBackup(14);
lib.restoreBackup(lib.parseBackup(sitesBackup));
assert.equal(lib.readLibrary().sites[0].name,'Example');
assert.throws(()=>lib.writeLibrary({action:'sites',sites:[{name:'Bad',url:'javascript:alert(1)',searchUrl:''}]}));
assert.throws(()=>lib.writeLibrary({action:'sites',sites:[{name:'Bad',url:'https://example.com',searchUrl:'https://elsewhere.com/?q={query}'}]}));
// A backup written before feeds existed still restores, gaining an empty feed.
const preFeed=JSON.parse(backup);
preFeed.sites=[{name:'Legacy',url:'https://legacy.example/',searchUrl:''}];
assert.equal(lib.parseBackup(JSON.stringify(preFeed)).sites[0].feedUrl,'');
assert.throws(()=>lib.writeLibrary({action:'sites',sites:[{name:'Bad feed',url:'https://example.com',searchUrl:'',feedUrl:'https://elsewhere.com/feed'}]}),'a feed must be on the same website');
lib.writeLibrary({action:'sites',sites:[{name:'Good feed',url:'https://example.com',searchUrl:'',feedUrl:'https://example.com/rss'}]});
assert.equal(lib.readLibrary().sites[0].feedUrl,'https://example.com/rss');
const oldBackup=JSON.parse(backup);delete oldBackup.sites;
assert.deepEqual(lib.parseBackup(JSON.stringify(oldBackup)).sites,[]);
// The edition is cached per source selection so reopening the tab does not
// trigger a fresh round of searches.
const story={id:'https://example.com/n',url:'https://example.com/n',title:'Cached story',excerpt:'Body',source:'example.com',date:new Date().toISOString(),topic:'AI'};
assert.equal(lib.readFeedCache('all|'),null,'nothing cached to begin with');
lib.writeFeedCache('all|',{articles:[story],fetchedAt:'2026-09-16T01:00:00.000Z'});
assert.equal(lib.readFeedCache('all|').articles[0].title,'Cached story');
assert.equal(lib.readFeedCache('all|').fetchedAt,'2026-09-16T01:00:00.000Z');
assert.equal(lib.readFeedCache('bing|'),null,'a different source selection is a different cache');

// Only the four most recent selections are kept.
for(let i=0;i<6;i++)lib.writeFeedCache('key'+i,{articles:[story],fetchedAt:'2026-09-16T02:0'+i+':00.000Z'});
const stored=Object.keys(JSON.parse(memory.get('mynews-feed-cache-v1')));
assert.equal(stored.length,4,'cache is bounded');
assert.ok(stored.includes('key5')&&stored.includes('key2'),'newest selections survive');
assert.ok(!stored.includes('key0'),'oldest selection is dropped');

// A per-view cache is capped so one huge edition cannot fill storage.
lib.writeFeedCache('big',{articles:Array.from({length:500},(_,i)=>({...story,url:'https://example.com/'+i})),fetchedAt:new Date().toISOString()});
assert.equal(lib.readFeedCache('big').articles.length,200);

// Unreadable cache is treated as no cache rather than throwing.
memory.set('mynews-feed-cache-v1','{broken');
assert.equal(lib.readFeedCache('all|'),null);

memory.clear();
const restored=lib.restoreBackup(lib.parseBackup(backup));
assert.equal(lib.readLibrary().sites.length,restored.sites.length,'restoring a backup does not add shipped sites');
assert.equal(restored.fontSize,14);
assert.equal(lib.readLibrary().topics[0].name,'Research');
assert.deepEqual(lib.readLibrary().articles,[article]);
const unchanged=JSON.stringify(lib.readLibrary());
assert.throws(()=>lib.parseBackup('{broken'));
assert.throws(()=>lib.parseBackup(backup.replace('"version": 1','"version": 99')));
assert.throws(()=>lib.parseBackup(JSON.stringify({...JSON.parse(backup),articles:[{...article,url:'javascript:alert(1)'}]})));
assert.equal(JSON.stringify(lib.readLibrary()),unchanged);
assert.throws(()=>lib.writeLibrary({action:'topics',topics:[]}));
assert.throws(()=>lib.writeLibrary({action:'save',article:{...article,url:'javascript:alert(1)'}}));
lib.writeLibrary({action:'remove',id:article.id});
assert.equal(lib.readLibrary().articles.length,0);
globalThis.localStorage.setItem=()=>{throw Error('Storage full');};
assert.throws(()=>lib.writeLibrary({action:'save',article}),/Storage full/);
console.log('PASS: library operations, bounded feed cache, backup export, restore after cleared storage, invalid-file protection, unsafe URLs, and storage failures.');
