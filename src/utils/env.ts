import * as os from 'node:os';

type RuntimeEnv = Record<string, string | undefined>;

let runtimeEnv: RuntimeEnv = {};

export const setRuntimeEnv = (env: RuntimeEnv): void => {
  runtimeEnv = { ...env };
};

export const envGet = (name: string): string | undefined => runtimeEnv[name] ?? process.env[name];

export const envGetRequired = (name: string): string => {
  const value = envGet(name);
  if (!value) {
    throw new Error(`Environment variable "${name}" is not configured.`);
  }

  return value;
};

export const envGetAppId = (): string => envGet('MANIFEST_ID') || 'webstreamr';

export const envGetAppName = (): string => envGet('MANIFEST_NAME') || 'WebStreamr';

export const envIsProd = (): boolean => envGet('NODE_ENV') === 'production';

export const isElfHostedInstance = (hostOrRequest: string | { host: string }): boolean => {
  const host = typeof hostOrRequest === 'string' ? hostOrRequest : hostOrRequest.host;

  return host.endsWith('elfhosted.com');
};

export const isWorkersLikeRuntime = (): boolean => typeof (globalThis as typeof globalThis & { WebSocketPair?: unknown }).WebSocketPair === 'function';

export const getCacheDir = (): string => envGet('CACHE_DIR') ?? os.tmpdir();
