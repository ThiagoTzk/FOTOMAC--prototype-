import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDate, thumbUrl, type ImageItem } from '@/api/images';
import { Pill } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/** One status per card, in the order that matters most to the photographer. */
export function imageStatus(i: ImageItem): { label: string; bg: string; fg: string } {
  if (i.removal_deadline) return { label: 'Remoção solicitada', bg: panel.dangerSoft, fg: panel.danger };
  if (i.review_status === 'in_review') return { label: 'Em conferência', bg: panel.primarySoft, fg: panel.primaryText };
  if (i.review_status === 'discarded') return { label: 'Descartada', bg: panel.page, fg: panel.muted };
  if (i.indexing_status === 'failed') return { label: 'Falha', bg: panel.dangerSoft, fg: panel.danger };
  if (i.indexing_status === 'no_faces') return { label: 'Sem faces', bg: panel.warningSoft, fg: panel.warning };
  if (i.indexing_status === 'pending') return { label: 'Processando', bg: panel.primarySoft, fg: panel.primaryText };
  return { label: 'Publicada', bg: panel.successSoft, fg: panel.success };
}

type Props = {
  image: ImageItem;
  onOpen: () => void;
  action?: { label: string; onPress: () => void };
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
};

/** "Cartão de imagem" (166 x 222): photo, status, date · author (RF009 note 4), one action. */
export function ImageCard({ image, onOpen, action, selectable, selected, onToggle }: Props) {
  const s = imageStatus(image);
  return (
    <View style={[styles.card, selected && { borderColor: panel.primary, borderWidth: 2, padding: 7 }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Abrir imagem enviada por ${image.signature}`}
                onPress={selectable ? onToggle : onOpen}>
        <Image source={{ uri: thumbUrl(image.id, image.version) }} style={[styles.photo, image.review_status === 'discarded' && { opacity: 0.45 }]}
               contentFit="cover" recyclingKey={image.id} />
        {selectable && (
          <View style={[styles.check, selected && { backgroundColor: panel.primary, borderColor: panel.primary }]}>
            {selected && <Check size={14} color="#FFFFFF" strokeWidth={2.4} absoluteStrokeWidth />}
          </View>
        )}
      </Pressable>
      <Pill label={s.label} bg={s.bg} fg={s.fg} />
      <Text style={styles.meta} numberOfLines={2}>
        {formatDate(image.uploaded_at)} · {image.mine ? `${image.signature} (você)` : image.signature}
      </Text>
      {action && !selectable && (
        <Pressable accessibilityRole="button" onPress={action.onPress}>
          <Text style={styles.action}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 166, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: panel.border, borderRadius: 10, padding: 8, gap: 10 },
  photo: { width: 150, height: 105, borderRadius: 10, backgroundColor: panel.page },
  check: { position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 6, borderWidth: 2,
           borderColor: '#FFFFFF', backgroundColor: 'rgba(7, 45, 68, 0.35)', alignItems: 'center', justifyContent: 'center' },
  meta: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 15, color: panel.muted },
  action: { fontFamily: fonts.bold, fontSize: 12, color: panel.primary },
});

export const gridStyle = StyleSheet.create({ grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 } });
