import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chip, Cover, IconButton, Notice, SectionHeading } from '../components/ui';
import { useCatalog } from '../hooks/useCatalog';
import { colors } from '../theme';
import { CatalogFormat, Manga } from '../types';

const serif = Platform.OS === 'ios' ? 'Georgia' : 'serif';
const FILTERS: { value: CatalogFormat; label: string }[] = [
  { value: 'all', label: 'All stories' }, { value: 'manga', label: 'Manga' }, { value: 'manhwa', label: 'Manhwa' },
];

function FeaturedTitle({ manga, compact }: { manga: Manga; compact: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Explore ${manga.title}`}
      onPress={() => router.push(`/title/${manga.id}`)}
      style={({ pressed }) => [styles.feature, compact && styles.featureCompact, pressed && styles.pressed]}>
      <View style={styles.featureCopy}>
        <View style={styles.featureKicker}>
          <Ionicons name="sparkles-outline" size={15} color="#EDBF85" />
          <Text style={styles.featureKickerText}>WORTH TURNING THE PAGE</Text>
        </View>
        <Text numberOfLines={3} style={[styles.featureTitle, compact && styles.featureTitleCompact]}>{manga.title}</Text>
        <Text numberOfLines={2} style={styles.featureDescription}>{manga.genres.slice(0, 3).join('  ·  ') || 'Your next favorite story starts here.'}</Text>
        <View style={styles.featureLink}>
          <Text style={styles.featureLinkText}>Explore story</Text>
          <Ionicons name="arrow-forward" size={17} color="#F6F4DF" />
        </View>
      </View>
      <View style={styles.featureCover}>
        <Cover uri={manga.imageUrl} title={manga.title} width={compact ? 106 : 146} height={compact ? 155 : 208} />
      </View>
      <View pointerEvents="none" style={styles.featureCircle} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [format, setFormat] = useState<CatalogFormat>('all');
  const catalog = useCatalog(debouncedQuery, format);
  const columns = width >= 1000 ? 4 : width >= 700 ? 3 : 2;
  const gutter = width < 400 ? 20 : 28;
  const cardWidth = (Math.min(width, 1100) - gutter * 2 - (columns - 1) * 18) / columns;
  const isSearching = debouncedQuery.length > 0;
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 500);
    return () => clearTimeout(timeout);
  }, [query]);

  const titles = useMemo(() => {
    const seen = new Set<number>();
    return (catalog.data?.pages.flatMap((page) => page.items) ?? []).filter((manga) => {
      if (seen.has(manga.id)) return false;
      seen.add(manga.id);
      return true;
    });
  }, [catalog.data]);
  const featured = !isSearching ? titles[0] : undefined;
  const gridTitles = featured ? titles.slice(1) : titles;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList key={columns} data={gridTitles} numColumns={columns} keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.content, { paddingHorizontal: gutter }]} columnWrapperStyle={styles.gridRow}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View style={styles.topbar}>
              <View style={styles.brand}>
                <View style={styles.brandMark}><Ionicons name="book-outline" size={23} color={colors.paper} /></View>
                <Text style={styles.wordmark}>inktrail<Text style={styles.brandDot}>.</Text></Text>
              </View>
              <IconButton name="options-outline" label="Configure tracker connection" onPress={() => router.push('/connection')} />
            </View>
            <View style={styles.intro}>
              <Text style={styles.eyebrow}>YOUR NEXT CHAPTER</Text>
              <Text style={[styles.heading, width < 400 && styles.headingCompact]}>Find a story.{'\n'}Make it yours.</Text>
              <Text style={styles.subtitle}>Manga, manhwa, and a little room for obsession.</Text>
            </View>
            <View style={styles.searchBox}>
              <Ionicons name="search-outline" size={21} color={colors.muted} />
              <TextInput accessibilityLabel="Search manga and manhwa" placeholder="Search titles, find your next favorite..."
                placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} returnKeyType="search"
                autoCapitalize="none" autoCorrect={false} onSubmitEditing={() => setDebouncedQuery(query.trim())} style={styles.searchInput} />
              {query.length > 0 && (
                <Pressable accessibilityRole="button" accessibilityLabel="Clear search"
                  onPress={() => { setQuery(''); setDebouncedQuery(''); }} style={styles.clearSearch}>
                  <Ionicons name="close-circle" size={20} color={colors.muted} />
                </Pressable>
              )}
            </View>
            <View style={styles.filters}>
              {FILTERS.map((filter) => <Chip key={filter.value} label={filter.label} selected={format === filter.value} onPress={() => setFormat(filter.value)} />)}
            </View>
            {featured && <FeaturedTitle manga={featured} compact={width < 520} />}
            <View style={styles.catalogHeading}>
              <View style={{ flex: 1 }}><SectionHeading title={isSearching ? 'Search results' : 'Discover something good'}
                subtitle={isSearching ? `Stories matching “${debouncedQuery}”` : 'Great stories. One chapter at a time.'} /></View>
              {catalog.isFetching && !catalog.isPending && <ActivityIndicator accessibilityLabel="Refreshing catalog" color={colors.green} />}
            </View>
            {catalog.isError && (
              <View style={styles.notice}>
                <Notice title="The catalog needs a moment" message={catalog.error.message} actionLabel="Try again" onAction={() => { void catalog.refetch(); }} tone="error" />
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${item.type}${item.score ? `, rated ${item.score.toFixed(1)} out of 10` : ''}. View details`}
            onPress={() => router.push(`/title/${item.id}`)}
            style={({ pressed }) => [styles.catalogCard, { width: cardWidth }, pressed && styles.pressed]}>
            <View style={styles.cardImage}>
              <Cover uri={item.imageUrl} title={item.title} width={cardWidth} height={Math.round(cardWidth * 1.39)} />
              {item.score !== null && <View style={styles.score}><Ionicons name="star" color="#C39131" size={11} /><Text style={styles.scoreText}>{item.score.toFixed(1)}</Text></View>}
            </View>
            <Text style={styles.cardType}>{item.type || 'MANGA'}</Text>
            <Text numberOfLines={2} style={styles.cardTitle}>{item.title}</Text>
            <Text numberOfLines={1} style={styles.cardGenres}>{item.genres.slice(0, 2).join(' · ') || 'Discover this story'}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          catalog.isPending ? (
            <View style={styles.empty}><ActivityIndicator size="large" color={colors.green} /><Text style={styles.emptyText}>Opening a world of stories...</Text></View>
          ) : !catalog.isError && !featured ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><Ionicons name="search-outline" size={30} color={colors.green} /></View>
              <Text style={styles.emptyTitle}>A story still to be found</Text>
              <Text style={styles.emptyText}>Try a shorter title or explore a different format.</Text>
              <Button label="Explore all stories" variant="secondary" onPress={() => { setQuery(''); setDebouncedQuery(''); setFormat('all'); }} />
            </View>
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            {catalog.hasNextPage && <Button label="Discover more" variant="secondary" icon="arrow-down-outline" loading={catalog.isFetchingNextPage} onPress={() => { void catalog.fetchNextPage(); }} />}
            <View style={styles.footerNote}><View style={styles.footerLine} /><Ionicons name="leaf-outline" size={16} color={colors.muted} /><View style={styles.footerLine} /></View>
            <Text style={styles.footerText}>EVERY GREAT STORY LEAVES A TRAIL.</Text>
            <Text style={styles.attribution}>Catalog powered by Kitsu</Text>
          </View>
        } />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 1100, alignSelf: 'center', paddingBottom: 30 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 17, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: colors.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 37, height: 37, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontFamily: serif, fontSize: 29, fontWeight: '700', letterSpacing: -1.3, color: colors.ink },
  brandDot: { color: colors.coral },
  intro: { paddingTop: 34, paddingBottom: 26 },
  eyebrow: { fontSize: 10, letterSpacing: 2.5, color: colors.green, fontWeight: '700', marginBottom: 13 },
  heading: { fontFamily: serif, fontSize: 49, letterSpacing: -1.5, lineHeight: 53, color: colors.ink },
  headingCompact: { fontSize: 43, lineHeight: 47 },
  subtitle: { fontSize: 13, color: colors.muted, lineHeight: 21, marginTop: 13 },
  searchBox: { minHeight: 54, borderWidth: 1, borderColor: colors.border, borderRadius: 13, paddingLeft: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.paper, gap: 10 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 16, paddingRight: 10, color: colors.ink, fontSize: 13 },
  clearSearch: { minHeight: 48, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 8, paddingVertical: 18, flexWrap: 'wrap' },
  feature: { backgroundColor: colors.green, borderRadius: 20, padding: 28, flexDirection: 'row', alignItems: 'center', minHeight: 263, overflow: 'hidden', marginTop: 2, marginBottom: 30 },
  featureCompact: { padding: 20, minHeight: 220 },
  featureCopy: { flex: 1, paddingRight: 18, zIndex: 2 },
  featureKicker: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 13 },
  featureKickerText: { color: '#EDBF85', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, flexShrink: 1, lineHeight: 13 },
  featureTitle: { fontFamily: serif, color: '#F8F4E7', fontSize: 34, lineHeight: 38 },
  featureTitleCompact: { fontSize: 25, lineHeight: 28 },
  featureDescription: { color: '#CBD8C8', fontSize: 11, lineHeight: 18, marginTop: 12 },
  featureLink: { flexDirection: 'row', gap: 9, alignItems: 'center', paddingTop: 20 },
  featureLinkText: { color: '#F6F4DF', fontSize: 12, fontWeight: '600' },
  featureCover: { transform: [{ rotate: '7deg' }], zIndex: 1, borderRadius: 8, boxShadow: '0px 12px 22px rgba(0,0,0,0.25)' },
  featureCircle: { position: 'absolute', right: -90, top: -65, width: 365, height: 365, borderRadius: 220, borderWidth: 1, borderColor: '#49715B' },
  catalogHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 },
  gridRow: { gap: 18, alignItems: 'flex-start' },
  catalogCard: { marginBottom: 27 },
  cardImage: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.greenLight },
  score: { position: 'absolute', right: 9, bottom: 9, flexDirection: 'row', gap: 4, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 7, backgroundColor: '#FFFDF3', alignItems: 'center' },
  scoreText: { fontWeight: '700', fontSize: 10, color: colors.ink },
  cardType: { color: colors.green, fontSize: 9, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 12, marginBottom: 5 },
  cardTitle: { color: colors.ink, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  cardGenres: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  notice: { marginBottom: 20 },
  empty: { paddingVertical: 35, alignItems: 'center', gap: 16, paddingHorizontal: 12 },
  emptyIcon: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.greenLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 23, color: colors.ink, fontFamily: serif, textAlign: 'center' },
  emptyText: { textAlign: 'center', fontSize: 13, color: colors.muted, lineHeight: 21 },
  footer: { alignItems: 'center', paddingTop: 9 },
  footerNote: { flexDirection: 'row', alignItems: 'center', gap: 13, marginTop: 35, marginBottom: 13 },
  footerLine: { height: 1, width: 40, backgroundColor: colors.border },
  footerText: { fontSize: 8, letterSpacing: 1.6, color: colors.muted, fontWeight: '600' },
  attribution: { fontSize: 10, color: colors.muted, marginTop: 9 },
  pressed: { opacity: 0.78 },
});


