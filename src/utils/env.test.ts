import * as os from 'node:os';
import { Request } from 'express';
import { envGet, envGetAppId, envGetAppName, envGetRequired, envIsProd, getCacheDir, isElfHostedInstance, isWorkersLikeRuntime, setRuntimeEnv } from './env';

describe('env', () => {
  test('envGet', () => {
    expect(envGet('NODE_ENV')).toBe('test');
  });

  test('runtime env overrides process env', () => {
    setRuntimeEnv({ NODE_ENV: 'runtime-test' });
    expect(envGet('NODE_ENV')).toBe('runtime-test');

    setRuntimeEnv({});
    expect(envGet('NODE_ENV')).toBe('test');
  });

  test('envGetRequired set', () => {
    expect(envGetRequired('NODE_ENV')).toBe('test');
  });

  test('envGetRequired not set', () => {
    expect(() => envGetRequired('NOT_SET')).toThrow('Environment variable "NOT_SET" is not configured.');
  });

  test('envGetAppId', () => {
    expect(envGetAppId()).toBe('webstreamr');

    process.env['MANIFEST_ID'] = 'webstreamr.dev';
    expect(envGetAppId()).toBe('webstreamr.dev');
    delete process.env['MANIFEST_ID'];
  });

  test('envGetAppName', () => {
    expect(envGetAppName()).toBe('WebStreamr');

    process.env['MANIFEST_NAME'] = 'WebStreamr | dev';
    expect(envGetAppName()).toBe('WebStreamr | dev');
    delete process.env['MANIFEST_NAME'];
  });

  test('envIsProd', () => {
    expect(envIsProd()).toBeFalsy();

    const previousNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    expect(envIsProd()).toBeTruthy();
    process.env['NODE_ENV'] = previousNodeEnv;
  });

  test('isElfHostedInstancce', () => {
    expect(isElfHostedInstance({ host: 'someuser.elfhosted.com' } as Request)).toBeTruthy();
    expect(isElfHostedInstance({ host: 'webstreamr.hayd.uk' } as Request)).toBeFalsy();
    expect(isElfHostedInstance('worker.elfhosted.com')).toBeTruthy();
  });

  test('isWorkersLikeRuntime', () => {
    const previousWebSocketPair = (globalThis as typeof globalThis & { WebSocketPair?: unknown }).WebSocketPair;

    delete (globalThis as typeof globalThis & { WebSocketPair?: unknown }).WebSocketPair;
    expect(isWorkersLikeRuntime()).toBeFalsy();

    (globalThis as typeof globalThis & { WebSocketPair?: unknown }).WebSocketPair = () => undefined;
    expect(isWorkersLikeRuntime()).toBeTruthy();

    if (previousWebSocketPair === undefined) {
      delete (globalThis as typeof globalThis & { WebSocketPair?: unknown }).WebSocketPair;
    } else {
      (globalThis as typeof globalThis & { WebSocketPair?: unknown }).WebSocketPair = previousWebSocketPair;
    }
  });

  test('getCacheDir', () => {
    const previousCacheDir = process.env['CACHE_DIR'];
    delete process.env['CACHE_DIR'];
    expect(getCacheDir()).toBe(os.tmpdir());
    process.env['CACHE_DIR'] = previousCacheDir;

    expect(getCacheDir()).toBe('/dev/null');
  });
});
