import type {NewsSite} from './news';
// The publishers this reader ships with are services now, listed in
// lib/news.ts, so a fresh library starts with no sites of its own. "Your sites"
// holds only what a reader adds.
export const starterSites:NewsSite[]=[];
// Bumped when the shipped set changes, so a browser adjusts once.
export const starterSitesVersion=4;
