import assert from 'node:assert/strict';
import {build} from 'esbuild';
const compiled=await build({entryPoints:['lib/news.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {siteSearchLink}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const url=siteSearchLink({name:'Example',url:'https://example.com',searchUrl:'https://example.com/search?q={query}'},'AI & governance');
assert.equal(new URL(url).searchParams.get('q'),'AI & governance');
const fallback=siteSearchLink({name:'Example',url:'https://example.com',searchUrl:''},'OpenAI OR AGI');
assert.equal(new URL(fallback).searchParams.get('q'),'site:example.com (OpenAI OR AGI)');
for(const provider of ['bing','google','hackernews']){
 const response=await fetch('http://localhost:5173/api/feed?q=OpenAI&provider='+provider);
 assert.equal(response.status,200,provider);
 const data=await response.json();assert.ok(data.articles.length>0,provider+' should return live stories');
 assert.ok(data.articles.every(a=>a.provider&&a.title&&/^https?:/.test(a.url)));
 console.log(provider+': '+data.articles.length+' live stories');
}
const bad=await fetch('http://localhost:5173/api/feed?q=AI&provider=unknown');assert.equal(bad.status,400);
console.log('PASS: native site searches, restricted fallback search, all live providers, and invalid provider rejection.');
