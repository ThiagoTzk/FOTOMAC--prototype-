import { Image } from 'expo-image';
import { router } from 'expo-router';
import { CalendarDays, ChevronRight, Compass, ImageOff } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { publicCoverUrl, type PublicEvent } from '@/api/public';
import { poppins, visitor } from '@/theme/tokens';

import { eventDate, ThemePills } from './ui';

/** "Frame 18": cover 100x100 + name, date, place and themes + chevron. The cover is the
 *  ONLY image of the collection shown without a facial search (RF013 note 2). */
export function EventCard({ event }: { event: PublicEvent }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${event.name}, ${eventDate(event)}, ${event.location}`}
               onPress={() => router.push(`/evento/${event.id}`)}
               style={({ hovered }: any) => [styles.card, hovered && { borderColor: visitor.primary }]}>
      <Cover id={event.id} />
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{event.name}</Text>
        <View style={{ gap: 4 }}>
          <Meta icon="date" text={eventDate(event)} />
          <Meta icon="place" text={event.location} />
        </View>
        <ThemePills names={event.themes.map((t) => t.name)} />
      </View>
      <ChevronRight size={20} color={visitor.heading} strokeWidth={1.8} absoluteStrokeWidth />
    </Pressable>
  );
}

function Cover({ id }: { id: string }) {
  return (
    <View style={styles.cover}>
      <ImageOff size={22} color={visitor.placeholder} strokeWidth={1.6} absoluteStrokeWidth style={{ position: 'absolute' }} />
      <Image source={publicCoverUrl(id)} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
    </View>
  );
}

export function Meta({ icon, text, size = 12 }: { icon: 'date' | 'place'; text: string; size?: number }) {
  const Icon = icon === 'date' ? CalendarDays : Compass;
  return (
    <View style={styles.meta}>
      <Icon size={size + 3} color={visitor.heading} strokeWidth={1.6} absoluteStrokeWidth />
      <Text style={[styles.metaText, { fontSize: size }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: visitor.surface, borderRadius: 12,
          borderWidth: 1, borderColor: visitor.cardBorder, paddingRight: 8, overflow: 'hidden', minHeight: 102 },
  cover: { width: 100, alignSelf: 'stretch', minHeight: 100, backgroundColor: visitor.chip, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 4, paddingVertical: 6 },
  name: { fontFamily: poppins.semiBold, fontSize: 14, color: visitor.text },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { flex: 1, fontFamily: poppins.regular, color: visitor.muted },
});
