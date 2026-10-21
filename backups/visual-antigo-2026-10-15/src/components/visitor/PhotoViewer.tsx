import { ChevronLeft, ChevronRight, Download, Flag, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal as RNModal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { downloadUrl, resultImageUrl, type ResultItem } from '@/api/public';
import { ZoomImage } from '@/components/ui/ZoomImage';
import { poppins, visitor } from '@/theme/tokens';

import { VButton } from './ui';

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
 * "Foto ampliada" (RF018), full screen: the photo takes all the room the window has (the 1st
 * committee found the old 490 px box too small), with zoom — wheel, double click, pinch, drag,
 * buttons. Next/previous WITHIN this result only (note 5): arrows, ← → keys or a swipe. Under
 * it: the credit, event + capture date, download (RF019) and "Solicitar remoção" (RF023 note 1:
 * identified by the photo itself, no room for a wrong image). Esc closes.
 */
export function PhotoViewer({ items, index, eventName, eventDate, onIndex, onRemove }: Props) {
  const item = index === null ? null : items[index];
  const go = (d: number) => index !== null && onIndex((index + d + items.length) % items.length);
  const { width } = useWindowDimensions();
  const phone = width < 640;

  useEffect(() => {
    if (Platform.OS !== 'web' || index === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Escape') onIndex(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  const [downloading, setDownloading] = useState(false);
  // An error belongs to the photo it happened on: moving to another photo hides it.
  const [failure, setFailure] = useState<{ index: number; message: string } | null>(null);
  const error = failure && failure.index === index ? failure.message : null;
  // The original file, with credits in its metadata, through a signed link that only works in
  // this session for 15 minutes (RF019). The API serves the file: no storage address leaks.
  async function download(id: string) {
    setDownloading(true);
    setFailure(null);
    try {
      window.location.assign(await downloadUrl(id));
    } catch (e) {
      setFailure({ index: index!, message: e instanceof Error ? e.message : 'Não foi possível baixar. Tente novamente.' });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <RNModal visible={!!item} transparent animationType="fade" onRequestClose={() => onIndex(null)}>
      {item && (
        <View style={styles.screen} role="dialog" aria-modal aria-label={`Foto ${index! + 1} de ${items.length}`}>
          <View style={styles.top}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.counter}>Foto {index! + 1} de {items.length}</Text>
              <Text style={styles.event} numberOfLines={1}>{eventName}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={() => onIndex(null)} hitSlop={8}
                       style={({ hovered }: any) => [styles.close, hovered && { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
              <X size={26} color="#FFFFFF" strokeWidth={1.8} absoluteStrokeWidth />
            </Pressable>
          </View>

          <View style={styles.stage}>
            <ZoomImage key={item.id} uri={resultImageUrl(item.id, 'preview')} placeholder={resultImageUrl(item.id, 'thumb')}
                       alt={`Foto ${index! + 1} de ${items.length}`} style={StyleSheet.absoluteFill} theme="dark" keyboard
                       onSwipe={items.length > 1 ? go : undefined} />
            {items.length > 1 && !phone && (
              <>
                <Arrow side="left" onPress={() => go(-1)} />
                <Arrow side="right" onPress={() => go(1)} />
              </>
            )}
          </View>

          <View style={[styles.bottom, phone && styles.bottomPhone]}>
            <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
              <Text style={styles.credit}>{item.credit}</Text>
              <Text style={styles.date}>{item.captured_at ? shortDate(item.captured_at) : eventDate}</Text>
              {phone && items.length > 1 && <Text style={styles.hint}>Arraste para o lado para ver as outras fotos</Text>}
            </View>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" accessibilityLabel="Solicitar remoção desta foto" onPress={() => onRemove(item)}
                         style={({ hovered }: any) => [styles.flag, hovered && { opacity: 0.85 }]}>
                <Flag size={20} color="#FFD84D" strokeWidth={1.6} absoluteStrokeWidth />
                <Text style={styles.flagText}>Solicitar remoção</Text>
              </Pressable>
              <VButton label="Baixar" icon={Download} onPress={() => download(item.id)} loading={downloading} />
            </View>
            {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
          </View>
        </View>
      )}
    </RNModal>
  );
}

function Arrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={side === 'left' ? 'Foto anterior' : 'Próxima foto'} onPress={onPress}
               style={({ hovered }: any) => [styles.arrow, side === 'left' ? { left: 20 } : { right: 20 },
                                              hovered && { backgroundColor: visitor.primary }]}>
      <Icon size={30} color="#FFFFFF" strokeWidth={2} absoluteStrokeWidth />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0F14' }, // solid: the page behind must not show through
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 12 },
  counter: { fontFamily: poppins.semiBold, fontSize: 16, color: '#FFFFFF' },
  event: { fontFamily: poppins.regular, fontSize: 13, color: 'rgba(255, 255, 255, 0.7)' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, marginHorizontal: 8 },
  arrow: { position: 'absolute', top: '50%', marginTop: -26, width: 52, height: 52, borderRadius: 26,
           backgroundColor: 'rgba(0, 125, 197, 0.62)', alignItems: 'center', justifyContent: 'center' },
  bottom: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingHorizontal: 24, paddingVertical: 14,
            borderTopWidth: 1, borderTopColor: 'rgba(255, 255, 255, 0.08)' },
  bottomPhone: { paddingHorizontal: 16 },
  credit: { fontFamily: poppins.medium, fontSize: 13, color: '#FFFFFF' },
  date: { fontFamily: poppins.regular, fontSize: 12, color: 'rgba(255, 255, 255, 0.7)' },
  hint: { fontFamily: poppins.regular, fontSize: 11, color: 'rgba(255, 255, 255, 0.55)', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flag: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 12,
          backgroundColor: 'rgba(255, 205, 11, 0.16)' },
  flagText: { fontFamily: poppins.medium, fontSize: 13, color: '#FFD84D' },
  error: { width: '100%', fontFamily: poppins.medium, fontSize: 13, color: '#FF8FA3' },
});
