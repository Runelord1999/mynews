import assert from 'node:assert/strict';
const {chromium}=await import(process.env.MYNEWS_PLAYWRIGHT_MODULE||'playwright-core');
// Use whatever Chromium this machine already has rather than downloading one:
// an explicit path, the build Playwright installed, or the Chrome or Edge that
// comes with the desktop.
async function launchBrowser(){
 const installed=process.env.PLAYWRIGHT_BROWSERS_PATH?process.env.PLAYWRIGHT_BROWSERS_PATH+'/chromium':'';
 const attempts=[
  ...(process.env.MYNEWS_BROWSER?[{executablePath:process.env.MYNEWS_BROWSER}]:[]),
  ...(installed?[{executablePath:installed}]:[]),
  {channel:'chrome'},{channel:'msedge'},{},
 ];
 let last;
 for(const options of attempts){try{return await chromium.launch({headless:true,...options});}catch(error){last=error;}}
 throw Error('No Chromium, Chrome or Edge could be launched. Install one, or set MYNEWS_BROWSER to a browser executable. Last error: '+(last&&last.message));
}
const browser=await launchBrowser();
try{
 const context=await browser.newContext();
 const sources=['bing','google','hackernews','service:arstechnica.com','service:apnews.com'];
 const stale={id:'https://old.test/',url:'https://old.test/',title:'Stale Bing headline',excerpt:'Old cached result',source:'old.test',date:new Date().toISOString(),topic:'Test',provider:'Bing News'};
 await context.addInitScript(({sources,stale})=>{if(localStorage.getItem('mynews-library-v1'))return;localStorage.setItem('mynews-library-v1',JSON.stringify({topics:[{name:'Test',keywords:'robotics'}],articles:[],sites:[],starterSitesVersion:4}));localStorage.setItem('mynews-sources',JSON.stringify(sources));localStorage.setItem('mynews-feed-cache-v1',JSON.stringify({[sources.slice(3).sort().join(',')]:{articles:[stale],fetchedAt:new Date().toISOString()}}));},{sources,stale});
 const requests=[];
 await context.route('**/api/feed?**',async route=>{const url=new URL(route.request().url());const provider=url.searchParams.get('provider');requests.push(provider);const article={...stale,id:'https://test.example/'+provider,url:'https://test.example/'+provider,title:provider+' result',provider:({bing:'Bing News',google:'Google News',hackernews:'Hacker News',sitefeed:'arstechnica.com'})[provider]};await route.fulfill({json:{articles:[article]}});});
 const page=await context.newPage();await page.goto(process.env.MYNEWS_TEST_URL||'http://127.0.0.1:5180/mynews/');
 await page.getByRole('heading',{name:'bing result',exact:true}).waitFor();
 // The page itself carries no settings strips any more.
 assert.equal(await page.locator('.radar-strip').count(),0,'the topic strip moved into settings');
 assert.equal(await page.locator('.sites-strip').count(),0,'Your search source sites moved into settings');
 assert.equal(await page.getByRole('button',{name:'Open settings',exact:true}).count(),1);

 // The three sections are pages of one dialog.
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 for(const name of ['Keyword Topics','Source sites','Reading filters','Save settings']){
  await page.getByRole('tab',{name,exact:true}).click();
  assert.equal(await page.getByRole('tab',{name,exact:true}).getAttribute('aria-selected'),'true',name+' is a page of the settings dialog');
 }
 await page.getByRole('tab',{name:'Keyword Topics',exact:true}).click();
 await page.getByLabel('Topic name',{exact:true}).first().waitFor();
 // Each page leads with its actions, and neither scrolls inside the dialog.
 const topicsBox=await page.locator('.settings-panel').evaluate(el=>{const c=getComputedStyle(el);return {maxHeight:c.maxHeight,overflowY:c.overflowY,scrolls:el.scrollHeight>el.clientHeight+1};});
 assert.equal(topicsBox.maxHeight,'none','a settings page is not capped in height');
 assert.ok(!['auto','scroll'].includes(topicsBox.overflowY),'a settings page has no scrollbar of its own');
 assert.equal(topicsBox.scrolls,false);
 const topicActions=await page.locator('.settings-panel .panel-actions').boundingBox();
 const topicList=await page.locator('.topic-editor').boundingBox();
 assert.ok(topicActions.y<topicList.y,'New topic and Save sit above the list');
 const topicHelp=await page.getByText('Name a topic and give it comma-separated keywords',{exact:false}).boundingBox();
 assert.ok(topicActions.y<topicHelp.y&&topicHelp.y<topicList.y,'the explanation sits between the actions and the list');
 const editorBox=await page.locator('.topic-editor').evaluate(el=>getComputedStyle(el).maxHeight);
 assert.equal(editorBox,'none','the topic list is not a scrolling box');
 await page.getByRole('tab',{name:'Save settings',exact:true}).click();
 await page.getByLabel('Settings ID',{exact:true}).waitFor();
 // Save to a file asks the browser for a location when it can, and falls back
 // to a download when it cannot.
 await page.evaluate(()=>{window.__picked=null;window.showSaveFilePicker=async o=>{window.__picked=o;return {name:o.suggestedName,createWritable:async()=>({written:'',write(d){this.written=d;window.__wrote=d;},close:async()=>{}})};};});
 await page.getByLabel('Settings ID',{exact:true}).fill('teen-reader');
 await page.getByRole('button',{name:'Save to a file',exact:true}).click();
 const picked=await page.evaluate(()=>window.__picked);
 assert.ok(picked,'the browser is asked where to put the file');
 assert.match(picked.suggestedName,/^mynews-settings-teen-reader-\d{4}-\d{2}-\d{2}\.json$/,'the suggested name carries the settings id and the date');
 assert.deepEqual(picked.types[0].accept,{'application/json':['.json']});
 const wrote=await page.evaluate(()=>window.__wrote);
 assert.equal(JSON.parse(wrote).format,'mynews-settings','the settings themselves are written');

 // Closing the dialog is a decision, not an error.
 await page.evaluate(()=>{window.showSaveFilePicker=async()=>{const e=new DOMException('cancelled','AbortError');throw e;};});
 await page.getByRole('button',{name:'Save to a file',exact:true}).click();
 await page.waitForTimeout(300);
 assert.equal(await page.locator('.settings-error').count(),0,'cancelling reports nothing');

 // Reading filters: an audience label per source, and a blocked-words list.
 await page.getByRole('tab',{name:'Reading filters',exact:true}).click();
 const filterActions=await page.locator('.settings-panel .panel-actions').boundingBox();
 const audienceBox=await page.locator('.audience-choice').boundingBox();
 assert.ok(filterActions.y<audienceBox.y,'Save filters leads the page like the others');
 assert.equal(await page.getByRole('radio',{name:/^General/}).getAttribute('aria-checked'),'true','no audience filter to begin with');
 assert.equal(await page.locator('.filter-note').count(),0,'nothing is shown on the page while both filters are off');
 // Blocked words hide a story that is already on screen, without refetching.
 requests.length=0;
 await page.getByLabel('Hide stories containing these words',{exact:true}).fill('bing, war crime');
 await page.getByRole('button',{name:'Save filters',exact:true}).click();
 await page.getByRole('heading',{name:'bing result',exact:true}).waitFor({state:'detached'});
 assert.equal(requests.length,0,'a word filter is applied to what is on screen, not by searching again');
 await page.getByRole('heading',{name:'google result',exact:true}).waitFor();
 const note=page.locator('.filter-note');
 await note.waitFor();
 assert.match(await note.innerText(),/1 hidden/,'the page says how many stories the words took out');
 // Whole words only: "bing" must not take out a headline that merely contains it.
 await note.click();
 await page.getByLabel('Hide stories containing these words',{exact:true}).fill('bin');
 await page.getByRole('button',{name:'Save filters',exact:true}).click();
 await page.getByRole('heading',{name:'bing result',exact:true}).waitFor();
 // An audience filter drops whole sources, so it does change what is fetched.
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 await page.getByRole('tab',{name:'Reading filters',exact:true}).click();
 await page.getByLabel('Hide stories containing these words',{exact:true}).fill('');
 await page.getByRole('radio',{name:/^Teen/}).click();
 await page.getByRole('button',{name:'Save filters',exact:true}).click();
 await page.getByText('none of your',{exact:false}).waitFor();
 assert.equal(await page.locator('.story').count(),0,'every built-in source is General, so a Teen filter leaves nothing');
 // Labelling a website Teen gives the filter something to keep.
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 await page.getByRole('tab',{name:'Source sites',exact:true}).click();
 await page.getByRole('button',{name:'Add Website',exact:true}).click();
 await page.getByLabel('Website name',{exact:true}).fill('Teen feed');
 await page.getByLabel('Website URL',{exact:true}).fill('https://teen.example/');
 await page.getByLabel('Full-text feed URL (optional)',{exact:true}).fill('https://teen.example/feed');
 await page.getByLabel('Written for',{exact:true}).selectOption('teen');
 await page.getByRole('button',{name:'Add site',exact:true}).click();
 await page.keyboard.press('Escape');
 await page.getByRole('heading',{name:'sitefeed result',exact:true}).waitFor();
 assert.equal(await page.locator('.story').count(),1,'only the Teen-labelled website is read');
 assert.ok(requests.every(p=>p==='sitefeed'),'a General search service is not queried under a Teen filter');
 // The label is stored with the site and can be changed from the row.
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 await page.getByRole('tab',{name:'Source sites',exact:true}).click();
 assert.equal(await page.getByLabel('Audience for Teen feed',{exact:true}).inputValue(),'teen');
 await page.getByLabel('Audience for Teen feed',{exact:true}).selectOption('general');
 await page.getByRole('tab',{name:'Reading filters',exact:true}).click();
 await page.getByRole('radio',{name:/^General/}).click();
 await page.getByRole('button',{name:'Save filters',exact:true}).click();
 assert.equal(await page.locator('.filter-note').count(),0,'turning the filters off clears the notice');
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 await page.getByRole('tab',{name:'Source sites',exact:true}).click();
 await page.getByRole('button',{name:'Remove Teen feed',exact:true}).click();

 // Back to the sources page for the rest.
 await page.getByRole('tab',{name:'Source sites',exact:true}).click();
 const siteActions=await page.locator('.settings-panel .panel-actions').boundingBox();
 const services=await page.locator('.all-source-services').boundingBox();
 assert.ok(siteActions.y<services.y,'Add Website and Add suggested sources sit above the lists');
 await page.getByRole('button',{name:'Add Website',exact:true}).waitFor();
 assert.equal(await page.locator('.service-row:visible').count(),12,'services are listed when the section is open');
 await page.getByRole('button',{name:/Minimize news services/}).click();
 assert.equal(await page.locator('.service-row:visible').count(),0,'minimizing hides the service rows');
 await page.getByRole('button',{name:/Expand news services/}).click();
 assert.equal(await page.locator('.service-row:visible').count(),12,'expanding brings them back');
 for(const [id,name] of [['bing','Bing News'],['google','Google News'],['hackernews','Hacker News']]){
  requests.length=0;
  await page.locator('.service-row').filter({has:page.getByText(name,{exact:true})}).getByRole('button',{name:'Stop using',exact:true}).click();
  await page.getByRole('heading',{name:id+' result',exact:true}).waitFor({state:'detached'});
  assert.ok(!requests.includes(id),'Disabled service must not be requested: '+id);
 }
 await page.keyboard.press('Escape');
 await page.getByRole('heading',{name:'sitefeed result',exact:true}).waitFor();
 assert.equal(await page.getByText('Stale Bing headline',{exact:true}).count(),0);
 assert.ok(requests.every(p=>p==='sitefeed'));
 requests.length=0;await page.reload();await page.getByRole('heading',{name:'sitefeed result',exact:true}).waitFor();assert.equal(requests.length,0,'Corrected cache should be reused on reload');
 await page.evaluate(()=>localStorage.setItem('mynews-sources',JSON.stringify(['service:apnews.com'])));
 await page.reload();await page.getByText('they can only be reached by searching',{exact:false}).waitFor();assert.equal(requests.length,0,'Search-only sites must not silently enable engines');assert.equal(await page.locator('.story').count(),0);
 // The notice offers the fix; pressing it must actually search.
 await page.getByRole('button',{name:/^Turn on /}).click();
 await page.getByRole('heading',{name:'bing result',exact:true}).waitFor();
 assert.ok(requests.includes('bing')&&requests.includes('google')&&requests.includes('hackernews'),'the fix enables every search service');
 // Only from my sites is remembered; its effect on requests is covered by the
 // unit-level query packing and by the source model.
 assert.equal(await page.evaluate(()=>localStorage.getItem('mynews-only-sites')),null,'off unless asked for');
 await page.evaluate(()=>localStorage.setItem('mynews-sources',JSON.stringify(['service:apnews.com'])));
 await page.reload();await page.getByText('they can only be reached by searching',{exact:false}).waitFor();requests.length=0;
 // All built-ins can be removed; Select all must not resurrect them.
 await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('tab',{name:'Source sites',exact:true}).click();
 assert.equal(await page.getByLabel('Website name',{exact:true}).count(),0,'Add form starts hidden');
 await page.getByRole('button',{name:'Add Website',exact:true}).click();
 await page.getByLabel('Website name',{exact:true}).fill('Personal feed');
 await page.getByLabel('Website URL',{exact:true}).fill('https://personal.example/');
 await page.getByRole('button',{name:'Add site',exact:true}).click();
 assert.equal(await page.getByLabel('Website name',{exact:true}).count(),0,'Successful add hides form');
 // The saved websites heading summarises use, and the bulk feed lookup only
 // appears while some website still has no feed.
 await page.getByText(/^\d+ of \d+ in use$/).first().waitFor();
 assert.equal(await page.getByRole('button',{name:'Find feeds for all',exact:true}).count(),1,'offered while a website has no feed');
 await page.evaluate(()=>{const k='mynews-library-v1';const s=JSON.parse(localStorage.getItem(k));s.sites=s.sites.map(x=>({...x,feedUrl:'https://personal.example/feed'}));localStorage.setItem(k,JSON.stringify(s));});
 await page.reload();
 await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('tab',{name:'Source sites',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Find feeds for all',exact:true}).count(),0,'hidden once every website has a feed');
 // Saved websites must not scroll inside a box of their own, so a long list
 // can be reached by scrolling the dialog.
 const savedBox=await page.locator('.saved-sites').evaluate(el=>{const s=getComputedStyle(el);return {maxHeight:s.maxHeight,overflowY:s.overflowY,scrolls:el.scrollHeight>el.clientHeight+1};});
 assert.equal(savedBox.maxHeight,'none','saved websites are not capped in height');
 assert.ok(!['auto','scroll'].includes(savedBox.overflowY),'saved websites have no scrollbar of their own');
 assert.equal(savedBox.scrolls,false);
 await page.getByRole('button',{name:'Edit Personal feed',exact:true}).click();
 await page.getByLabel('Website name',{exact:true}).fill('Renamed feed');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await page.getByRole('button',{name:'Remove Renamed feed',exact:true}).click();
 for(const name of ['Bing News','Google News','Hacker News','Associated Press','Ars Technica','Futurism','BBC','Reuters','Guardian','Aljazeera','CNA','CBC']){
  await page.getByRole('button',{name:'Remove '+name,exact:true}).click();
 }
 assert.equal(await page.locator('.service-row').count(),0);
 await page.getByRole('button',{name:'Use all services and websites',exact:true}).click();
 assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('mynews-sources'))),[]);
 await page.getByRole('button',{name:/Minimize news services/}).click();
 await page.keyboard.press('Escape');
 await page.reload();
 await page.getByRole('button',{name:'Open settings',exact:true}).click();await page.getByRole('tab',{name:'Source sites',exact:true}).click();
 assert.ok(await page.getByRole('button',{name:/Expand news services/}).count(),'the section stays minimized across a reload');
 await page.getByRole('button',{name:/Expand news services/}).click();
 assert.equal(await page.locator('.service-row').count(),0,'Removed defaults stay gone after reload');
 await page.getByRole('button',{name:'Reset to Default',exact:true}).click();
 assert.equal(await page.locator('.service-row').count(),12);
 assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('mynews-sources')))).length,12);

 // Suggested sources are offered for confirmation, not added outright.
 const before=await page.locator('.saved-site-row').count();
 await page.getByRole('button',{name:'Add suggested sources',exact:true}).click();
 await page.getByRole('heading',{name:'Add these sources?',exact:true}).waitFor({timeout:90000});
 assert.equal(await page.locator('.saved-site-row').count(),before,'nothing is added until confirmed');
 const offeredCount=await page.locator('.suggestion-list [role=menuitemcheckbox]').count();
 assert.ok(offeredCount>1,'working feeds are offered');
 await page.locator('.suggestion-list [role=menuitemcheckbox]').first().click();
 await page.getByRole('button',{name:'Add '+(offeredCount-1)+' sources',exact:true}).click();
 assert.equal(await page.locator('.saved-site-row').count(),before+offeredCount-1,'only the ticked ones are added');

 // Cancelling adds nothing.
 const now=await page.locator('.saved-site-row').count();
 await page.getByRole('button',{name:'Add suggested sources',exact:true}).click();
 await page.getByRole('heading',{name:'Add these sources?',exact:true}).waitFor({timeout:90000});
 await page.getByRole('button',{name:'Cancel',exact:true}).click();
 assert.equal(await page.locator('.saved-site-row').count(),now,'cancel adds nothing');
 await page.getByText(/^\d+ of \d+ in use$/).first().waitFor();

 console.log('PASS: settings dialog holds the four sections, audience labels drop whole sources and blocked words hide stories without refetching, services section folds and is remembered, saved websites flow into the dialog, Stop using excludes each engine, all disabled engines remain off, RSS works, stale cache ignored, reload preserves selection, search-only selection has no fallback.');
}finally{await browser.close();}
