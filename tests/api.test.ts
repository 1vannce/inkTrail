/// <reference types="node" />
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { getCatalog, getTitle, normalizeManga } from '../src/api/catalog';
import { ApiError, requestJson } from '../src/api/http';
import { createTrackerApi, parseEntry, validateProgress } from '../src/api/tracker';
import type { Manga, TrackerEntry } from '../src/types';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const baseUrl = 'https://tracker.example.test/api/v1';
const manga: Manga = {
  id: 42, title: 'Test manga', originalTitle: 'Test manga', imageUrl: 'https://example.test/cover.jpg',
  type: 'Manga', synopsis: 'Example', chapters: 10, score: 8, status: 'Finished',
  genres: ['Adventure'], authors: [], url: 'https://kitsu.app/manga/42',
};
const entry: TrackerEntry = {
  id: 'e1', mangaId: 42, title: manga.title, imageUrl: manga.imageUrl, format: 'Manga',
  totalChapters: 10, status: 'reading', progress: 2, listId: null,
  createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z',
};
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }

test('chapter validation accepts unknown totals and rejects invalid or overflowing progress', () => {
  assert.equal(validateProgress(500, null), 500);
  assert.equal(validateProgress(0, 10), 0);
  for (const value of [-1, 1.5, NaN, Infinity, 11]) assert.throws(() => validateProgress(value, 10), ApiError);
  assert.throws(() => parseEntry({ ...entry, progress: 11 }), /invalid fields/);
});

test('Kitsu normalization handles nullable metadata, ratings and only linked categories', () => {
  const normalized = normalizeManga({
    id: '7', type: 'manga',
    attributes: { canonicalTitle: 'Title', chapterCount: null, averageRating: null, synopsis: null, posterImage: null },
    relationships: { categories: { data: [{ type: 'categories', id: '1' }] } },
  }, [
    { id: '1', type: 'categories', attributes: { title: 'Adventure' } },
    { id: '2', type: 'categories', attributes: { title: 'Unrelated category' } },
  ]);
  assert.equal(normalized.chapters, null);
  assert.equal(normalized.score, null);
  assert.equal(normalized.imageUrl, '');
  assert.equal(normalized.title, 'Title');
  assert.deepEqual(normalized.genres, ['Adventure']);
  assert.equal(normalizeManga({ id: '7', type: 'manga', attributes: { canonicalTitle: 'Title', averageRating: '84.5' } }).score, 8.45);
  assert.throws(() => normalizeManga({ type: 'manga', attributes: { canonicalTitle: 'Missing ID' } }), /invalid fields/);
});

test('catalog uses separate manga/manhwa offsets and Kitsu JSON:API request headers', async () => {
  const requests: URL[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push(url);
    assert.equal(new Headers(init?.headers).get('accept'), 'application/vnd.api+json');
    const isManga = url.searchParams.get('filter[subtype]') === 'manga';
    return json({
      data: [{
        id: isManga ? '1' : '2', type: 'manga',
        attributes: { canonicalTitle: isManga ? 'Manga' : 'Manhwa', subtype: isManga ? 'manga' : 'manhwa', userCount: isManga ? 10 : 20 },
      }],
      links: { next: isManga ? 'https://kitsu.app/api/edge/manga?page%5Boffset%5D=12' : null },
    });
  };
  const first = await getCatalog('', 'all');
  assert.deepEqual(first.items.map(item => item.id), [2, 1]);
  assert.deepEqual(first.nextPage, { manga: 2, manhwa: null });
  await getCatalog('', 'all', first.nextPage);
  assert.equal(requests.length, 3);
  assert.deepEqual(requests.map(url => url.searchParams.get('filter[subtype]')), ['manga', 'manhwa', 'manga']);
  assert.equal(requests[2]!.searchParams.get('page[offset]'), '12');
  for (const url of requests) {
    assert.equal(url.origin, 'https://kitsu.app');
    assert.equal(url.pathname, '/api/edge/manga');
    assert.equal(url.searchParams.get('include'), 'categories');
    assert.equal(url.searchParams.get('sort'), '-userCount');
  }
  await getCatalog('solo', 'manhwa');
  assert.equal(requests[3]!.searchParams.get('filter[text]'), 'solo');
  assert.equal(requests[3]!.searchParams.has('sort'), false);
});

test('merged search ranks exact, prefix and contained titles ahead of unrelated API results', async () => {
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    const isManga = url.searchParams.get('filter[subtype]') === 'manga';
    const titles = isManga
      ? [['1', 'Unrelated first'], ['3', 'Solo Leveling Stories'], ['4', 'The Solo Leveling Story'], ['5', 'Unrelated second']]
      : [['2', 'Solo Leveling'], ['6', 'Another result']];
    return json({
      data: titles.map(([id, title]) => ({
        id, type: 'manga', attributes: { canonicalTitle: title, subtype: isManga ? 'manga' : 'manhwa' },
      })),
      links: { next: null },
    });
  };
  const page = await getCatalog('  SOLO    leveling  ', 'all');
  assert.deepEqual(page.items.map(item => item.id), [2, 3, 4, 1, 5, 6]);
});


test('title details use Kitsu numeric IDs and category includes', async () => {
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/api/edge/manga/54114');
    assert.equal(url.searchParams.get('include'), 'categories');
    assert.equal(new Headers(init?.headers).get('accept'), 'application/vnd.api+json');
    return json({ data: {
      id: '54114', type: 'manga',
      attributes: { canonicalTitle: 'Solo Leveling', subtype: 'manhwa', averageRating: '84.5', chapterCount: 201 },
    } });
  };
  const title = await getTitle(54114);
  assert.equal(title.id, 54114);
  assert.equal(title.type, 'Manhwa');
  assert.equal(title.chapters, 201);
  assert.equal(title.score, 8.45);
});


test('entry and list CRUD use remote GET/POST/PUT/DELETE; list deletion preserves saved titles', async () => {
  const records = new Map<string, Map<string, Record<string, unknown>>>([['entries', new Map()], ['lists', new Map()]]);
  const calls: { method: string; path: string; body: Record<string, unknown> | undefined }[] = [];
  let sequence = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://tracker.example.test');
    const [resource, id] = url.pathname.slice('/api/v1/'.length).split('/');
    const collection = records.get(resource!)!;
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, body });
    if (method === 'GET') return json(id ? collection.get(id) : [...collection.values()]);
    assert.equal(new Headers(init?.headers).get('content-type'), method === 'DELETE' ? null : 'application/json');
    if (method === 'POST') {
      const saved = { ...body, id: String(++sequence) }; collection.set(saved.id, saved); return json(saved, 201);
    }
    if (method === 'PUT') { const saved = { ...body, id }; collection.set(id!, saved); return json(saved); }
    if (method === 'DELETE') { collection.delete(id!); return new Response(null, { status: 204 }); }
    throw new Error('Unexpected method');
  };
  const api = createTrackerApi(baseUrl + '/');
  const list = await api.addList('Favorites');
  const saved = await api.addEntry({ manga, status: 'reading', progress: 2, listId: list.id });
  assert.equal((await api.listEntries())[0]!.id, saved.id);
  const updated = await api.updateEntry({ entry: saved, changes: { progress: 7, status: 'on_hold', listId: list.id } });
  assert.equal(updated.progress, 7);
  assert.equal(updated.status, 'on_hold');
  await api.renameList({ id: list.id, name: 'Weekend' });
  assert.equal((await api.listLists())[0]!.name, 'Weekend');
  await api.removeList(list.id);
  const survivors = await api.listEntries();
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0]!.listId, null);
  assert.equal(survivors[0]!.progress, 7);
  assert.deepEqual(await api.listLists(), []);
  const listDeleteIndex = calls.findIndex(call => call.method === 'DELETE' && call.path.endsWith('/lists/' + list.id));
  assert.equal(calls[listDeleteIndex - 1]!.method, 'PUT');
  assert.equal(calls[listDeleteIndex - 1]!.body?.listId, null);
  await api.removeEntry(saved.id);
  assert.deepEqual(await api.listEntries(), []);
});

test('duplicate entries are checked from the remote collection before posting', async () => {
  const methods: string[] = [];
  globalThis.fetch = async (_input, init) => { methods.push(init?.method ?? 'GET'); return json([entry]); };
  await assert.rejects(createTrackerApi(baseUrl).addEntry({ manga, status: 'reading', progress: 0, listId: null }), /already in your library/);
  assert.deepEqual(methods, ['GET']);
});

test('invalid progress is rejected before any network request', async () => {
  globalThis.fetch = async () => { assert.fail('Unexpected request'); };
  await assert.rejects(createTrackerApi(baseUrl).addEntry({ manga, status: 'reading', progress: 11, listId: null }), /cannot exceed/);
});

test('malformed successful responses and unconfigured endpoints fail honestly', async () => {
  globalThis.fetch = async () => json({ message: 'Static mock, not a resource collection' });
  await assert.rejects(createTrackerApi(baseUrl).listEntries(), /unexpected shape|invalid fields/);
  await assert.rejects(createTrackerApi('').listEntries(), /Connect a tracker API/);
  globalThis.fetch = async () => new Response('<html>Not JSON</html>', { status: 200 });
  await assert.rejects(requestJson(baseUrl), /invalid JSON/);
});

test('a failed list detach keeps the list and reports partial completion', async () => {
  const methods: string[] = [];
  const second = { ...entry, id: 'e2', mangaId: 43, listId: 'list1' };
  globalThis.fetch = async (_input, init) => {
    const method = init?.method ?? 'GET'; methods.push(method);
    if (method === 'GET') return json([{ ...entry, listId: 'list1' }, second]);
    if (methods.length === 2) return json(JSON.parse(String(init?.body)));
    return json({ message: 'Unavailable' }, 503);
  };
  await assert.rejects(createTrackerApi(baseUrl).removeList('list1'), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.code, 'PARTIAL_FAILURE');
    assert.match(error.message, /1 of 2/);
    return true;
  });
  assert.deepEqual(methods, ['GET', 'PUT', 'PUT']);
});

test('write failures are never retried even when retries are requested', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return json({ message: 'Unavailable' }, 503); };
  await assert.rejects(requestJson(baseUrl, { method: 'POST', body: {}, retries: 9 }), /Unavailable/);
  assert.equal(calls, 1);
});

test('GET retries one temporary failure but does not retry 404', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return calls === 1 ? json({}, 503) : json([]); };
  assert.deepEqual(await requestJson(baseUrl), []);
  assert.equal(calls, 2);
  calls = 0;
  globalThis.fetch = async () => { calls += 1; return json({}, 404); };
  await assert.rejects(requestJson(baseUrl), /HTTP 404/);
  assert.equal(calls, 1);
});

test('timeout aborts the request and explains uncertain writes', async () => {
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(requestJson(baseUrl, { method: 'POST', body: {}, timeoutMs: 5 }), /may have been saved/);
});

test('a caller cancellation stays distinguishable from a network error', async () => {
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = async () => { assert.fail('Cancelled request should not be sent'); };
  await assert.rejects(requestJson(baseUrl, { signal: controller.signal }), error => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'AbortError');
    return true;
  });
});





