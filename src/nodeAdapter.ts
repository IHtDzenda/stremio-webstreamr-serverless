import { Readable } from 'node:stream';
import { IncomingMessage, ServerResponse } from 'node:http';

const buildRequestUrl = (req: IncomingMessage, pathnameOverride?: string): string => {
  const protocol = req.headers['x-forwarded-proto'] ?? 'http';
  const host = req.headers.host ?? 'localhost';
  const reqUrl = new URL(req.url ?? '/', `${protocol}://${host}`);
  const pathname = pathnameOverride ?? reqUrl.pathname;

  return `${protocol}://${host}${pathname}${reqUrl.search}`;
};

export const toWebRequest = (req: IncomingMessage, pathnameOverride?: string): Request => {
  const method = req.method ?? 'GET';
  const headers = new Headers();

  Object.entries(req.headers).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(item => headers.append(key, item));
      return;
    }

    headers.set(key, value);
  });

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
  };

  if (!['GET', 'HEAD'].includes(method)) {
    init.body = Readable.toWeb(req) as BodyInit;
    init.duplex = 'half';
  }

  return new Request(buildRequestUrl(req, pathnameOverride), init);
};

export const sendWebResponse = async (res: ServerResponse, response: Response): Promise<void> => {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;

  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
};
