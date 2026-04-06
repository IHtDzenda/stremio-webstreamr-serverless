import { Readable } from 'node:stream';
import { IncomingMessage, ServerResponse } from 'node:http';

const buildRequestUrl = (req: IncomingMessage): string => {
  const protocol = req.headers['x-forwarded-proto'] ?? 'https';
  const host = req.headers.host ?? 'localhost';

  return `${protocol}://${host}${req.url ?? '/'}`;
};

export const toWebRequest = (req: IncomingMessage): Request => {
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

  return new Request(buildRequestUrl(req), init);
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
