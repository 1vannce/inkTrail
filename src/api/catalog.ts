import type { CatalogFormat, Manga } from '../types';
import { ApiError, abortError, invalidResponse, record, requestJson, wait } from './http';

export const CATALOG_BASE_URL = 'https://kitsu.app/api/edge';
export type CatalogCursor = { manga: number | null; manhwa: number | null };
export interface CatalogPage {
  items: Manga[];
  hasNextPage: boolean;
  nextPage: CatalogCursor | undefined;
}

const PAGE_SIZE = 12;
let lastRequestStarted = 0;
let catalogQueue: Promise<void> = Promise.resolve();

/** Courtesy pacing; this is an app choice, not a claimed Kitsu service limit. */
function paceCatalog(signal?: AbortSignal): Promise<void> {
  const turn = catalogQueue.catch(() => {}).then(async () => {
    if (signal?.aborted) throw abortError();
    await wait(Math.max(0, 1050 - (Date.now() - lastRequestStarted)), signal);
    lastRequestStarted = Date.now();
  });
  catalogQueue = turn.catch(() => {});
  return turn;
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function webUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? value : '';
  } catch { return ''; }
}

function categoryNames(raw: Record<string, unknown>, included: unknown[]): string[] {
  const relationships = optionalRecord(raw.relationships);
  const categories = optionalRecord(relationships.categories);
  const ids = new Set(Array.isArray(categories.data)
    ? categories.data.map(item => optionalRecord(item).id).filter(id => typeof id === 'string')
    : []);
  return included.flatMap(item => {
    const related = optionalRecord(item);
    const attributes = optionalRecord(related.attributes);
    return related.type === 'categories' && typeof related.id === 'string' && ids.has(related.id) && typeof attributes.title === 'string'
      ? [attributes.title] : [];
  });
}

/** IDs are exclusively Kitsu IDs. No MyAnimeList IDs are mixed into saved entries. */
export function normalizeManga(value: unknown, included: unknown[] = []): Manga {
  const raw = record(value, 'Catalog title');
  const attributes = record(raw.attributes, 'Catalog title attributes');
  const id = typeof raw.id === 'string' && /^\d+$/.test(raw.id) ? Number(raw.id) : NaN;
  if (!Number.isSafeInteger(id) || id <= 0 || raw.type !== 'manga' ||
      typeof attributes.canonicalTitle !== 'string' || !attributes.canonicalTitle.trim()) {
    return invalidResponse('Catalog title');
  }
  const titles = optionalRecord(attributes.titles);
  const poster = optionalRecord(attributes.posterImage);
  const subtype = text(attributes.subtype, 'manga');
  const score = typeof attributes.averageRating === 'string' && attributes.averageRating.trim()
    ? Number(attributes.averageRating) : typeof attributes.averageRating === 'number' ? attributes.averageRating : NaN;
  const publicationStatus = text(attributes.status);
  const statuses: Record<string, string> = { current: 'Publishing', finished: 'Finished', tba: 'To be announced', unreleased: 'Upcoming', upcoming: 'Upcoming' };
  return {
    id,
    title: text(titles.en).trim() || text(titles.en_us).trim() || attributes.canonicalTitle,
    originalTitle: (subtype === 'manhwa' ? text(titles.ko_kr) : text(titles.ja_jp)) || attributes.canonicalTitle,
    imageUrl: webUrl(poster.large) || webUrl(poster.medium) || webUrl(poster.original),
    type: subtype.charAt(0).toUpperCase() + subtype.slice(1),
    synopsis: text(attributes.synopsis).trim(),
    chapters: typeof attributes.chapterCount === 'number' && Number.isInteger(attributes.chapterCount) && attributes.chapterCount > 0
      ? attributes.chapterCount : null,
    score: Number.isFinite(score) && score >= 0 && score <= 100 ? score / 10 : null,
    status: statuses[publicationStatus] ?? (publicationStatus || 'Unknown'),
    genres: categoryNames(raw, included),
    authors: [],
    url: 'https://kitsu.app/manga/' + (text(attributes.slug) ? encodeURIComponent(text(attributes.slug)) : id),
  };
}

function normalizedTitle(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

function searchRank(title: string, query: string): number {
  const normalized = normalizedTitle(title);
  if (normalized === query) return 0;
  if (normalized.startsWith(query)) return 1;
  if (normalized.includes(query)) return 2;
  return 3;
}


interface CatalogSlice { items: { manga: Manga; members: number }[]; hasNext: boolean }

async function getSlice(query: string, format: 'manga' | 'manhwa', page: number, signal?: AbortSignal): Promise<CatalogSlice> {
  const params = new URLSearchParams({
    'filter[subtype]': format, 'page[offset]': String((page - 1) * PAGE_SIZE),
    'page[limit]': String(PAGE_SIZE), include: 'categories',
  });
  if (query.trim()) params.set('filter[text]', query.trim());
  else params.set('sort', '-userCount');
  const raw = record(await requestJson(CATALOG_BASE_URL + '/manga?' + params, {
    signal, beforeAttempt: paceCatalog, accept: 'application/vnd.api+json',
  }), 'Catalog response');
  const links = record(raw.links, 'Catalog pagination');
  if (!Array.isArray(raw.data) || !(links.next === undefined || links.next === null || typeof links.next === 'string')) {
    return invalidResponse('Catalog response');
  }
  const included = Array.isArray(raw.included) ? raw.included : [];
  return {
    items: raw.data.map(item => {
      const object = record(item, 'Catalog title');
      const attributes = record(object.attributes, 'Catalog title attributes');
      return { manga: normalizeManga(object, included), members: typeof attributes.userCount === 'number' ? attributes.userCount : 0 };
    }),
    hasNext: typeof links.next === 'string' && links.next.length > 0,
  };
}

/** Each format keeps its own page cursor so an exhausted result set is never re-requested. */
export async function getCatalog(query: string, format: CatalogFormat, cursor: CatalogCursor = { manga: 1, manhwa: 1 }, signal?: AbortSignal): Promise<CatalogPage> {
  const formats: ('manga' | 'manhwa')[] = format === 'all' ? ['manga', 'manhwa'] : [format];
  const results = await Promise.all(formats.map(async kind => {
    const page = cursor[kind];
    return { kind, page, result: page === null ? null : await getSlice(query, kind, page, signal) };
  }));
  const next: CatalogCursor = { manga: null, manhwa: null };
  const combined = results.flatMap(({ kind, page, result }) => {
    if (result?.hasNext && page !== null) next[kind] = page + 1;
    return result?.items ?? [];
  });
  if (!query.trim()) combined.sort((a, b) => b.members - a.members);
  else {
    const search = normalizedTitle(query);
    // Stable sorting preserves each service result's order within the same match rank.
    combined.sort((a, b) => searchRank(a.manga.title, search) - searchRank(b.manga.title, search));
  }
  const seen = new Set<number>();
  const items = combined.flatMap(({ manga }) => {
    if (seen.has(manga.id)) return [];
    seen.add(manga.id);
    return [manga];
  });
  const hasNextPage = next.manga !== null || next.manhwa !== null;
  return { items, hasNextPage, nextPage: hasNextPage ? next : undefined };
}

export async function getTitle(id: number, signal?: AbortSignal): Promise<Manga> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new ApiError('This title ID is invalid.', { code: 'VALIDATION' });
  const response = record(await requestJson(CATALOG_BASE_URL + '/manga/' + id + '?include=categories', {
    signal, beforeAttempt: paceCatalog, accept: 'application/vnd.api+json',
  }), 'Title response');
  const manga = normalizeManga(response.data, Array.isArray(response.included) ? response.included : []);
  if (manga.id !== id) return invalidResponse('Title response');
  return manga;
}



