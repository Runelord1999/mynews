import type {NewsSite} from './news';
// Search links use the existing site-restricted search and news-index adapter.
// These publishers are not additional feed engines.
export const starterSites:NewsSite[]=[
 {name:'Reuters',url:'https://www.reuters.com/',searchUrl:''},
 {name:'Associated Press',url:'https://apnews.com/',searchUrl:''},
 {name:'BBC News',url:'https://www.bbc.com/news',searchUrl:''},
 {name:'Ars Technica',url:'https://arstechnica.com/',searchUrl:''},
 {name:'MIT Technology Review',url:'https://www.technologyreview.com/',searchUrl:''},
 {name:'Science News',url:'https://www.sciencenews.org/',searchUrl:''},
 {name:'Futurism',url:'https://futurism.com/',searchUrl:''},
];
