import { parseFeed } from '@/lib/news';
export async function GET(request:Request) {
 const q=new URL(request.url).searchParams.get('q')?.trim();
 if(!q||q.length>300)return Response.json({error:'Choose a keyword list of up to 300 characters.'},{status:400});
 try {const response=await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss`,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/rss+xml'}}); if(!response.ok)throw new Error('Feed unavailable'); const reader=response.body?.getReader(); if(!reader)throw new Error('Empty feed'); let size=0,xml=''; const decoder=new TextDecoder(); while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>1500000){await reader.cancel();throw new Error('Feed too large');}xml+=decoder.decode(value,{stream:true});} xml+=decoder.decode(); if(!xml.includes('<rss'))throw new Error('Invalid feed');return Response.json({articles:parseFeed(xml,q),fetchedAt:new Date().toISOString()},{headers:{'Cache-Control':'public, max-age=300'}});
 }catch {return Response.json({error:'This news feed is temporarily unavailable. Try refreshing shortly.'},{status:502});}
}
