// Prints a new base64url Ed25519 seed on stdout, for piping straight into secret stores.
// The public key id goes to stderr so it can be checked against the published directory.
import { generateKeyPairSync } from 'node:crypto';
import { keyId } from '../bot/key.ts';

const { privateKey } = generateKeyPairSync('ed25519');
const { d, x } = privateKey.export({ format: 'jwk' });
if (!d || !x) throw new Error('could not export Ed25519 key');
console.error(`keyid ${keyId({ x })}`);
process.stdout.write(d);
