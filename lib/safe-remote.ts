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
 const response = await fetch(url, {signal: AbortSignal.timeout(timeoutMs), headers: {'User-Agent': 'Mynews reader (+https://runelord1999.github.io/mynews/)', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'}});
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
