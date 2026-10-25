import { createHash, createPrivateKey, type KeyObject } from 'node:crypto';

// DER header of a PKCS #8 Ed25519 private key; the 32-byte seed follows it.
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

export interface Ed25519Jwk {
	kty: 'OKP';
	crv: 'Ed25519';
	x: string;
	d: string;
}

// The key is stored as its base64url seed: one short line, easy to pipe into a secret store.
export function privateKeyFromSeed(seed: string): KeyObject {
	const raw = Buffer.from(seed.trim(), 'base64url');
	if (raw.length !== 32) throw new Error('WEB_BOT_AUTH_KEY must be a base64url Ed25519 seed (32 bytes)');
	return createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, raw]), format: 'der', type: 'pkcs8' });
}

export function jwkFromSeed(seed: string): Ed25519Jwk {
	const { x, d } = privateKeyFromSeed(seed).export({ format: 'jwk' });
	if (!x || !d) throw new Error('could not export Ed25519 key');
	return { kty: 'OKP', crv: 'Ed25519', x, d };
}

// RFC 7638 JWK thumbprint, which Web Bot Auth uses as the keyid.
export function keyId(jwk: Pick<Ed25519Jwk, 'x'>): string {
	return createHash('sha256').update(`{"crv":"Ed25519","kty":"OKP","x":"${jwk.x}"}`).digest('base64url');
}
