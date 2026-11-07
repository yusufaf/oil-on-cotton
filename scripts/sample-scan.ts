// Prints the mean colour of a box on a Ridgway plate scan, for the cross-checks in data/ridgway.yaml.
// The mean is taken in linear light after converting the image to sRGB (embedded ICC if present).
// Usage: node scripts/sample-scan.ts <imageUrl> <x,y,w,h> [preview.png]
import sharp from 'sharp';

const HOSTS = ['digital.sciencehistory.org', 'archive.org'];
// Where those hosts redirect image downloads: archive.org to its ia*.archive.org servers, SHI to
// its CloudFront distribution.
const allowedAfterRedirect = (host: string) =>
	HOSTS.includes(host) || host.endsWith('.archive.org') || host === 'd3dkjx001zrum8.cloudfront.net';

const [url, boxArg, preview] = process.argv.slice(2);
if (!url || !boxArg) {
	console.error('Usage: node scripts/sample-scan.ts <imageUrl> <x,y,w,h> [preview.png]');
	process.exit(1);
}
if (!HOSTS.includes(new URL(url).hostname)) {
	console.error(`Refusing ${new URL(url).hostname}: scans come from ${HOSTS.join(' or ')} only`);
	process.exit(1);
}
const [left, top, width, height] = boxArg.split(',').map(Number);

const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
const finalHost = new URL(response.url).hostname;
if (!allowedAfterRedirect(finalHost)) throw new Error(`${url} redirected to ${finalHost}, which is not a scan host`);
const image = sharp(Buffer.from(await response.arrayBuffer()));
const meta = await image.metadata();
console.error(`${meta.width}x${meta.height} ${meta.format}, ${meta.icc ? 'embedded ICC' : 'no ICC, assumed sRGB'}`);

const box = image.extract({ left, top, width, height }).toColourspace('srgb').removeAlpha();
if (preview) await box.clone().png().toFile(preview);
const { data, info } = await box.raw().toBuffer({ resolveWithObject: true });

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const sums = [0, 0, 0];
for (let i = 0; i < data.length; i += info.channels) {
	for (let c = 0; c < 3; c++) sums[c] += toLinear(data[i + c] / 255);
}
const pixels = data.length / info.channels;
const hex = sums
	.map((s) => Math.round(toGamma(s / pixels) * 255).toString(16).padStart(2, '0'))
	.join('')
	.toUpperCase();
console.log(`#${hex}`);
