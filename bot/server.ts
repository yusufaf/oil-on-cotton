import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { DIRECTORY_PATH, directoryResponse } from './directory.ts';
import { jwkFromSeed, privateKeyFromSeed } from './key.ts';

const seed = process.env.WEB_BOT_AUTH_KEY ?? '';
const jwk = jwkFromSeed(seed);
const privateKey = privateKeyFromSeed(seed);
const about = readFileSync(new URL('./about.html', import.meta.url));

createServer((req, res) => {
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.writeHead(405, { allow: 'GET, HEAD' }).end();
		return;
	}
	const send = (status: number, headers: Record<string, string>, body: string | Buffer) =>
		res.writeHead(status, headers).end(req.method === 'HEAD' ? undefined : body);

	switch (new URL(req.url ?? '/', 'http://localhost').pathname) {
		case DIRECTORY_PATH: {
			const { headers, body } = directoryResponse(req.headers.host ?? '', jwk, privateKey);
			send(200, headers, body);
			break;
		}
		case '/':
			send(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'max-age=3600' }, about);
			break;
		case '/healthz':
			send(200, { 'content-type': 'text/plain' }, 'ok');
			break;
		default:
			send(404, { 'content-type': 'text/plain' }, 'not found');
	}
}).listen(Number(process.env.PORT ?? 8080));
