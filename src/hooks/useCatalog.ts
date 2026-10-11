import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getCatalog, getTitle, type CatalogCursor } from '../api/catalog';
import type { CatalogFormat } from '../types';

export function useCatalog(query: string, format: CatalogFormat) {
  const search = query.trim();
  return useInfiniteQuery({
    queryKey: ['catalog', 'kitsu', search, format],
    initialPageParam: { manga: 1, manhwa: 1 } as CatalogCursor,
    queryFn: ({ pageParam, signal }) => getCatalog(search, format, pageParam, signal),
    getNextPageParam: lastPage => lastPage.nextPage,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useTitle(id: number) {
  return useQuery({
    queryKey: ['title', 'kitsu', id],
    queryFn: ({ signal }) => getTitle(id, signal),
    staleTime: 30 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}


