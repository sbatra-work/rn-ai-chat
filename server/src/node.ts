/**
 * Node entry point for local development: `npm run server`.
 *
 * Node's http module predates the web Request and Response types, so this
 * file translates between the two. It holds no chat logic.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { buildApp } from './build.ts';

function toRequest(req: IncomingMessage, signal: AbortSignal): Request {
  const url = `http://${req.headers.host ?? 'localhost'}${req.url ?? '/'}`;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method,
    headers,
    signal,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : undefined,
    // Required by Node when the body is a stream.
    ...(hasBody ? { duplex: 'half' } : {}),
  } as RequestInit);
}

async function sendResponse(response: Response, res: ServerResponse): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  res.on('close', () => void reader.cancel().catch(() => {}));
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No .env file. Defaults give fake mode, which needs no settings.
}

const { handler, mode } = buildApp(process.env);
const port = Number(process.env.PORT ?? 8787);

createServer((req, res) => {
  // Abort the handler when the client disconnects, so a cancelled chat
  // also stops the upstream model call.
  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) abort.abort();
  });

  handler(toRequest(req, abort.signal))
    .then((response) => sendResponse(response, res))
    .catch((error: unknown) => {
      console.error('[server]', error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
}).listen(port, () => {
  console.log(`Chat server listening on http://localhost:${port} (mode: ${mode})`);
});
