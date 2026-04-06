import { handleHttpRequest } from './httpApp';

export default {
  async fetch(request: Request, env: Record<string, string | undefined>): Promise<Response> {
    return await handleHttpRequest(request, env);
  },
};
