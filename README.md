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

