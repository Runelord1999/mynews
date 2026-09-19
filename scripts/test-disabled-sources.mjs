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
 assert.equal(await page.locator('.radar-strip').count(),0,'On your radar moved into settings');
 assert.equal(await page.locator('.sites-strip').count(),0,'Your search source sites moved into settings');
 assert.equal(await page.getByRole('button',{name:'Open settings',exact:true}).count(),1);

 // The three sections are pages of one dialog.
 await page.getByRole('button',{name:'Open settings',exact:true}).click();
 for(const name of ['On your radar','Source sites','Save settings']){
  await page.getByRole('tab',{name,exact:true}).click();
  assert.equal(await page.getByRole('tab',{name,exact:true}).getAttribute('aria-selected'),'true',name+' is a page of the settings dialog');
 }
 await page.getByRole('tab',{name:'On your radar',exact:true}).click();
 await page.getByLabel('Topic name',{exact:true}).first().waitFor();
 await page.getByRole('tab',{name:'Save settings',exact:true}).click();
 await page.getByLabel('Settings ID',{exact:true}).waitFor();

 // Back to the sources page for the rest.
 await page.getByRole('tab',{name:'Source sites',exact:true}).click();
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

 console.log('PASS: settings dialog holds the three sections, services section folds and is remembered, saved websites flow into the dialog, Stop using excludes each engine, all disabled engines remain off, RSS works, stale cache ignored, reload preserves selection, search-only selection has no fallback.');
}finally{await browser.close();}
