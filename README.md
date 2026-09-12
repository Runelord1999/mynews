# Mynews

Public website: https://runelord1999.github.io/mynews/

Mynews is a personal news reader with topic tabs, live headlines and excerpts, bookmarks, and manually added URLs. It starts with Trump, Anthropic, OpenAI, Singularity, AGI, and AI Governance.

No account or ChatGPT sign-in is needed. Topics and saved articles are stored in this browser's local storage. They do not sync across devices or browsers; clearing site data removes them. Previously saved items on the private site are not copied automatically.

## Development

Requires Node 22.13+ and npm.

```sh
npm ci
npm run dev
npm run build:pages
npm run build
npx tsc --noEmit
node scripts/test-browser-library.mjs
```

GitHub Actions builds `web/` with `vite.pages.config.ts` and publishes `pages-dist/` to GitHub Pages on pushes to main. The shared React interface lives in `app/newsroom.tsx`.

The live Bing News RSS adapter runs on the existing Sites Worker. GitHub Pages requests its public `/api/feed` endpoint; it allows the GitHub Pages origin via CORS. The Pages website itself is static and requires no sign-in. The legacy authenticated library API remains protected and is not used by the public reader; older saved data stays private.

## Reading behavior

Comma-separated keywords are combined with OR. Feeds refresh on opening a topic or pressing Refresh news, with a five-minute feed cache. Articles open in a new tab at the original publisher URL. Pasted URLs use a headline and excerpt you enter yourself. Feed coverage and availability depend on Bing News. This reader is intended for personal, non-commercial use; it does not bypass paywalls or send notifications.

## Reading layout

The Text size slider (12–24px), A−/A+ buttons, and Reset control resize both article text and card widths. Smaller text fits more columns automatically; the grid fills the viewport without a maximum column count. The preference is remembered in this browser. On your radar is a compact horizontal topic strip instead of a sidebar.


## Settings backup

Use **Save settings** in the header to download a dated JSON file containing your topics, keyword lists, saved article URLs/titles/excerpts, and font size. Keep it in a folder on your local drive. Use **Restore settings** to choose that file after clearing browser data or on another device. A preview shows the counts and asks before replacing this browser's library. Invalid files are rejected without changing settings. Backups are handled locally in the browser, not uploaded. The browser controls the download destination.


## Website searches and news sources

Add a site saves a website URL with a name and optional native search URL containing {query}. Your Sites provides a direct site link, a keyword-search link, and a site filter for aggregated stories. Without a native search template, the search link opens Google restricted to that website. Selecting a topic supplies that topic's keywords; All stories supplies all topics. Saved sites are included in backups; older backups still restore successfully.

Sources supports Bing News, Google News RSS, Hacker News (Algolia), or all three. Google RSS may provide only a headline; Hacker News cards include discussion metadata when no excerpt exists. Google News article links may redirect to the publisher. Site filters use the news indexes and do not scrape or guarantee coverage of every page. Native-site search links open in a new tab. Search templates must use the same hostname as the saved site. Hacker News supports up to ten OR-separated terms per topic.

## Seven starter publisher sites

Mynews adds Reuters, Associated Press, BBC News, Ars Technica, MIT Technology Review, Science News, and Futurism as editable site searches. Together with the three aggregation services, a fresh browser shows ten entries. Existing custom sites are preserved and duplicate hostnames are skipped. This one-time addition respects later removals; restoring a backup preserves its exact website list.

The selection balances general reporting (Reuters, AP, BBC), technology reporting and analysis (Ars Technica, MIT Technology Review), science reporting (Science News), and emerging-technology coverage with perspective/opinion (Futurism). No outlet is infallible; commentary should be distinguished from reported evidence. These are publisher search targets, not seven new live-feed engines. Search results depend on the existing indexes.

Selection references:
- Reuters standards: https://reutersagency.com/about/standards-values/
- AP principles: https://www.ap.org/about/news-values-and-principles/
- BBC guidelines: https://www.bbc.com/editorialguidelines/
- Ars Technica editorial mission: https://arstechnica.com/about-us/
- MIT Technology Review mission and independence: https://files.technologyreview.com/magazine-archive/2012/MIT-Technology-Review-2012-11-sample.pdf
- Science News standards: https://www.sciencenews.org/about-science-news/journalism-standards-practices
- Futurism standards: https://futurism.com/editorial-standards
