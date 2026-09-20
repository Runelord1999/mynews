import assert from 'node:assert/strict';
const {chromium}=await import(process.env.MYNEWS_PLAYWRIGHT_MODULE||'playwright-core');
const browser=await chromium.launch({headless:true,...(process.env.MYNEWS_BROWSER?{executablePath:process.env.MYNEWS_BROWSER}:{})});
try{
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.addInitScript(()=>{localStorage.setItem('mynews-library-v1',JSON.stringify({topics:[],sites:[],articles:[{id:'https://example.com/story',url:'https://example.com/story',title:'Reader test',excerpt:'Short card excerpt',source:'Example',topic:'General',date:new Date().toISOString()}],starterSitesVersion:4}));localStorage.setItem('mynews-sources','[]');});
let fail=false;
await page.route('**/api/article',r=>r.fulfill({status:fail?502:200,json:fail?{error:'The article is blocked or unavailable.'}:{summary:Array.from({length:30},(_,i)=>'Paragraph '+i+' '+('article words '.repeat(20))).join('\n\n')}}));
await page.goto(process.env.MYNEWS_TEST_URL||'http://127.0.0.1:5181/mynews/');
await page.getByRole('tab',{name:'Reading list'}).click();
await page.getByRole('button',{name:'Read more',exact:true}).click();
await page.locator('.article-reader-body').getByText('Paragraph 29',{exact:false}).waitFor();
assert.ok(await page.locator('.article-reader-body').evaluate(e=>e.scrollHeight>e.clientHeight),'long articles scroll');
assert.equal(await page.locator('.story-link p').textContent(),'Short card excerpt');
await page.screenshot({path:'../article-reader-mobile.png'});
await page.keyboard.press('Escape');
fail=true;await page.reload();
await page.getByRole('tab',{name:'Reading list'}).click();
await page.getByRole('button',{name:'Read more',exact:true}).click();
await page.getByRole('alert').filter({hasText:'blocked or unavailable'}).waitFor();
console.log('PASS: full article reader, scrolling, unchanged card excerpt and visible failure note');
}finally{await browser.close();}
