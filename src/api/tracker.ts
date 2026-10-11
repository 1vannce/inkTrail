import type { EntryUpdate, Manga, ReadingList, ReadingStatus, TrackerEntry } from '../types';
import { READING_STATUSES } from '../types';
import { ApiError, getErrorMessage, invalidResponse, record, requestJson } from './http';

export interface AddEntryInput { manga: Manga; status: ReadingStatus; progress: number; listId: string | null }
export interface UpdateEntryInput { entry: TrackerEntry; changes: EntryUpdate }

const queues = new Map<string, Promise<void>>();
function serialize<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  const done = next.then(() => {}, () => {});
  queues.set(key, done);
  void done.then(() => { if (queues.get(key) === done) queues.delete(key); });
  return next;
}

function nonempty(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0; }
function date(value: unknown): value is string { return nonempty(value) && Number.isFinite(Date.parse(value)); }
function status(value: unknown): value is ReadingStatus { return READING_STATUSES.includes(value as ReadingStatus); }

export function validateProgress(progress: number, totalChapters: number | null): number {
  if (!Number.isSafeInteger(progress) || progress < 0) {
    throw new ApiError('Enter a whole chapter number of zero or greater.', { code: 'VALIDATION' });
  }
  if (totalChapters !== null && progress > totalChapters) {
    throw new ApiError('Progress cannot exceed ' + totalChapters + ' chapters.', { code: 'VALIDATION' });
  }
  return progress;
}

export function parseEntry(value: unknown): TrackerEntry {
  const raw = record(value, 'Tracker entry');
  if (!nonempty(raw.id) || !Number.isSafeInteger(raw.mangaId) || Number(raw.mangaId) <= 0 ||
      !nonempty(raw.title) || typeof raw.imageUrl !== 'string' || !nonempty(raw.format) ||
      !(raw.totalChapters === null || (Number.isSafeInteger(raw.totalChapters) && Number(raw.totalChapters) >= 0)) ||
      !status(raw.status) || !Number.isSafeInteger(raw.progress) || Number(raw.progress) < 0 ||
      !(raw.listId === null || nonempty(raw.listId)) || !date(raw.createdAt) || !date(raw.updatedAt)) {
    return invalidResponse('Tracker entry');
  }
  if (raw.totalChapters !== null && Number(raw.progress) > Number(raw.totalChapters)) return invalidResponse('Tracker progress');
  return {
    id: raw.id, mangaId: Number(raw.mangaId), title: raw.title, imageUrl: raw.imageUrl,
    format: raw.format, totalChapters: raw.totalChapters as number | null, status: raw.status,
    progress: Number(raw.progress), listId: raw.listId as string | null,
    createdAt: raw.createdAt, updatedAt: raw.updatedAt,
  };
}

export function parseList(value: unknown): ReadingList {
  const raw = record(value, 'Reading list');
  if (!nonempty(raw.id) || !nonempty(raw.name) || !date(raw.createdAt)) return invalidResponse('Reading list');
  return { id: raw.id, name: raw.name, createdAt: raw.createdAt };
}

function listName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 50) throw new ApiError('Use a list name between 1 and 50 characters.', { code: 'VALIDATION' });
  return name;
}

function checkedBaseUrl(value: string): string {
  if (!value.trim()) throw new ApiError('Connect a tracker API before saving your library.', { code: 'NOT_CONFIGURED' });
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new ApiError('Use your HTTPS API base URL without query parameters.', { code: 'VALIDATION' });
  }
}

function sameEntry(saved: TrackerEntry, expected: Omit<TrackerEntry, 'id'>): TrackerEntry {
  const keys = Object.keys(expected) as (keyof Omit<TrackerEntry, 'id'>)[];
  if (keys.some(key => saved[key] !== expected[key])) {
    throw new ApiError('The API response did not confirm the requested changes. Refresh your library before retrying.', { code: 'INVALID_RESPONSE' });
  }
  return saved;
}

/** This adapter works with MockAPI and Beeceptor resources. No device storage is used. */
export function createTrackerApi(baseUrl: string) {
  function endpoint(path: string): string { return checkedBaseUrl(baseUrl) + path; }
  function resourceId(id: string): string {
    if (!nonempty(id)) throw new ApiError('The saved record ID is missing.', { code: 'VALIDATION' });
    return encodeURIComponent(id);
  }

  async function listEntries(signal?: AbortSignal): Promise<TrackerEntry[]> {
    const raw = await requestJson(endpoint('/entries'), { signal });
    if (!Array.isArray(raw)) return invalidResponse('Entries collection');
    const entries = raw.map(parseEntry);
    if (new Set(entries.map(item => item.id)).size !== entries.length) return invalidResponse('Entries collection IDs');
    return entries.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }
  async function listLists(signal?: AbortSignal): Promise<ReadingList[]> {
    const raw = await requestJson(endpoint('/lists'), { signal });
    if (!Array.isArray(raw)) return invalidResponse('Lists collection');
    const lists = raw.map(parseList);
    if (new Set(lists.map(item => item.id)).size !== lists.length) return invalidResponse('Lists collection IDs');
    return lists.sort((a, b) => a.name.localeCompare(b.name));
  }
  async function getEntry(id: string, signal?: AbortSignal): Promise<TrackerEntry> {
    const saved = parseEntry(await requestJson(endpoint('/entries/' + resourceId(id)), { signal }));
    if (saved.id !== id) return invalidResponse('Tracker entry ID');
    return saved;
  }
  async function getList(id: string): Promise<ReadingList> {
    const saved = parseList(await requestJson(endpoint('/lists/' + resourceId(id))));
    if (saved.id !== id) return invalidResponse('Reading list ID');
    return saved;
  }
  async function ensureList(id: string | null): Promise<void> {
    if (id !== null) await getList(id);
  }
  function validateChanges(changes: EntryUpdate, total: number | null): void {
    validateProgress(changes.progress, total);
    if (!status(changes.status)) throw new ApiError('Choose a valid reading status.', { code: 'VALIDATION' });
    if (!(changes.listId === null || nonempty(changes.listId))) throw new ApiError('Choose a valid reading list.', { code: 'VALIDATION' });
  }
  async function writeEntry(entry: TrackerEntry): Promise<TrackerEntry> {
    const saved = parseEntry(await requestJson(endpoint('/entries/' + resourceId(entry.id)), { method: 'PUT', body: entry }));
    if (saved.id !== entry.id) return invalidResponse('Updated entry ID');
    return sameEntry(saved, entry);
  }
  function addEntry(input: AddEntryInput): Promise<TrackerEntry> {
    return serialize(baseUrl, async () => {
      validateChanges(input, input.manga.chapters);
      if (!Number.isSafeInteger(input.manga.id) || input.manga.id <= 0 || !input.manga.title.trim()) {
        throw new ApiError('This catalog title cannot be saved.', { code: 'VALIDATION' });
      }
      const entries = await listEntries();
      if (entries.some(item => item.mangaId === input.manga.id)) {
        throw new ApiError('This title is already in your library. Open it to edit your progress.', { code: 'DUPLICATE' });
      }
      await ensureList(input.listId);
      const now = new Date().toISOString();
      const body: Omit<TrackerEntry, 'id'> = {
        mangaId: input.manga.id, title: input.manga.title, imageUrl: input.manga.imageUrl,
        format: input.manga.type, totalChapters: input.manga.chapters, status: input.status,
        progress: input.progress, listId: input.listId, createdAt: now, updatedAt: now,
      };
      return sameEntry(parseEntry(await requestJson(endpoint('/entries'), { method: 'POST', body })), body);
    });
  }
  function updateEntry({ entry, changes }: UpdateEntryInput): Promise<TrackerEntry> {
    return serialize(baseUrl, async () => {
      const current = await getEntry(entry.id);
      validateChanges(changes, current.totalChapters);
      if (changes.listId !== current.listId) await ensureList(changes.listId);
      return writeEntry({ ...current, ...changes, updatedAt: new Date().toISOString() });
    });
  }
  function removeEntry(id: string): Promise<void> {
    return serialize(baseUrl, async () => { await requestJson(endpoint('/entries/' + resourceId(id)), { method: 'DELETE' }); });
  }
  function addList(value: string): Promise<ReadingList> {
    return serialize(baseUrl, async () => {
      const name = listName(value);
      const lists = await listLists();
      if (lists.some(list => list.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new ApiError('A reading list with this name already exists.', { code: 'DUPLICATE' });
      }
      const saved = parseList(await requestJson(endpoint('/lists'), { method: 'POST', body: { name, createdAt: new Date().toISOString() } }));
      if (saved.name !== name) return invalidResponse('Created reading list');
      return saved;
    });
  }
  function renameList({ id, name: value }: { id: string; name: string }): Promise<ReadingList> {
    return serialize(baseUrl, async () => {
      const name = listName(value);
      const lists = await listLists();
      const current = lists.find(list => list.id === id);
      if (!current) throw new ApiError('This reading list no longer exists. Refresh your library.', { code: 'NOT_FOUND' });
      if (lists.some(list => list.id !== id && list.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        throw new ApiError('A reading list with this name already exists.', { code: 'DUPLICATE' });
      }
      const saved = parseList(await requestJson(endpoint('/lists/' + resourceId(id)), { method: 'PUT', body: { ...current, name } }));
      if (saved.id !== id || saved.name !== name) return invalidResponse('Updated reading list');
      return saved;
    });
  }
  function removeList(id: string): Promise<void> {
    return serialize(baseUrl, async () => {
      const entries = (await listEntries()).filter(entry => entry.listId === id);
      let detached = 0;
      try {
        for (const entry of entries) {
          await writeEntry({ ...entry, listId: null, updatedAt: new Date().toISOString() });
          detached += 1;
        }
      } catch (error) {
        throw new ApiError('The list was kept because not all titles could be unassigned. ' + detached + ' of ' + entries.length +
          ' titles were confirmed unassigned. Refresh before retrying. ' + getErrorMessage(error), { code: 'PARTIAL_FAILURE' });
      }
      try {
        await requestJson(endpoint('/lists/' + resourceId(id)), { method: 'DELETE' });
      } catch (error) {
        throw new ApiError('Titles were unassigned, but the list deletion could not be confirmed. Refresh before retrying. ' +
          getErrorMessage(error), { code: 'PARTIAL_FAILURE' });
      }
    });
  }
  return { listEntries, listLists, getEntry, addEntry, updateEntry, removeEntry, addList, renameList, removeList };
}

