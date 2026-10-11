export type CatalogFormat = 'all' | 'manga' | 'manhwa';
export type ReadingStatus = 'reading' | 'planned' | 'completed' | 'on_hold' | 'dropped';
export const STATUS_LABELS: Record<ReadingStatus, string> = {
  reading: 'Reading', planned: 'Want to read', completed: 'Completed', on_hold: 'On hold', dropped: 'Dropped',
};
export const READING_STATUSES = Object.keys(STATUS_LABELS) as ReadingStatus[];
export interface Manga {
  id: number; title: string; originalTitle: string; imageUrl: string; type: string; synopsis: string;
  chapters: number | null; score: number | null; status: string; genres: string[]; authors: string[]; url: string;
}
export interface TrackerEntry {
  id: string; mangaId: number; title: string; imageUrl: string; format: string; totalChapters: number | null;
  status: ReadingStatus; progress: number; listId: string | null; createdAt: string; updatedAt: string;
}
export interface ReadingList { id: string; name: string; createdAt: string; }
export type EntryUpdate = Pick<TrackerEntry, 'progress' | 'status' | 'listId'>;

