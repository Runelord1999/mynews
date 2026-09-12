import type {NewsSite} from './news';
// Search links use the existing site-restricted search and news-index adapter.
// These publishers are not additional feed engines.
export const starterSites:NewsSite[]=[
 {name:'Associated Press',url:'https://apnews.com/',searchUrl:''},
 {name:'Ars Technica',url:'https://arstechnica.com/',searchUrl:''},
 {name:'Futurism',url:'https://futurism.com/',searchUrl:''},
];
