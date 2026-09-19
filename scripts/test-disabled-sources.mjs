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
 await page.getByRole('button',{name:'All sites (12)',exact:true}).click();
 for(const [id,name] of [['bing','Bing News'],['google','Google News'],['hackernews','Hacker News']]){
  requests.length=0;
  await page.locator('.service-row').filter({has:page.getByText(name,{exact:true})}).getByRole('button',{name:'Stop using',exact:true}).click();
  await page.getByRole('heading',{name:id+' result',exact:true}).waitFor({state:'detached'});
  assert.ok(!requests.includes(id),'Disabled service must not be requested: '+id);
 }
 await page.getByRole('button',{name:'Close',exact:true}).click();
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
 await page.evaluate(()=>localStorage.setItem('mynews-sources',JSON.stringify(['service:apnews.com'])));
 await page.reload();await page.getByText('they can only be reached by searching',{exact:false}).waitFor();requests.length=0;
 // All built-ins can be removed; Select all must not resurrect them.
 await page.getByRole('button',{name:'All sites (12)',exact:true}).click();
 assert.equal(await page.getByLabel('Website name',{exact:true}).count(),0,'Add form starts hidden');
 await page.getByRole('button',{name:'Add Website',exact:true}).click();
 await page.getByLabel('Website name',{exact:true}).fill('Personal feed');
 await page.getByLabel('Website URL',{exact:true}).fill('https://personal.example/');
 await page.getByRole('button',{name:'Add site',exact:true}).click();
 assert.equal(await page.getByLabel('Website name',{exact:true}).count(),0,'Successful add hides form');
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
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.reload();
 await page.getByRole('button',{name:'All sites (0)',exact:true}).click();
 assert.equal(await page.locator('.service-row').count(),0,'Removed defaults stay gone after reload');
 await page.getByRole('button',{name:'Reset to Default',exact:true}).click();
 assert.equal(await page.locator('.service-row').count(),12);
 assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('mynews-sources')))).length,12);
 console.log('PASS: Stop using excludes each engine, all disabled engines remain off, RSS works, stale cache ignored, reload preserves selection, search-only selection has no fallback.');
}finally{await browser.close();}
