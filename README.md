# WebStreamr

[Stremio](https://www.stremio.com/) add-on which provides HTTP URLs from streaming websites.

## One-click deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/IHtDzenda/stremio-webstreamr-serverless)

or 

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/IHtDzenda/stremio-webstreamr-serverless&project-name=stremio-webstreamr-serverless&repository-name=stremio-webstreamr-serverless)

### ElfHosted (easy mode)

Self-hosting to stressful? ElfHosted offer [ready-to-go, turn-key WebStreamr instances](https://store.elfhosted.com/product/webstreamr/) with $1, 7-day trials. Additionally, 33% of your subscription directly supports your developer! ❤️

(*ElfHosted also offer advanced private hosting of the [top Stremio Addons](https://store.elfhosted.com/product-category/stremio-addons/elf/webstreamr/), as well as [turn-key bundles providing streaming from RealDebrid with Plex, Emby, or Jellyfin](https://store.elfhosted.com/product-category/streaming-bundles/elf/webstreamr/)*)


### Environment variables


#### `TMDB_ACCESS_TOKEN`

**Required**. TMDB access token to get information like title and year for content. Use the [API Read Access Token](https://www.themoviedb.org/settings/api).

### Cloudflare Workers

Cloudflare Workers is supported through [`wrangler.toml`](./wrangler.toml) and the [`src/worker.ts`](./src/worker.ts) entrypoint.

```shell
npm run deploy:cloudflare
```

Set `TMDB_ACCESS_TOKEN` as a Worker secret or variable before deployment.

Notes:

- The Workers runtime uses in-memory caches only. There is no persistent SQLite cache.

### Vercel

Vercel is supported through the catch-all API route in [`api/[[...route]].ts`](./api/[[...route]].ts) plus [`vercel.json`](./vercel.json).

```shell
npm run preview:vercel
```

Set `TMDB_ACCESS_TOKEN` in the Vercel project environment variables before deploying.
