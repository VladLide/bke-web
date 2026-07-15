# BKE Web

The web app for the **Bible Knowledge Engine** — an interactive map, timeline,
and knowledge graph. It is a **pure static client**: it holds no data and no
compiler. All content is fetched at runtime from the BKE **data API**, which is
published from a separate repository.

**Live:** https://vladlide.github.io/bke-web/
**Data API:** https://vladlide.github.io/bible-knowledge-engine/v1/
**Engine & data:** https://github.com/VladLide/bible-knowledge-engine

## Why separate repos

The canonical data + compiler live in
[`bible-knowledge-engine`](https://github.com/VladLide/bible-knowledge-engine)
and publish a versioned, CORS-enabled JSON API. This app is just one consumer of
that API — third parties can build their own clients against the same URLs. The
split keeps the data reusable on its own and lets the app and the data evolve and
deploy independently.

## How it loads

`config.js` sets `BKE_DATA_BASE` (the data API base URL) and `bkeLoad()` reads
`manifest.json` first, then fetches the artifacts it lists (timeline era chunks,
graph, geometry, labels). Point it elsewhere for local development:

```
# serve this folder, then open with a data override:
python3 -m http.server 8000
# http://localhost:8000/index.html?data=<base>
```

## Structure

```
index.html  graph.html      the two views (map/timeline, knowledge graph)
app.js  graph.js            view logic; both consume precompiled state — never
                            re-interpret events
config.js                  data source + manifest loader
style.css                  shared styles
vendor/                    pinned Leaflet + vis-network (no CDN at runtime)
```
