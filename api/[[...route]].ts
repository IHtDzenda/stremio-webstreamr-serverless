import { IncomingMessage, ServerResponse } from 'node:http';
import { handleHttpRequest } from '../src/httpApp';
import { sendWebResponse, toWebRequest } from '../src/nodeAdapter';

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const response = await handleHttpRequest(toWebRequest(req), process.env as Record<string, string | undefined>);

  await sendWebResponse(res, response);
}
