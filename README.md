# Mynews

A personal news aggregation website with an editorial front page, topic tabs, live headlines and short excerpts, and a saved reading list.

## Features

- Starts with Trump, Anthropic, OpenAI, Singularity, AGI, and AI Governance.
- Create, edit, and remove thematic keyword lists. Comma-separated keywords match with OR.
- Fetch current Bing News RSS results on opening a topic or refreshing (five-minute response cache).
- Open each article at its original URL in a new browser tab.
- Bookmark feed stories or paste any HTTP(S) article URL with your own headline and excerpt.
- Persist personal topics and articles in Cloudflare D1, scoped to the signed-in user.
- Responsive layout with keyboard-accessible dialogs, topic tabs, and topic selection.

## Run locally

Requires Node 22.13+ and npm.

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_easy_the_renegades.sql
npm run dev
```

Open the local URL printed by the server. The portable preview simulates sign-in only on loopback: click **Sign in to save**. Its local database is separate from production. The private hosted site uses ChatGPT sign-in.

## Checks

```sh
npx tsc --noEmit
node scripts/test-news.mjs
npm run build
```

The integration test requires the local development server and initialized database. It creates and cleans up its own test article and restores the original topics.

## Hosting

This is a full-stack Vinext/React application targeting Cloudflare Workers, managed through Sites. `.openai/hosting.json` identifies the Site and logical D1 binding. Generated schema migrations live in `drizzle/`. GitHub stores source; GitHub Pages alone cannot run the server endpoints or database. Keep the hosted Site private for personal reading. Never commit credentials or local database files.

## Feed behavior and limits

Bing News RSS supplies headlines and excerpts for personal, non-commercial aggregation. Feed availability and coverage depend on the provider. Mynews does not generate AI summaries or bypass publisher paywalls. Manual URLs are saved with user-entered titles/excerpts; arbitrary pages are not scraped. Keyword results refresh while using the website; there are no email or push notifications. Overlapping topic results are deduplicated by original URL on the front page.
