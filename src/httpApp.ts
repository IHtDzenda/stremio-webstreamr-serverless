import { Mutex } from 'async-mutex';
import { ContentType } from 'stremio-addon-sdk';
import winston from 'winston';
import { BlockedError, logErrorAndReturnNiceString } from './error';
import { createExtractors, ExtractorRegistry } from './extractor';
import { landingTemplate } from './landingTemplate';
import { createSources, Source } from './source';
import { HomeCine } from './source/HomeCine';
import { MeineCloud } from './source/MeineCloud';
import { MostraGuarda } from './source/MostraGuarda';
import { Config, Context } from './types';
import { Fetcher } from './utils/Fetcher';
import { StreamResolver } from './utils/StreamResolver';
import { getDefaultConfig } from './utils/config';
import { buildManifest } from './utils/manifest';
import { envIsProd, isElfHostedInstance, setRuntimeEnv } from './utils/env';
import { Id, ImdbId, TmdbId } from './utils/id';

interface RuntimeEnv {
  [key: string]: string | undefined;
}

interface RuntimeState {
  extractorRegistry: ExtractorRegistry;
  extractors: ReturnType<typeof createExtractors>;
  fetcher: Fetcher;
  logger: winston.Logger;
  sources: ReturnType<typeof createSources>;
  streamResolver: StreamResolver;
}

let runtimeState: RuntimeState | undefined;
let runtimeStateKey: string | undefined;
let lastLiveProbeRequestsTimestamp = 0;

const streamLocks = new Map<string, Mutex>();

const createLogger = (): winston.Logger => winston.createLogger({
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.cli(),
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp, id }) => `${timestamp} ${level} ${id}: ${message}`),
      ),
    }),
  ],
});

const getEnvKey = (env: RuntimeEnv): string => JSON.stringify(Object.entries(env).sort(([a], [b]) => a.localeCompare(b)));

const getRuntimeState = (env: RuntimeEnv): RuntimeState => {
  setRuntimeEnv(env);

  const envKey = getEnvKey(env);
  if (runtimeState && runtimeStateKey === envKey) {
    return runtimeState;
  }

  const logger = createLogger();
  const fetcher = new Fetcher(logger);
  const sources = createSources(fetcher);
  const extractors = createExtractors(fetcher);
  const extractorRegistry = new ExtractorRegistry(logger, extractors);
  const streamResolver = new StreamResolver(logger, extractorRegistry);

  runtimeState = {
    extractorRegistry,
    extractors,
    fetcher,
    logger,
    sources,
    streamResolver,
  };
  runtimeStateKey = envKey;

  return runtimeState;
};

const parseConfig = (rawConfig: string | undefined): Config => {
  if (!rawConfig) {
    return getDefaultConfig();
  }

  return JSON.parse(decodeURIComponent(rawConfig)) as Config;
};

const buildContext = (request: Request, config: Config, requestId: string): Context => {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = request.headers.get('cf-connecting-ip')
    ?? forwardedFor?.split(',')[0]?.trim()
    ?? undefined;

  return {
    hostUrl: new URL(new URL(request.url).origin),
    id: requestId,
    ...(ip && { ip }),
    config,
  };
};

const withCommonHeaders = (response: Response, requestId: string): Response => {
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID', requestId);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Headers', '*');

  if (envIsProd() && !headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'max-age=10, public');
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const jsonResponse = (body: unknown, init?: ResponseInit): Response => new Response(JSON.stringify(body), {
  ...init,
  headers: {
    'Content-Type': 'application/json',
    ...(init?.headers ?? {}),
  },
});

const htmlResponse = (body: string, init?: ResponseInit): Response => new Response(body, {
  ...init,
  headers: {
    'Content-Type': 'text/html',
    ...(init?.headers ?? {}),
  },
});

const toId = (rawId: string): Id => {
  if (rawId.startsWith('tmdb:')) {
    return TmdbId.fromString(rawId.replace('tmdb:', ''));
  }

  if (rawId.startsWith('tt')) {
    return ImdbId.fromString(rawId);
  }

  throw new Error(`Unsupported ID: ${rawId}`);
};

const getMutex = (key: string): Mutex => {
  let mutex = streamLocks.get(key);
  if (!mutex) {
    mutex = new Mutex();
    streamLocks.set(key, mutex);
  }

  return mutex;
};

export const handleHttpRequest = async (request: Request, env: RuntimeEnv = {}): Promise<Response> => {
  const requestId = crypto.randomUUID();

  try {
    if (request.method === 'OPTIONS') {
      return withCommonHeaders(new Response(null, { status: 204 }), requestId);
    }

    const runtime = getRuntimeState(env);
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(Boolean);

    if (url.pathname === '/') {
      return withCommonHeaders(Response.redirect(new URL('/configure', url), 302), requestId);
    }

    if (url.pathname === '/startup' || url.pathname === '/ready') {
      return withCommonHeaders(jsonResponse({ status: 'ok' }), requestId);
    }

    if (url.pathname === '/stats') {
      return withCommonHeaders(jsonResponse({
        extractorRegistry: runtime.extractorRegistry.stats(),
        fetcher: runtime.fetcher.stats(),
        sources: Source.stats(),
      }), requestId);
    }

    if (url.pathname === '/live') {
      const ctx = buildContext(request, getDefaultConfig(), requestId);
      const liveSources: Source[] = [
        new HomeCine(runtime.fetcher),
        new MeineCloud(runtime.fetcher),
        new MostraGuarda(runtime.fetcher),
      ];

      const hrefs = [
        ...liveSources.map(source => source.baseUrl),
        'https://cloudnestra.com',
      ];

      const results = new Map<string, string>();
      let blockedCount = 0;
      let errorCount = 0;

      if (Date.now() - lastLiveProbeRequestsTimestamp > 60000 || url.searchParams.has('force')) {
        await Promise.all(hrefs.map(async (href) => {
          const targetUrl = new URL(href);

          try {
            await runtime.fetcher.head(ctx, targetUrl, { noCache: true });
            results.set(targetUrl.host, 'ok');
          } catch (error) {
            if (error instanceof BlockedError) {
              results.set(targetUrl.host, 'blocked');
              blockedCount++;
            } else {
              results.set(targetUrl.host, 'error');
              errorCount++;
            }

            logErrorAndReturnNiceString(ctx, runtime.logger, href, error);
          }
        }));

        lastLiveProbeRequestsTimestamp = Date.now();
      }

      const details = Object.fromEntries(results);
      if (blockedCount > 0) {
        runtime.logger.warn('IP might be not clean and leading to blocking.', ctx);
        return withCommonHeaders(jsonResponse({ status: 'ok', details }), requestId);
      }

      if (errorCount === liveSources.length) {
        return withCommonHeaders(jsonResponse({ status: 'error', details }, { status: 503 }), requestId);
      }

      return withCommonHeaders(jsonResponse({ status: 'ok', ipStatus: 'ok', details }), requestId);
    }

    if (
      (pathSegments.length === 1 && pathSegments[0] === 'configure')
      || (pathSegments.length === 2 && pathSegments[1] === 'configure')
    ) {
      const config = parseConfig(pathSegments.length === 2 ? pathSegments[0] : undefined);
      if (pathSegments.length === 1 && isElfHostedInstance(url.host)) {
        config.mediaFlowProxyUrl = `${url.protocol}//${url.host.replace('webstreamr', 'mediaflow-proxy')}`;
      }

      const manifest = buildManifest(runtime.sources, runtime.extractors, config);
      return withCommonHeaders(htmlResponse(landingTemplate(manifest)), requestId);
    }

    if (
      (pathSegments.length === 1 && pathSegments[0] === 'manifest.json')
      || (pathSegments.length === 2 && pathSegments[1] === 'manifest.json')
    ) {
      const config = parseConfig(pathSegments.length === 2 ? pathSegments[0] : undefined);
      const manifest = buildManifest(runtime.sources, runtime.extractors, config);

      return withCommonHeaders(jsonResponse(manifest), requestId);
    }

    const isStreamRoute = (
      (pathSegments.length === 3 && pathSegments[0] === 'stream')
      || (pathSegments.length === 4 && pathSegments[1] === 'stream')
    );

    if (isStreamRoute) {
      const config = parseConfig(pathSegments.length === 4 ? pathSegments[0] : undefined);
      const typeSegmentIndex = pathSegments.length === 4 ? 2 : 1;
      const idSegmentIndex = pathSegments.length === 4 ? 3 : 2;
      const type = (pathSegments[typeSegmentIndex] || '') as ContentType;
      const rawId = (pathSegments[idSegmentIndex] || '').replace(/\.json$/, '');
      const id = toId(rawId);
      const ctx = buildContext(request, config, requestId);

      runtime.logger.info(`Search stream for type "${type}" and id "${rawId}" for ip ${ctx.ip}`, ctx);

      const enabledSources = runtime.sources.filter(source => source.countryCodes.filter(countryCode => countryCode in ctx.config).length);
      const mutex = getMutex(rawId);

      let ttl: number | undefined;
      let streams;

      await mutex.runExclusive(async () => {
        const result = await runtime.streamResolver.resolve(ctx, enabledSources, type, id);
        ttl = result.ttl;
        streams = result.streams;
      });

      if (!mutex.isLocked()) {
        streamLocks.delete(rawId);
      }

      const headers: HeadersInit = {};
      if (ttl && envIsProd()) {
        headers['Cache-Control'] = `max-age=${Math.floor(ttl / 1000)}, public`;
      }

      return withCommonHeaders(jsonResponse({ streams }, { headers }), requestId);
    }

    return withCommonHeaders(jsonResponse({ error: 'Not found' }, { status: 404 }), requestId);
  } catch (error) {
    const runtime = getRuntimeState(env);
    runtime.logger.error(`Unhandled request error: ${error}, cause: ${(error as Error & { cause?: unknown }).cause}, stack: ${(error as Error).stack}`);

    return withCommonHeaders(jsonResponse({
      error: 'Internal server error',
      requestId,
    }, { status: 500 }), requestId);
  }
};
