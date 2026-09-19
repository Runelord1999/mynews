# Mynews

Public website: https://runelord1999.github.io/mynews/

Mynews is a personal content aggregator with topic tabs, live headlines and excerpts, bookmarks, and manually added URLs. It starts with Trump, Anthropic, OpenAI, Singularity, AGI, and AI Governance.

No account or sign-in is needed. Topics and saved articles are stored in this browser's local storage; clearing site data removes them. Save Settings Online copies them to the server under a Settings ID so another browser or device can pick them up.

## Development

Requires Node 22.13+ and npm.

```sh
npm ci
npm run dev          # the reader on Vite
npm run dev:worker   # the API on Wrangler
npm run build:pages
npx tsc --noEmit
npm run lint
npm test
```

GitHub Actions builds `web/` with `vite.pages.config.ts` and publishes `pages-dist/` to GitHub Pages on pushes to main. The React interface lives in `app/newsroom.tsx`; the API lives in `worker/`.

## Architecture

GitHub Pages serves static files only, so the reader cannot host an API itself. Two pieces make up the website, and nothing else:

- **The reader** — `web/` bundled by `vite.pages.config.ts` into `pages-dist/`, published to GitHub Pages. Topics, saved articles, sites and text size live in this browser's local storage.
- **The API** — `worker/index.ts`, a standalone Cloudflare Worker serving `/api/feed` (live headlines) and `/api/settings` (online backups, backed by D1). Browsers cannot fetch the Bing, Google News or Hacker News endpoints directly because those responses carry no CORS headers, so this Worker is required even for reading news.

`MYNEWS_API_BASE` at build time decides which API origin the reader calls. The GitHub Pages workflow reads it from the `MYNEWS_API_BASE` repository variable. Unset, the build falls back to the previous private host so an unconfigured deploy keeps working.

The Worker allows the GitHub Pages origin via CORS and varies on `Origin`, so cached feed responses are never shared across origins. Nothing in the reader requires an account or a sign-in.

## Deploying the API

```sh
npx wrangler login
npm run db:apply        # creates the settings table in the mynews-db D1 database
npm run deploy:worker   # publishes mynews-api
```

The published reader points at `https://mynews-api.darylysm.workers.dev` by default, so no further configuration is needed. To send it somewhere else — a custom domain, or a second Worker — set the repository variable `MYNEWS_API_BASE` (Settings → Secrets and variables → Actions → Variables) to that origin and re-run the Pages workflow. The default is built in rather than left to a variable so a deploy that forgets one cannot silently send settings to another server.

Run `npm test` for all five suites. The last one drives a real page: it starts the reader on port 5180 and checks in a browser that a disabled news service stops being requested, that a stale feed cache is not shown, and that removed sources stay removed across a reload. It uses `playwright-core` with whatever Chromium, Chrome or Edge is already installed rather than downloading a browser; set `MYNEWS_BROWSER` to an executable if none is found. `npm run test:browser` runs just that suite.

## Reading behavior

Comma-separated keywords are combined with OR. **Stories are fetched only when you ask for them.** Pressing **Refresh news** searches every topic; reopening the tab restores the last edition from this browser rather than searching again, and the toolbar shows when it was last refreshed. Topic tabs filter the stored edition without hitting the network. A source selection with nothing stored yet fetches once, then waits for you. The stored edition keeps the two hundred newest stories for each of the four most recent source selections. Articles open in a new tab at the original publisher URL. Pasted URLs use a headline and excerpt you enter yourself. Feed coverage and availability depend on Bing News. This reader is intended for personal, non-commercial use; it does not bypass paywalls or send notifications.

## Reading layout

The Text size slider (12–24px), A−/A+ buttons, and Reset control resize both article text and card widths. **Hide excerpt**, beside Refresh news, drops the body text from every card and leaves the headline and its source line, so the cards collapse to a fraction of their height and far more of them fit on screen. Press it again to bring the text back. The choice is remembered in this browser, alongside the collapsed-section states, rather than travelling in a settings backup. Read more is hidden while excerpts are, since there is nothing on the card for it to expand into.

An info icon beside Reset says what it touches: the text size only, back to 16px. Topics, source sites, the reading list, the saved Settings ID and the stored headlines are unaffected. Smaller text fits more columns automatically; the grid fills the viewport without a maximum column count. The preference is remembered in this browser. On your radar is a compact topic strip instead of a sidebar. It wraps onto as many lines as it needs, like Your Search Source Sites, so every topic is reachable without dragging a strip sideways.


## Settings backup

One **Save Settings** button in the masthead opens a dialog that both saves and restores, offering the same two destinations for each.

### Online

Settings are stored on the server under a **Settings ID** — readable words, not a secret. `Create new ID` suggests one like `quiet-harbor-4f2a`, or type your own (3–40 characters, letters, numbers, hyphens and underscores, case-insensitive). **Settings ID Owner Name** records who created the ID; it is required to save online and is fixed at first save, so a later save by someone else does not rewrite it.

**Save online** stores the current settings under that ID. If the ID already holds settings, the save is refused and the dialog names who saved them and when, with Replace them and Cancel; nothing is written until Replace is pressed. **Restore from online** fetches whatever is stored there and asks before replacing this browser's library. IDs are meant to be shared like a playlist link — anyone holding one can apply the setup, and can also overwrite it. Online settings are capped at 128 KB and rate limited per IP address. Nothing about the visitor is stored: no IP address, no user agent, no device details.

Online saving needs to reach the API Worker. On a managed corporate machine that request may be blocked by the network, which is why the masthead says so and why the file option exists.

### To a file

**Save to a file** downloads a dated JSON file containing topics, keyword lists, saved article URLs, titles and excerpts, source sites and font size. **Restore from a file** reads one back. Both run entirely in the browser with no network at all, so they work anywhere. A preview shows the counts and asks before replacing this browser's library, and invalid files are rejected without changing anything.

### Master Admin

Master Admin has no button of its own. The word **EDITION** in "YOUR PERSONAL EDITION", top left, is the trigger: it looks like ordinary text and opens the panel when clicked.

The panel lists every Settings ID with its owner, creation time, last save and save count. IDs can be renamed, owner names corrected, and entries deleted.

It is open by default — no password. Hiding the trigger keeps it out of the way of ordinary readers, but the published page is public JavaScript, so anyone who reads it can call `/api/admin` directly and list, rename or delete entries. That is an accepted trade-off while the stored settings are search preferences that do not matter if lost.

To turn on a key check later, set the secret and redeploy:

```sh
npm run secret:admin
npm run deploy:worker
```

The Worker then refuses admin requests without the key, and the panel shows a key field on its own. Remove it again with `npx wrangler secret delete ADMIN_KEY --config worker/wrangler.toml`. No page change is needed either way.


## Website searches and news sources

Add a site saves a website URL with a name, an optional native search URL containing {query}, and an optional full-text feed URL. Added sites appear under Your sites in the Sources menu. Your Sites provides a direct site link, a keyword-search link, and a site filter for aggregated stories. Without a native search template, the search link opens Google restricted to that website. Selecting a topic supplies that topic's keywords; All stories supplies all topics. Saved sites are included in backups; older backups still restore successfully.

### Full-text feeds and article summaries

A saved site can carry a **Full-text feed URL** — an RSS or Atom address on the same website. When a publisher puts the whole article in its feed, cards show up to **250 words** of it instead of a one-line teaser. Publishers that syndicate only a teaser still show the teaser; there is no way to widen what a feed does not contain, and nothing is scraped from the article page.

Feeds are read by the Worker, which checks the address before fetching: same host as the saved site, a public address, and http or https only. Articles from a feed are filtered by the selected topic's keywords, matched against the headline and body, because a publisher feed carries whatever was posted rather than a search result. Feeds are queried when Sources is set to all.

Card body text sits below the reading size and scrolls within the card, so a long summary does not stretch the grid. The text size slider still scales it.

### Read more

Cards outside the reading list carry a **Read more** button. It asks the Worker to read that one article and return up to 250 words of it, then shows that in place of the teaser. Nothing is fetched until a reader presses it, so a refresh stays as fast as before.

The Worker validates the address the same way it validates a feed — public address, http or https only — reads at most 600 KB, drops scripts, navigation, headers, footers and asides, prefers the page's `<article>` or `<main>` element, and keeps the paragraphs. Pages with too little readable text fall back to their own meta description, and a page that returns nothing usable reports that rather than showing an empty card.

Each result is stored in `article_summaries` keyed by a hash of the URL, so the second reader to open the same link gets it instantly and the publisher is not asked twice. Paywalled and bot-blocked publishers will fail; that is reported on the button and the card keeps its original teaser.

**Sources** lists everything a story can come from — Bing News, Google News RSS, Hacker News (Algolia), and every saved site — and any combination can be selected at once. The selection is remembered in this browser.

A site with a full-text feed is read directly from that feed. A site without one is searched through the selected news services restricted to its hostname, so selecting it narrows rather than replaces. Selecting only sites and no services searches them through all three. Clearing the selection entirely fetches nothing and says so.

The site chips under Your Search Source Sites toggle the same selection, so a site can be switched on or off without opening the menu. Google RSS may provide only a headline; Hacker News cards include discussion metadata when no excerpt exists. Google News article links may redirect to the publisher. Site filters use the news indexes and do not scrape or guarantee coverage of every page. Native-site search links open in a new tab. Search templates must use the same hostname as the saved site. Hacker News supports up to ten OR-separated terms per topic.

## Sources

Twelve sources ship with the reader and appear under **News services**: Bing News, Google News RSS and Hacker News (Algolia), plus Associated Press, Ars Technica, Futurism, BBC, Reuters, Guardian, Aljazeera, CNA and CBC. They need no setup, are the same for everyone, and are all selected to begin with — so sharing the URL shares the sources, and a shared Settings ID carries no site list at all.

The services list folds away from its own heading, in both the Sources menu and the All sites dialog, so twelve built-in rows stop pushing saved websites and the add form off screen. The heading keeps showing how many are in use while it is folded, and the choice is remembered in this browser.

**Your sites** holds only websites a reader adds themselves, and starts empty. A library that stored the shipped publishers before they became services drops those copies once, so nothing is listed twice; sites the reader added are kept.

Any combination can be selected at once, and the selection is remembered in this browser. Ars Technica and Futurism carry a full-text feed and are read directly from it. The rest are searched through the selected news indexes restricted to their hostnames — all of them in a single `site:a OR site:b` query per index, so selecting twelve sources costs no more requests than selecting three. Selecting only websites that have no full-text feed, with no search service enabled, fetches nothing: there is no index to run the search. The notice says so and offers a button that turns the services back on. Enabling a service does not widen the results — they still come only from the websites selected, because the service is the index rather than a source of stories. Clearing the selection entirely fetches nothing and says so.

A feed address may live on any public host, since publishers routinely serve theirs from a separate one. **Find feed** asks the website where its feed is: it reads the page's `<link rel="alternate">` declarations, falls back to a bounded set of common paths, and fills the field in. **Test feed**, beside the field, reads the address through the Worker and says what came back: how many articles the feed holds, and how many of them match the current topic keywords. A feed that cannot be read and a feed that reads fine but matches nothing look identical on the page, and this tells them apart before the site is saved.

Site searches name the bare hostname, so `https://www.example.com/section` is searched as `site:example.com` and pages served without the `www.` prefix are not missed. A genuine subdomain such as `kids.example.com` is kept.

Selection references:
- Reuters standards: https://reutersagency.com/about/standards-values/
- AP principles: https://www.ap.org/about/news-values-and-principles/
- BBC guidelines: https://www.bbc.com/editorialguidelines/
- Ars Technica editorial mission: https://arstechnica.com/about-us/
- MIT Technology Review mission and independence: https://files.technologyreview.com/magazine-archive/2012/MIT-Technology-Review-2012-11-sample.pdf
- Science News standards: https://www.sciencenews.org/about-science-news/journalism-standards-practices
- Futurism standards: https://futurism.com/editorial-standards
