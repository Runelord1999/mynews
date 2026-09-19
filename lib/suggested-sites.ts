import type {NewsSite,Audience} from './news';

// Candidate sources for the topics this reader is usually pointed at, chosen
// because they publish a feed rather than only being searchable. None of these
// is taken on trust: Add suggested sources reads each one through the Worker
// first and keeps only the ones that answer with a real feed.
export type SuggestedSite=NewsSite&{covers:string;audience:Audience};
export const suggestedSites:SuggestedSite[]=[
 {name:'ScienceDaily — Space & Time',url:'https://www.sciencedaily.com/news/space_time/',searchUrl:'',feedUrl:'https://www.sciencedaily.com/rss/space_time.xml',covers:'Space and astronomy',audience:'general'},
 {name:'ScienceDaily — Dinosaurs',url:'https://www.sciencedaily.com/news/fossils_ruins/dinosaurs/',searchUrl:'',feedUrl:'https://www.sciencedaily.com/rss/fossils_ruins/dinosaurs.xml',covers:'Dinosaurs and fossils',audience:'general'},
 {name:'ScienceDaily — Ancient Civilisations',url:'https://www.sciencedaily.com/news/fossils_ruins/ancient_civilizations/',searchUrl:'',feedUrl:'https://www.sciencedaily.com/rss/fossils_ruins/ancient_civilizations.xml',covers:'History and archaeology',audience:'general'},
 {name:'ScienceDaily — Artificial Intelligence',url:'https://www.sciencedaily.com/news/computers_math/artificial_intelligence/',searchUrl:'',feedUrl:'https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml',covers:'Artificial intelligence',audience:'general'},
 {name:'ScienceDaily — Robotics',url:'https://www.sciencedaily.com/news/matter_energy/robotics/',searchUrl:'',feedUrl:'https://www.sciencedaily.com/rss/matter_energy/robotics.xml',covers:'Robots',audience:'general'},
 {name:'ScienceDaily — Mind & Brain',url:'https://www.sciencedaily.com/news/mind_brain/',searchUrl:'',feedUrl:'https://www.sciencedaily.com/rss/mind_brain.xml',covers:'The brain and learning',audience:'general'},
 {name:'ScienceDaily — Plants & Animals',url:'https://www.sciencedaily.com/news/plants_animals/',searchUrl:'',feedUrl:'https://www.sciencedaily.com/rss/plants_animals.xml',covers:'Wildlife discoveries',audience:'general'},
 {name:'ScienceDaily — Earth & Climate',url:'https://www.sciencedaily.com/news/earth_climate/',searchUrl:'',feedUrl:'https://www.sciencedaily.com/rss/earth_climate.xml',covers:'Climate solutions, Oceans',audience:'general'},
 {name:'Phys.org',url:'https://phys.org/',searchUrl:'',feedUrl:'https://phys.org/rss-feed/',covers:'Everyday science',audience:'general'},
 {name:'Live Science',url:'https://www.livescience.com/',searchUrl:'',feedUrl:'https://www.livescience.com/feeds/all',covers:'Everyday science, Oceans',audience:'general'},
 {name:'BBC Science Focus',url:'https://www.sciencefocus.com/',searchUrl:'',feedUrl:'https://www.sciencefocus.com/feed',covers:'Everyday science',audience:'general'},
 {name:'MIT News',url:'https://news.mit.edu/',searchUrl:'',feedUrl:'https://news.mit.edu/rss/feed',covers:'Inventions, AI, Robots',audience:'general'},
 {name:'Hackaday',url:'https://hackaday.com/',searchUrl:'',feedUrl:'https://hackaday.com/feed/',covers:'Coding and DIY technology',audience:'teen'},
 {name:'Adafruit Blog',url:'https://blog.adafruit.com/',searchUrl:'',feedUrl:'https://blog.adafruit.com/feed/',covers:'Coding and DIY technology',audience:'teen'},
 {name:'Make: Magazine',url:'https://makezine.com/',searchUrl:'',feedUrl:'https://makezine.com/feed/',covers:'Coding and DIY technology',audience:'teen'},
 {name:'The Conversation — Science',url:'https://theconversation.com/uk/science',searchUrl:'',feedUrl:'https://theconversation.com/uk/science/articles.atom',covers:'Everyday science, Digital literacy',audience:'general'},
 {name:'ESA — Space Science',url:'https://www.esa.int/Science_Exploration',searchUrl:'',feedUrl:'https://www.esa.int/rssfeed/Our_Activities/Space_Science',covers:'Space and astronomy',audience:'teen'},
 {name:'Smithsonian Magazine',url:'https://www.smithsonianmag.com/',searchUrl:'',feedUrl:'https://www.smithsonianmag.com/rss/latest_articles/',covers:'History and archaeology, Wildlife',audience:'general'},
 {name:'Science News Explores',url:'https://www.snexplores.org/',searchUrl:'',feedUrl:'https://www.snexplores.org/feed',covers:'Everyday science, Space and astronomy',audience:'children'},
 {name:'Raspberry Pi Foundation',url:'https://www.raspberrypi.org/blog/',searchUrl:'',feedUrl:'https://www.raspberrypi.org/blog/feed/',covers:'Coding and DIY technology',audience:'children'},
];
