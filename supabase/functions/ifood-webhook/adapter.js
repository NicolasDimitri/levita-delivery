import { Readable } from 'node:stream';
import { Buffer } from 'node:buffer';

/** @returns {Promise<Response>} */
export async function adaptWebhookRequest(request, handler) {
  const body = request.method === 'POST'
    ? Buffer.from(await request.arrayBuffer())
    : Buffer.alloc(0);
  const req = Readable.from([body]);
  req.method = request.method;
  req.headers = Object.fromEntries(request.headers);

  let response;
  const res = {
    status(code) {
      return {
        send(content) {
          response = new Response(content ?? null, { status: code });
          return response;
        }
      };
    }
  };

  await handler(req, res);
  if (!response) throw new Error('O webhook não retornou uma resposta');
  return response;
}
