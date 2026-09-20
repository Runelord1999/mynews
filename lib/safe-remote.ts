import {safeUrl} from './news';

// Blocks the addresses a Worker should never be talked into fetching on a
// caller's behalf: loopback, link-local and the private IPv4 ranges.
const privateHost = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[|::)/i;
const privateRange = /^172\.(1[6-9]|2\d|3[01])\./;

export function publicHttpUrl(value: string) {
 const url = new URL(safeUrl(value));
 if (privateHost.test(url.hostname) || privateRange.test(url.hostname)) throw Error('Address must be public.');
 return url;
}

export async function readRemote(url: string, maxBytes = 1500000, timeoutMs = 12000) {
 let target=publicHttpUrl(url).href;
 const signal=AbortSignal.timeout(timeoutMs);
 let response:Response;
 for(let hop=0;;hop++){
  response=await fetch(target,{redirect:'manual',signal,headers:{'User-Agent':'Mynews reader (+https://runelord1999.github.io/mynews/)',Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}});
  if(![301,302,303,307,308].includes(response.status))break;
  await response.body?.cancel();
  const location=response.headers.get('Location');
  if(!location||hop>=3)throw Error('Too many redirects');
  target=publicHttpUrl(new URL(location,target).href).href;
 }
 if (!response.ok) throw Error('Unavailable');
 const reader = response.body?.getReader(); if (!reader) throw Error('Empty response');
 let size = 0, text = ''; const decoder = new TextDecoder();
 while (true) {
  const {done, value} = await reader.read(); if (done) break;
  size += value.length;
  if (size > maxBytes) {await reader.cancel(); break;}
  text += decoder.decode(value, {stream: true});
 }
 return text + decoder.decode();
}
