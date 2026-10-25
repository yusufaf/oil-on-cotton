const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

export function href(path = ''): string {
	return base + path.replace(/^\//, '');
}
