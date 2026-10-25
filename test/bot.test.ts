import { generateKeyPairSync } from 'node:crypto';
import { component, verifySignature } from 'http-message-sig';
import { describe, expect, it } from 'vitest';
import { jwkToKeyID } from 'web-bot-auth';
import { verifierFromJWK } from 'web-bot-auth/crypto';
import { DIRECTORY_TYPE, directoryResponse } from '../bot/directory';
import { jwkFromSeed, keyId, privateKeyFromSeed } from '../bot/key';

const seed = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' }).d!;
const jwk = jwkFromSeed(seed);

describe('bot key', () => {
	it('derives the same key id as web-bot-auth', async () => {
		expect(keyId(jwk)).toBe(await jwkToKeyID({ kty: 'OKP', crv: 'Ed25519', x: jwk.x }, sha256, base64url));
	});

	it('rejects a seed of the wrong length', () => {
		expect(() => jwkFromSeed('abc')).toThrow(/32 bytes/);
	});
});

describe('key directory', () => {
	const now = new Date('2026-10-25T12:00:00Z');
	const { headers, body } = directoryResponse('Bot.OilOnCotton.com', jwk, privateKeyFromSeed(seed), now);

	it('publishes only the public key, with the directory media type', () => {
		expect(headers['content-type']).toBe(DIRECTORY_TYPE);
		expect(JSON.parse(body)).toEqual({ keys: [{ kty: 'OKP', crv: 'Ed25519', x: jwk.x }] });
		expect(body).not.toContain(jwk.d);
	});

	it('is signed over the request authority with the directory tag', async () => {
		const verifier = await verifierFromJWK({ kty: 'OKP', crv: 'Ed25519', x: jwk.x });
		const request = {
			kind: 'request' as const,
			method: 'GET',
			targetUri: 'https://bot.oiloncotton.com/.well-known/http-message-signatures-directory',
			fields: [],
		};
		const response = {
			kind: 'response' as const,
			status: 200,
			request,
			fields: Object.entries(headers).map(([name, value]) => ({ name, value })),
		};
		const verified = await verifySignature(response, {
			policy: {
				algorithms: ['ed25519'],
				requiredComponents: [component('@authority', { req: true })],
				requiredParameters: ['created', 'expires', 'keyid', 'tag'],
				now: now.getTime() / 1000,
			},
			resolveVerifier: () => verifier,
		});
		expect(verified.parameters.tag).toBe('http-message-signatures-directory');
		expect(verified.parameters.keyid).toBe(keyId(jwk));
	});
});

async function sha256(data: BufferSource): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', data);
}

function base64url(buffer: ArrayBuffer): string {
	return Buffer.from(buffer).toString('base64url');
}
