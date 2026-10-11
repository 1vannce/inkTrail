import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTrackerApi } from '../api/tracker';
import { useConnection } from '../providers/ConnectionProvider';

function useTrackerApi() {
  const connection = useConnection();
  const api = useMemo(() => createTrackerApi(connection.baseUrl), [connection.baseUrl]);
  return { ...connection, api };
}

export function useEntries() {
  const { api, baseUrl, isReady, isConfigured } = useTrackerApi();
  return useQuery({
    queryKey: ['entries', baseUrl],
    queryFn: ({ signal }) => api.listEntries(signal),
    enabled: isReady && isConfigured,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function useLists() {
  const { api, baseUrl, isReady, isConfigured } = useTrackerApi();
  return useQuery({
    queryKey: ['lists', baseUrl],
    queryFn: ({ signal }) => api.listLists(signal),
    enabled: isReady && isConfigured,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/** Cache keys include the API URL, isolating separate tracker endpoints. */
export function useTrackerMutations() {
  const { api, baseUrl } = useTrackerApi();
  const queryClient = useQueryClient();
  const refreshEntries = () => queryClient.invalidateQueries({ queryKey: ['entries', baseUrl] });
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: ['lists', baseUrl] });
  const refreshAll = async () => { await Promise.all([refreshEntries(), refreshLists()]); };

  // Invalidate after failures too: a timeout or interrupted multi-step delete may have committed remotely.
  const addEntry = useMutation({ mutationFn: api.addEntry, onSettled: refreshEntries, retry: false });
  const updateEntry = useMutation({ mutationFn: api.updateEntry, onSettled: refreshEntries, retry: false });
  const removeEntry = useMutation({ mutationFn: api.removeEntry, onSettled: refreshEntries, retry: false });
  const addList = useMutation({ mutationFn: api.addList, onSettled: refreshLists, retry: false });
  const renameList = useMutation({ mutationFn: api.renameList, onSettled: refreshLists, retry: false });
  const removeList = useMutation({ mutationFn: api.removeList, onSettled: refreshAll, retry: false });

  return { addEntry, updateEntry, removeEntry, addList, renameList, removeList };
}

