import type {NewsSite} from './news';
// The sites a fresh browser starts with, so opening the public URL gives the
// same set of publishers without restoring anything. Search links use the
// site-restricted search; a feed URL is only set where the publisher serves
// one on its own hostname.
export const starterSites:NewsSite[]=[
 {name:'Associated Press',url:'https://apnews.com/',searchUrl:'',feedUrl:''},
 {name:'Ars Technica',url:'https://arstechnica.com/',searchUrl:'',feedUrl:'https://arstechnica.com/feed/'},
 {name:'Futurism',url:'https://futurism.com/',searchUrl:'',feedUrl:'https://futurism.com/feed'},
 {name:'BBC',url:'https://www.bbc.co.uk/news',searchUrl:'',feedUrl:''},
 {name:'Reuters',url:'https://www.reuters.com/',searchUrl:'',feedUrl:''},
 {name:'Guardian',url:'https://www.theguardian.com/international',searchUrl:'',feedUrl:''},
 {name:'Aljazeera',url:'https://www.aljazeera.com/',searchUrl:'',feedUrl:''},
 {name:'CNA',url:'https://www.channelnewsasia.com/',searchUrl:'',feedUrl:''},
 {name:'CBC',url:'https://www.cbc.ca/news',searchUrl:'',feedUrl:''},
];
// Bumped whenever the list above changes, so existing browsers pick up
// additions once without losing sites they added or removed themselves.
export const starterSitesVersion=3;
