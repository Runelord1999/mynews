import {env} from 'cloudflare:workers';
import {parseBackup} from '@/lib/browser-library';

const limit=128*1024;
function headers(request:Request){
 const origin=request.headers.get('origin');
 const allowed=origin==='https://runelord1999.github.io'||origin===new URL(request.url).origin;
 return {'Cache-Control':'no-store','Vary':'Origin',...(allowed?{'Access-Control-Allow-Origin':origin!}:{}),'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization'};
}
export async function OPTIONS(request:Request){return new Response(null,{status:204,headers:headers(request)});}
export async function POST(request:Request){
 const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:headers(request)});
 const origin=request.headers.get('origin');
 if(origin&&origin!=='https://runelord1999.github.io'&&origin!==new URL(request.url).origin)return reply({error:'Invalid origin.'},403);
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 if(!/^[a-f0-9]{64}$/.test(token))return reply({error:'Enter a valid private user ID.'},401);
 try{
  if(Number(request.headers.get('content-length'))>limit)return reply({error:'Settings exceed the 128 KB online backup limit. Use Save settings to download a file.'},413);
  const reader=request.body?.getReader();if(!reader)return reply({error:'Missing settings request.'},400);
  let size=0,raw='';const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();return reply({error:'Settings exceed the 128 KB online backup limit. Use a local file.'},413);}raw+=decoder.decode(value,{stream:true});}
  raw+=decoder.decode();
  let input;try{input=JSON.parse(raw);}catch{return reply({error:'Invalid settings request.'},400);}
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),b=>b.toString(16).padStart(2,'0')).join('');
  if(!env.DB)throw Error('Database unavailable');
  if(input.action==='load'){
   const row=await env.DB.prepare('SELECT data, updated_at FROM settings_backups WHERE key_hash = ?').bind(hash).first<{data:string;updated_at:string}>();
   if(!row)return reply({error:'No saved settings found for this ID. Check the ID and try again.'},404);
   return reply({backup:JSON.parse(row.data),updatedAt:row.updated_at});
  }
  if(input.action!=='save')return reply({error:'Invalid action.'},400);
  let backup;try{backup=parseBackup(JSON.stringify(input.backup));}catch{return reply({error:'Invalid settings. Your online backup has not changed.'},400);}
  const updatedAt=new Date().toISOString();
  await env.DB.prepare('INSERT INTO settings_backups (key_hash, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(key_hash) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(hash,JSON.stringify(backup),updatedAt).run();
  return reply({ok:true,updatedAt});
 }catch{return reply({error:'Online settings are temporarily unavailable. Please try again.'},503);}
}
