const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');

export const withSlash = (path: string) => path.replace(/\/?$/, '/');

export function href(path = ''): string {
	return base + path.replace(/^\//, '');
}

export function isCurrent(pathname: string, path = ''): boolean {
	return withSlash(pathname) === withSlash(href(path));
}
