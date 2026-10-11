import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button, Chip, Cover, IconButton, Notice, PageHeader, SectionHeading } from '../components/ui';
import { colors } from '../theme';
import { useConnection } from '../providers/ConnectionProvider';
import { useEntries, useLists, useTrackerMutations } from '../hooks/useTracker';
import { getErrorMessage } from '../api/http';
import { READING_STATUSES, STATUS_LABELS, type ReadingStatus, type TrackerEntry } from '../types';

export default function LibraryScreen() {
  const connection = useConnection();
  const entries = useEntries();
  const lists = useLists();
  const actions = useTrackerMutations();
  const [status, setStatus] = useState<ReadingStatus | 'all'>('all');
  const [listId, setListId] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<TrackerEntry | null>(null);
  const [progress, setProgress] = useState('');
  const [editStatus, setEditStatus] = useState<ReadingStatus>('reading');
  const [editList, setEditList] = useState<string | null>(null);
  const [manageLists, setManageLists] = useState(false);
  const [listName, setListName] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ kind: 'entry' | 'list'; id: string; title: string } | null>(null);
  const [modalError, setModalError] = useState('');
  const busy = actions.addEntry.isPending || actions.updateEntry.isPending || actions.removeEntry.isPending ||
    actions.addList.isPending || actions.renameList.isPending || actions.removeList.isPending;
  const allEntries = entries.data ?? [];
  const allLists = lists.data ?? [];
  const selectedList = allLists.find(list => list.id === listId);
  const visible = allEntries.filter(entry => (status === 'all' || entry.status === status)
    && (listId === 'all' || (listId === 'unfiled' ? !entry.listId : entry.listId === listId))
    && entry.title.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  function openEditor(entry: TrackerEntry) {
    if (busy) return;
    setEditing(entry); setProgress(String(entry.progress)); setEditStatus(entry.status); setEditList(entry.listId); setModalError('');
  }
  async function saveEntry() {
    if (!editing) return;
    setModalError('');
    if (!/^\d+$/.test(progress.trim())) { setModalError('Enter a whole chapter number, starting from 0.'); return; }
    try {
      await actions.updateEntry.mutateAsync({ entry: editing, changes: { progress: Number(progress), status: editStatus, listId: editList } });
      setEditing(null); setNotice('Reading progress saved.'); setError('');
    } catch (cause) { setModalError(getErrorMessage(cause)); }
  }
  async function increment(entry: TrackerEntry) {
    setError(''); setNotice('');
    try {
      await actions.updateEntry.mutateAsync({ entry, changes: { progress: entry.progress + 1, status: entry.status, listId: entry.listId } });
      setNotice('One more chapter. Progress saved.');
    } catch (cause) { setError(getErrorMessage(cause)); }
  }
  async function saveList() {
    setModalError('');
    try {
      if (renameId) await actions.renameList.mutateAsync({ id: renameId, name: listName });
      else await actions.addList.mutateAsync(listName);
      setListName(''); setRenameId(null); setNotice('Reading list saved.');
    } catch (cause) { setModalError(getErrorMessage(cause)); }
  }
  async function confirmDelete() {
    if (!confirmation) return;
    setModalError('');
    try {
      if (confirmation.kind === 'entry') await actions.removeEntry.mutateAsync(confirmation.id);
      else {
        await actions.removeList.mutateAsync(confirmation.id);
        if (listId === confirmation.id) setListId('all');
      }
      setConfirmation(null); setNotice(confirmation.kind === 'entry' ? 'Title removed from your library.' : 'List removed. Its titles are still in your library.'); setError('');
    } catch (cause) { setModalError(getErrorMessage(cause)); }
  }
  const refresh = () => { void entries.refetch(); void lists.refetch(); };
  const header = <View style={styles.header}>
    <PageHeader eyebrow="YOUR PERSONAL COLLECTION" title="Every chapter counts." subtitle="A little progress. A lot of great stories."
      action={<IconButton name="options-outline" label="Manage tracker connection" onPress={() => router.push('/connection')} />} />
    {!connection.isReady ? <ActivityIndicator color={colors.green} /> : !connection.isConfigured
      ? <Notice title="Make room for your next favorite" message="Connect your tracker to save titles and pick up exactly where you left off." actionLabel="Connect my library" onAction={() => router.push('/connection')} />
      : <>
        <View style={styles.stats}>{[
          ['BOOKSHELF', allEntries.length, 'book-outline'],
          ['READING', allEntries.filter(entry => entry.status === 'reading').length, 'leaf-outline'],
          ['CHAPTERS', allEntries.reduce((sum, entry) => sum + entry.progress, 0), 'layers-outline'],
        ].map(([label, count, icon]) => <View key={String(label)} style={styles.stat}>
          <Ionicons name={icon as 'book-outline'} size={19} color={colors.green} /><Text style={styles.statNumber}>{count}</Text><Text style={styles.statLabel}>{label}</Text>
        </View>)}</View>
        <View style={styles.search}><Ionicons name="search-outline" size={20} color={colors.muted} />
          <TextInput accessibilityLabel="Search saved titles" value={query} onChangeText={setQuery} placeholder="Find a title on your shelf..." placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All titles" selected={status === 'all'} onPress={() => setStatus('all')} />
          {READING_STATUSES.map(value => <Chip key={value} label={STATUS_LABELS[value]} selected={status === value} onPress={() => setStatus(value)} />)}
        </ScrollView>
        <SectionHeading title="Reading lists" action="Manage" onAction={() => { setManageLists(true); setModalError(''); }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Everything" selected={listId === 'all'} onPress={() => setListId('all')} />
          <Chip label="Unfiled" selected={listId === 'unfiled'} onPress={() => setListId('unfiled')} />
          {allLists.map(list => <Chip key={list.id} label={list.name} selected={listId === list.id} onPress={() => setListId(list.id)} />)}
        </ScrollView>
        {lists.isError ? <Notice title="Lists could not load" message={getErrorMessage(lists.error)} tone="error" actionLabel="Retry lists" onAction={() => void lists.refetch()} /> : null}
        {error ? <Notice title="Change not saved" message={error} tone="error" /> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text> : null}
        <SectionHeading title={selectedList?.name ?? 'On your shelf'} subtitle={visible.length + (visible.length === 1 ? ' story to return to' : ' stories to return to')} />
      </>}
  </View>;

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safe}>
    <FlatList data={connection.isConfigured ? visible : []} keyExtractor={item => item.id}
      contentContainerStyle={styles.content} ListHeaderComponent={header} ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
      refreshControl={connection.isConfigured ? <RefreshControl refreshing={entries.isRefetching || lists.isRefetching} onRefresh={refresh} tintColor={colors.green} /> : undefined}
      ListEmptyComponent={connection.isConfigured ? entries.isPending ? <ActivityIndicator color={colors.green} style={{ padding: 36 }} /> : entries.isError
        ? <Notice title="Your shelf is taking a moment" message={getErrorMessage(entries.error)} tone="error" actionLabel="Try again" onAction={refresh} />
        : <View style={styles.empty}><Ionicons name="library-outline" size={40} color={colors.green} />
          <Text style={styles.emptyTitle}>{allEntries.length ? 'No matching stories' : 'Your story starts here.'}</Text>
          <Text style={styles.body}>{allEntries.length ? 'Try another filter or search.' : 'Discover a manga or manhwa and add it to your library.'}</Text>
          <Button label="Explore titles" variant="secondary" onPress={() => router.push('/')} /></View> : null}
      renderItem={({ item }) => <View style={styles.entry}>
        <Pressable accessibilityRole="button" accessibilityLabel={'View ' + item.title} onPress={() => router.push('/title/' + item.mangaId)}>
          <Cover uri={item.imageUrl} title={item.title} width={80} height={118} /></Pressable>
        <View style={styles.entryBody}>
          <Text style={styles.format}>{item.format.toUpperCase()} · {STATUS_LABELS[item.status]}</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/title/' + item.mangaId)}><Text numberOfLines={2} style={styles.title}>{item.title}</Text></Pressable>
          <Text style={styles.body}>Chapter {item.progress}{item.totalChapters !== null ? ' / ' + item.totalChapters : ' · ongoing length'}</Text>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, ...(item.totalChapters !== null ? { max: item.totalChapters } : {}), now: item.progress }}
            style={styles.progressTrack}><View style={[styles.progressFill, { width: item.totalChapters ? Math.min(100, item.progress / item.totalChapters * 100) + '%' as `${number}%` : '0%' }]} /></View>
          <View style={styles.entryActions}>
            <Button label="+1 chapter" variant="secondary" disabled={busy || (item.totalChapters !== null && item.progress >= item.totalChapters)} onPress={() => void increment(item)} />
            <IconButton name="create-outline" disabled={busy} label={'Edit ' + item.title} onPress={() => openEditor(item)} />
            <IconButton name="trash-outline" disabled={busy} label={'Remove ' + item.title} onPress={() => { setConfirmation({ kind: 'entry', id: item.id, title: item.title }); setModalError(''); }} />
          </View>
        </View>
      </View>} />
    <Modal visible={Boolean(editing)} transparent animationType="fade" onRequestClose={() => { if (!busy) setEditing(null); }}>
      <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><SafeAreaView style={styles.modalCard}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
        <SectionHeading title="A new chapter" action="Close" onAction={() => { if (!busy) setEditing(null); }} />
        <Text style={styles.title}>{editing?.title}</Text>
        <Text style={styles.label}>CHAPTERS READ</Text><TextInput accessibilityLabel="Chapters read" keyboardType="number-pad" value={progress} editable={!busy}
          onChangeText={setProgress} style={styles.input} />
        <Text style={styles.label}>READING STATUS</Text><View style={styles.wrap}>{READING_STATUSES.map(value => <Chip key={value} label={STATUS_LABELS[value]} selected={editStatus === value} onPress={() => setEditStatus(value)} />)}</View>
        <Text style={styles.label}>READING LIST</Text>
        {lists.isError ? <Notice title="Lists could not load" message={getErrorMessage(lists.error)} tone="error" actionLabel="Retry lists" onAction={() => void lists.refetch()} /> : null}<View style={styles.wrap}><Chip label="Unfiled" selected={!editList} onPress={() => setEditList(null)} />
          {allLists.map(list => <Chip key={list.id} label={list.name} selected={editList === list.id} onPress={() => setEditList(list.id)} />)}</View>
        {modalError ? <Notice title="Check your update" message={modalError} tone="error" /> : null}
        <Button label="Save progress" onPress={saveEntry} loading={busy} disabled={lists.isError || lists.isPending} />
      </ScrollView></SafeAreaView></KeyboardAvoidingView>
    </Modal>
    <Modal visible={manageLists && !confirmation} transparent animationType="fade" onRequestClose={() => { if (!busy) setManageLists(false); }}>
      <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><SafeAreaView style={styles.modalCard}><ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
        <SectionHeading title="Your reading lists" action="Done" onAction={() => { if (!busy) setManageLists(false); }} />
        <Text style={styles.body}>Give your favorite stories a little space of their own.</Text>
        {lists.isError ? <Notice title="Lists could not load" message={getErrorMessage(lists.error)} tone="error" actionLabel="Retry lists" onAction={() => void lists.refetch()} /> : null}
        {allLists.map(list => <View key={list.id} style={styles.listRow}><Ionicons name="folder-outline" size={20} color={colors.green} /><Text style={[styles.title, { flex: 1 }]}>{list.name}</Text>
          <IconButton name="create-outline" disabled={busy} label={'Rename ' + list.name} onPress={() => { setRenameId(list.id); setListName(list.name); }} />
          <IconButton name="trash-outline" disabled={busy} label={'Delete list ' + list.name} onPress={() => { setConfirmation({ kind: 'list', id: list.id, title: list.name }); setModalError(''); }} /></View>)}
        <Text style={styles.label}>{renameId ? 'RENAME LIST' : 'CREATE A LIST'}</Text>
        <TextInput accessibilityLabel="Reading list name" placeholder="Weekend reads" placeholderTextColor={colors.muted} maxLength={50}
          value={listName} onChangeText={setListName} style={styles.input} editable={!busy} />
        {modalError ? <Notice title="List not saved" message={modalError} tone="error" /> : null}
        <Button label={renameId ? 'Save list name' : 'Create reading list'} icon="add-outline" onPress={saveList} loading={busy} disabled={!listName.trim() || lists.isError || lists.isPending} />
        {renameId ? <Button label="Cancel rename" variant="ghost" onPress={() => { setRenameId(null); setListName(''); }} /> : null}
      </ScrollView></SafeAreaView></KeyboardAvoidingView>
    </Modal>
    <Modal visible={Boolean(confirmation)} transparent animationType="fade" onRequestClose={() => { if (!busy) setConfirmation(null); }}>
      <KeyboardAvoidingView style={styles.scrim} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={[styles.modalCard, styles.modalContent]}>
        <Text style={styles.emptyTitle}>Remove {confirmation?.kind === 'list' ? 'this list' : 'this title'}?</Text>
        <Text style={styles.title}>{confirmation?.title}</Text>
        <Text style={styles.body}>{confirmation?.kind === 'list' ? 'The list will be deleted. Its saved titles will move to Unfiled.' : 'This deletes the saved title and its reading progress from your tracker.'}</Text>
        {modalError ? <Notice title="Could not finish removal" message={modalError} tone="error" /> : null}
        <Button label="Remove" variant="danger" loading={busy} onPress={confirmDelete} />
        <Button label="Keep it" variant="ghost" disabled={busy} onPress={() => setConfirmation(null)} />
      </View></KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, content: { padding: 24, paddingBottom: 35, width: '100%', maxWidth: 780, alignSelf: 'center' },
  header: { gap: 22, paddingBottom: 22 }, stats: { backgroundColor: colors.greenLight, borderRadius: 22, padding: 20, flexDirection: 'row' },
  stat: { flex: 1, gap: 9, alignItems: 'center' }, statNumber: { fontSize: 27, fontWeight: '700', color: colors.green }, statLabel: { fontSize: 9, letterSpacing: 1.2, color: colors.green, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 52, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 14, gap: 10 },
  searchInput: { flex: 1, minHeight: 50, fontSize: 14, color: colors.ink }, chips: { gap: 8 }, wrap: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  entry: { flexDirection: 'row', gap: 16, padding: 15, backgroundColor: colors.paper, borderRadius: 19, borderWidth: 1, borderColor: colors.border },
  entryBody: { flex: 1, gap: 7 }, format: { color: colors.green, fontSize: 9, letterSpacing: 0.6, fontWeight: '700' },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink, lineHeight: 22 }, body: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  entryActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 0 }, progressTrack: { height: 4, backgroundColor: colors.greenLight, borderRadius: 4, marginVertical: 3 },
  progressFill: { height: 4, backgroundColor: colors.green, borderRadius: 4 }, empty: { paddingVertical: 34, gap: 16, alignItems: 'center' }, emptyTitle: { fontSize: 24, color: colors.ink, fontWeight: '700' },
  success: { color: colors.green, fontSize: 13 }, scrim: { flex: 1, backgroundColor: '#152B2466', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: colors.background, borderRadius: 24, maxHeight: '90%', width: '100%', maxWidth: 540, alignSelf: 'center', overflow: 'hidden' },
  modalContent: { padding: 24, gap: 20 }, label: { fontSize: 10, color: colors.green, fontWeight: '800', letterSpacing: 1.5 },
  input: { minHeight: 50, padding: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, borderRadius: 12, color: colors.ink, fontSize: 16 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6 },
});

