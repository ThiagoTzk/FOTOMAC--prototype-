import { Image } from 'expo-image';
import { ChevronLeft, ChevronRight, Download, Flag } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { downloadUrl, resultImageUrl, type ResultItem } from '@/api/public';
import { poppins, visitor } from '@/theme/tokens';

import { Note, Sheet, VButton } from './ui';

type Props = {
  items: ResultItem[];
  index: number | null;
  eventName: string;
  eventDate: string;
  onIndex: (i: number | null) => void;
  onRemove: (item: ResultItem) => void;
};

export const shortDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');

/**
 * "Foto ampliada" (RF018): reduced copy for the screen, the credit under it, event + capture
 * date, next/previous WITHIN this result only (note 5), download (RF019) and "Solicitar
 * remoção" (RF023 note 1: identified by the photo itself, no room for a wrong image).
 */
export function PhotoViewer({ items, index, eventName, eventDate, onIndex, onRemove }: Props) {
  const item = index === null ? null : items[index];
  const go = (d: number) => index !== null && onIndex((index + d + items.length) % items.length);

  useEffect(() => {
    if (Platform.OS !== 'web' || index === null) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The original file, with credits in its metadata, through a signed link that only works in
  // this session for 15 minutes (RF019). The API serves the file: no storage address leaks.
  async function download(id: string) {
    setDownloading(true);
    setError(null);
    try {
      window.location.assign(await downloadUrl(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível baixar. Tente novamente.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Sheet visible={!!item} title={item ? `Foto ${index! + 1} de ${items.length}` : ''} onClose={() => onIndex(null)} width={520}>
      {item && (
        <>
          <View style={styles.frame}>
            <Image source={resultImageUrl(item.id, 'preview')} placeholder={resultImageUrl(item.id, 'thumb')}
                   style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={`Foto ${index! + 1}`} />
            {items.length > 1 && (
              <>
                <Arrow side="left" onPress={() => go(-1)} />
                <Arrow side="right" onPress={() => go(1)} />
              </>
            )}
          </View>
          <Text style={styles.credit}>{item.credit}</Text>
          <View style={styles.info}>
            <Text style={styles.event} numberOfLines={2}>{eventName}</Text>
            <Text style={styles.date}>{item.captured_at ? shortDate(item.captured_at) : eventDate}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Solicitar remoção desta foto" onPress={() => onRemove(item)}
                       style={({ hovered }: any) => [styles.flag, hovered && { opacity: 0.85 }]}>
              <Flag size={20} color="#9A7A00" strokeWidth={1.6} absoluteStrokeWidth />
              <Text style={styles.flagText}>Solicitar remoção</Text>
            </Pressable>
            <VButton label="Baixar" icon={Download} onPress={() => download(item.id)} loading={downloading} />
          </View>
          {error && <Note tone="danger">{error}</Note>}
        </>
      )}
    </Sheet>
  );
}

function Arrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={side === 'left' ? 'Foto anterior' : 'Próxima foto'} onPress={onPress}
               style={[styles.arrow, side === 'left' ? { left: 8 } : { right: 8 }]}>
      <Icon size={24} color="#FFFFFF" strokeWidth={2} absoluteStrokeWidth />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 306 / 345, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  arrow: { position: 'absolute', top: '50%', marginTop: -16, width: 32, height: 32, borderRadius: 50,
           backgroundColor: 'rgba(0, 125, 197, 0.62)', alignItems: 'center', justifyContent: 'center' },
  credit: { fontFamily: poppins.regular, fontSize: 10, color: visitor.muted, marginTop: -8 },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  event: { flex: 1, fontFamily: poppins.semiBold, fontSize: 14, color: visitor.text },
  date: { fontFamily: poppins.medium, fontSize: 13, color: visitor.muted },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  flag: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, borderRadius: 10.4,
          backgroundColor: 'rgba(255, 205, 11, 0.20)' },
  flagText: { fontFamily: poppins.medium, fontSize: 12, color: '#7A6100' },
});
