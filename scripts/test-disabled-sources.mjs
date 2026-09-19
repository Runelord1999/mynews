import assert from 'node:assert/strict';
const {chromium}=await import(process.env.MYNEWS_PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.MYNEWS_BROWSER?{executablePath:process.env.MYNEWS_BROWSER}:{})});
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
 await page.reload();await page.getByText('The selected websites need a news service to search them.',{exact:false}).waitFor();assert.equal(requests.length,0,'Search-only sites must not silently enable engines');assert.equal(await page.locator('.story').count(),0);
 console.log('PASS: Stop using excludes each engine, all disabled engines remain off, RSS works, stale cache ignored, reload preserves selection, search-only selection has no fallback.');
}finally{await browser.close();}
