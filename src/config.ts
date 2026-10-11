export const CONNECTION_STORAGE_KEY = '@inktrail/connection-url';
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('Enter a complete HTTPS endpoint URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTPS base URL without credentials, query parameters, or a fragment.');
  }
  if (url.pathname.endsWith('/entries') || url.pathname.endsWith('/lists')) {
    throw new Error('Use the base URL, without /entries or /lists at the end.');
  }
  return trimmed;
}

