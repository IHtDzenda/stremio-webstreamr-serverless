import { IncomingMessage, ServerResponse } from 'node:http';
import { handleHttpRequest } from '../src/httpApp';
import { sendWebResponse, toWebRequest } from '../src/nodeAdapter';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const route = reqUrl.searchParams.get('route') ?? '';
  reqUrl.searchParams.delete('route');

  const pathname = route ? `/${route}` : '/';
  req.url = `${pathname}${reqUrl.search}`;

  const response = await handleHttpRequest(toWebRequest(req, pathname), process.env as Record<string, string | undefined>);

  await sendWebResponse(res, response);
}
