import { Image } from 'expo-image';
import { SearchX } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { resultImageUrl, type ResultItem } from '@/api/public';
import { poppins, visitor } from '@/theme/tokens';

import { Note, ResponsibleUse, vtext } from './ui';

type Props = { items: ResultItem[]; selfie: string | null; onOpen: (index: number) => void };

/**
 * RF018 — only the photos where the visitor was found, as 108 px squares ("Frame 92").
 * Every thumbnail comes from a route that checks THIS session's result on the server.
 */
export function Results({ items, selfie, onOpen }: Props) {
  const { width } = useWindowDimensions();
  const columns = width >= 700 ? 5 : width >= 520 ? 4 : 3;

  if (items.length === 0) return <EmptyResult />;
  return (
    <View style={{ gap: 16 }}>
      <View style={styles.head}>
        {/* The visitor's own selfie, only in this page's memory (never sent back by the server). */}
        {selfie && <Image source={selfie} style={styles.selfie} contentFit="cover" accessibilityLabel="Sua foto de busca" />}
        <View style={{ flex: 1 }}>
          <Text style={vtext.h2}>Suas fotos</Text>
          <Text style={styles.count}>{items.length === 1 ? '1 foto encontrada' : `${items.length} fotos encontradas`}</Text>
        </View>
      </View>
      <View style={styles.grid}>
        {items.map((it, i) => (
          <Pressable key={it.id} accessibilityRole="button" accessibilityLabel={`Abrir foto ${i + 1} de ${items.length}`}
                     onPress={() => onOpen(i)} style={[styles.cell, { width: `${100 / columns}%` }]}>
            <Image source={resultImageUrl(it.id, 'thumb')} style={styles.thumb} contentFit="cover" />
          </Pressable>
        ))}
      </View>
      {/* RF016 note 5: similarity, not identity — and what affects it. */}
      <Note>
        O reconhecimento facial indica semelhança visual, não identidade. Iluminação, óculos, ângulo do rosto e partes
        do rosto cobertas podem afetar o resultado.
      </Note>
      <ResponsibleUse />
    </View>
  );
}

/** "Nenhuma foto encontrada" (RF018 note 7): possible causes + try again. */
function EmptyResult() {
  return (
    <View style={styles.empty} accessibilityLiveRegion="polite">
      <SearchX size={40} color={visitor.placeholder} strokeWidth={1.4} absoluteStrokeWidth />
      <Text style={[vtext.h3, { color: visitor.text, textAlign: 'center' }]}>Nenhuma foto encontrada</Text>
      <Text style={styles.emptyLead}>Não encontramos fotos suas neste evento.</Text>
      <Text style={styles.emptyText}>
        Tente novamente com uma foto bem iluminada, com o rosto visível e olhando para a câmera. Se você não foi
        fotografado neste evento, nenhuma foto aparecerá.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  selfie: { width: 64, height: 64, borderRadius: 999, backgroundColor: visitor.chip },
  count: { fontFamily: poppins.semiBold, fontSize: 14, color: visitor.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  cell: { padding: 5, aspectRatio: 1 },
  thumb: { flex: 1, borderRadius: 6, backgroundColor: visitor.chip },
  empty: { alignItems: 'center', gap: 4, paddingVertical: 16 },
  emptyLead: { fontFamily: poppins.medium, fontSize: 14, color: visitor.muted, textAlign: 'center' },
  emptyText: { fontFamily: poppins.regular, fontSize: 13, lineHeight: 20, color: visitor.muted, textAlign: 'center', maxWidth: 420 },
});
