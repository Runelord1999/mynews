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
npm test
```

GitHub Actions builds `web/` with `vite.pages.config.ts` and publishes `pages-dist/` to GitHub Pages on pushes to main. The shared React interface lives in `app/newsroom.tsx`.

## Architecture

GitHub Pages serves static files only, so the reader cannot host an API itself. Two pieces make up the public website:

- **The reader** — `web/` bundled by `vite.pages.config.ts` into `pages-dist/`, published to GitHub Pages. Topics, saved articles, sites and text size live in this browser's local storage.
- **The API** — `worker/index.ts`, a standalone Cloudflare Worker serving `/api/feed` (live headlines) and `/api/settings` (online backups, backed by D1). Browsers cannot fetch the Bing, Google News or Hacker News endpoints directly because those responses carry no CORS headers, so this Worker is required even for reading news.

`MYNEWS_API_BASE` at build time decides which API origin the reader calls. The GitHub Pages workflow reads it from the `MYNEWS_API_BASE` repository variable. Unset, the build falls back to the previous private host so an unconfigured deploy keeps working.

The Worker allows the GitHub Pages origin via CORS and varies on `Origin`, so cached feed responses are never shared across origins. The legacy authenticated library API (`app/api/library/route.ts`, ChatGPT sign-in) is used only by the private Next site and is not part of the public reader.

## Deploying the API

```sh
npx wrangler login
npm run db:apply        # creates the settings tables in the mynews-db D1 database
npm run secret:admin    # sets ADMIN_KEY, the Master Admin password
npm run deploy:worker   # publishes mynews-api
```

Then set the repository variable `MYNEWS_API_BASE` (Settings → Secrets and variables → Actions → Variables) to the deployed Worker origin, for example `https://mynews-api.<your-subdomain>.workers.dev`, and re-run the Pages workflow.

Run `npm test` to exercise the Worker's routing, CORS, settings sharing, access trail and admin flow without deploying.

## Reading behavior

Comma-separated keywords are combined with OR. Feeds refresh on opening a topic or pressing Refresh news, with a five-minute feed cache. Articles open in a new tab at the original publisher URL. Pasted URLs use a headline and excerpt you enter yourself. Feed coverage and availability depend on Bing News. This reader is intended for personal, non-commercial use; it does not bypass paywalls or send notifications.

## Reading layout

The Text size slider (12–24px), A−/A+ buttons, and Reset control resize both article text and card widths. Smaller text fits more columns automatically; the grid fills the viewport without a maximum column count. The preference is remembered in this browser. On your radar is a compact horizontal topic strip instead of a sidebar.


## Settings backup

### Online settings

**Online settings** stores your topics, source sites, reading list and text size on the server under a **Settings ID**. IDs are readable words, not secrets: `Create new ID` suggests one like `quiet-harbor-4f2a`, and you can type your own (3–40 characters, letters, numbers, hyphens and underscores, case-insensitive).

- **Save online** writes the current settings under that ID and confirms what was saved.
- **Apply settings** fetches whatever is stored under the ID you typed and asks before replacing this browser's library.

IDs are meant to be shared, like a playlist link — anyone with the ID can apply the same setup. The same ID is also the write key, so anyone holding it can overwrite what is stored there. Pick a distinctive ID for anything you want to keep, and treat a shared ID as shared in both directions. Online settings are capped at 128 KB and rate limited per IP address.

### Master Admin

**Master Admin** lists every Settings ID on the server with its creation time, last save, save count, and the IP address, approximate location, browser and device summary last seen using it, plus a capped trail of the twenty most recent events per ID. IDs can be renamed (the access trail follows) or deleted.

Access is enforced by the Worker, not the page: the panel sends the key you type to `/api/admin`, which compares it against the `ADMIN_KEY` secret. With no secret set, every admin request is refused. The published page contains no key — a static site cannot hide one, so this is the only way the check can be real.

Device details come from what a browser volunteers — platform, screen size, timezone, language, core count, memory class. Real hardware identifiers (serial numbers, hostnames, MAC addresses) are not available to any website. IP addresses and browser details are personal data under the PDPA and GDPR: tell people you are collecting it, and delete IDs you no longer need.

### Local file backup

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
