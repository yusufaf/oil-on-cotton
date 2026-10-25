import { sign, type KeyObject } from 'node:crypto';
import { keyId, type Ed25519Jwk } from './key.ts';

export const DIRECTORY_PATH = '/.well-known/http-message-signatures-directory';
export const DIRECTORY_TYPE = 'application/http-message-signatures-directory+json';

const LIFETIME_SECONDS = 24 * 60 * 60;

// The directory response is itself signed by every key it lists, over the authority the
// client asked for (draft-ietf-webbotauth-httpsig-protocol, key directory section).
export function directoryResponse(authority: string, jwk: Ed25519Jwk, privateKey: KeyObject, now = new Date()) {
	const created = Math.floor(now.getTime() / 1000);
	const params =
		`("@authority";req);alg="ed25519";keyid="${keyId(jwk)}";` +
		`tag="http-message-signatures-directory";created=${created};expires=${created + LIFETIME_SECONDS}`;
	const base = `"@authority";req: ${authority.toLowerCase()}\n"@signature-params": ${params}`;
	const signature = sign(null, Buffer.from(base), privateKey).toString('base64');

	return {
		body: JSON.stringify({ keys: [{ kty: jwk.kty, crv: jwk.crv, x: jwk.x }] }),
		headers: {
			'content-type': DIRECTORY_TYPE,
			'cache-control': 'max-age=3600',
			'signature-input': `sig1=${params}`,
			signature: `sig1=:${signature}:`,
		},
	};
}
