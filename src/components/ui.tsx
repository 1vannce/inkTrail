import { useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, serif } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
export function Button({ label, onPress, variant = 'primary', disabled = false, loading = false, icon }: {
  label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean; loading?: boolean; icon?: IconName;
}) {
  const light = variant === 'primary' || variant === 'danger';
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || loading, busy: loading }}
    disabled={disabled || loading} onPress={onPress}
    style={({ pressed }) => [styles.button, variant === 'primary' && { backgroundColor: colors.green },
      variant === 'secondary' && { backgroundColor: colors.greenLight }, variant === 'danger' && { backgroundColor: colors.danger },
      (disabled || loading) && { opacity: 0.55 }, pressed && { opacity: 0.8 }]}>
    {loading ? <ActivityIndicator size="small" color={light ? '#FFF' : colors.green} />
      : icon ? <Ionicons name={icon} size={18} color={light ? '#FFF' : colors.green} /> : null}
    <Text style={[styles.buttonText, { color: light ? '#FFF' : colors.green }]}>{label}</Text>
  </Pressable>;
}
export function IconButton({ name, label, onPress, disabled = false }: { name: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.iconButton, disabled && { opacity: 0.4 }, pressed && { backgroundColor: colors.greenLight }]}>
    <Ionicons name={name} size={23} color={colors.green} />
  </Pressable>;
}
export function Chip({ label, selected = false, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityState={{ selected }}
    onPress={onPress} disabled={!onPress} style={[styles.chip, selected && { backgroundColor: colors.green, borderColor: colors.green }]}>
    <Text style={[styles.chipText, selected && { color: '#FFF' }]}>{label}</Text>
  </Pressable>;
}
export function Cover({ uri, title, width = 108, height = 156 }: { uri: string; title: string; width?: number; height?: number }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return <View style={[styles.cover, { width, height }]}>
    {uri && !failed ? <Image source={{ uri }} accessibilityLabel={title + ' cover'} resizeMode="cover"
      style={{ width: '100%', height: '100%' }} onError={() => setFailed(true)} />
      : <View style={styles.coverFallback}><Ionicons name="book-outline" size={28} color={colors.green} />
        <Text numberOfLines={3} style={styles.coverLabel}>{title}</Text></View>}
  </View>;
}
export function Notice({ title, message, actionLabel, onAction, tone = 'info' }: {
  title: string; message: string; actionLabel?: string; onAction?: () => void; tone?: 'error' | 'info';
}) {
  return <View accessibilityLiveRegion="polite" style={[styles.notice, tone === 'error' && { backgroundColor: '#FFF0EA' }]}>
    <Ionicons name={tone === 'error' ? 'alert-circle-outline' : 'leaf-outline'} size={23} color={tone === 'error' ? colors.danger : colors.green} />
    <View style={{ flex: 1, gap: 7 }}><Text style={styles.noticeTitle}>{title}</Text><Text style={styles.body}>{message}</Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" /> : null}</View>
  </View>;
}
export function SectionHeading({ title, subtitle, action, onAction }: { title: string; subtitle?: string; action?: string; onAction?: () => void }) {
  return <View style={styles.sectionRow}><View style={{ flex: 1, gap: 4 }}><Text style={styles.sectionTitle}>{title}</Text>
    {subtitle ? <Text style={styles.body}>{subtitle}</Text> : null}</View>
    {action && onAction ? <Button label={action} onPress={onAction} variant="ghost" /> : null}</View>;
}
export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle?: string; action?: React.ReactNode }) {
  return <View style={{ gap: 12 }}><View style={styles.sectionRow}><Text style={styles.eyebrow}>{eyebrow}</Text>{action}</View>
    <Text accessibilityRole="header" style={styles.pageTitle}>{title}</Text>{subtitle ? <Text style={styles.body}>{subtitle}</Text> : null}</View>;
}
const styles = StyleSheet.create({
  button: { minHeight: 46, paddingHorizontal: 17, paddingVertical: 11, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14, fontWeight: '700' }, iconButton: { minWidth: 46, minHeight: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 44, borderRadius: 24, paddingHorizontal: 17, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', backgroundColor: colors.paper },
  chipText: { fontSize: 13, color: colors.ink, fontWeight: '600' }, cover: { borderRadius: 12, overflow: 'hidden', backgroundColor: colors.greenLight },
  coverFallback: { flex: 1, padding: 12, justifyContent: 'center', alignItems: 'center', gap: 12 }, coverLabel: { color: colors.green, textAlign: 'center', fontWeight: '700', fontSize: 12 },
  notice: { padding: 18, borderRadius: 18, backgroundColor: colors.greenLight, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  noticeTitle: { fontSize: 16, fontWeight: '700', color: colors.ink }, body: { fontSize: 14, lineHeight: 22, color: colors.muted },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionTitle: { fontFamily: serif, color: colors.ink, fontSize: 25, fontWeight: '600' },
  eyebrow: { fontSize: 11, letterSpacing: 2, fontWeight: '800', color: colors.green }, pageTitle: { fontFamily: serif, fontSize: 40, lineHeight: 46, color: colors.ink },
});

