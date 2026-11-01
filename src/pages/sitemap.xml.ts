import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { href } from '../lib/paths';
import { roomMuseums } from '../lib/room';
import { HALL_PAGES } from '../lib/site';

export const GET: APIRoute = async ({ site }) => {
	const museums = (await getCollection('museums')).map((e) => e.data);
	const items = (await getCollection('catalog')).map((e) => e.data);
	const paths = [...HALL_PAGES, ...roomMuseums(museums, items).map((m) => `rooms/${m.id}/`)];
	const urls = paths.map((path) => `\t<url><loc>${new URL(href(path), site).href}</loc></url>`);
	const xml = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
		...urls,
		'</urlset>',
		'',
	].join('\n');
	return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};
