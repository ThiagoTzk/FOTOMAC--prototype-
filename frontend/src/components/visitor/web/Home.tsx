import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  CalendarCheck, CalendarDays, CalendarSearch, Camera, CameraOff, ChevronLeft, ChevronRight, Download, ImageOff, Images,
  LayoutGrid, Lock, MapPin, ScanFace, ShieldCheck, Trash, type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { listPublicThemes, publicCoverUrl, type PublicEvent, type PublicFilters, type Theme } from '@/api/public';
import { ThemeIcon } from '@/components/icons/themeIcons';
import { VisitorFilters } from '@/components/visitor/Filters';
import { eventDate, Note } from '@/components/visitor/ui';
import { poppins, visitor } from '@/theme/tokens';

import { web, Wrap } from './Site';

/** Blue band of the home: headline, the big event search and the filters. No faces here — the
 *  only photos of people a visitor ever sees are the ones found for THEM (RF014). */
export function Hero({ filters, onFilters, onSearch, onSeeAll }: {
  filters: PublicFilters; onFilters: (f: PublicFilters) => void; onSearch: () => void; onSeeAll: () => void;
}) {
  return (
    <View style={styles.hero}>
      <Wrap style={{ paddingTop: 72, paddingBottom: 64 }}>
        <View style={styles.scan} aria-hidden>
          <View style={[styles.corner, { left: 0, top: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 26 }]} />
          <View style={[styles.corner, { right: 0, top: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 26 }]} />
          <View style={[styles.corner, { left: 0, bottom: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 26 }]} />
          <View style={[styles.corner, { right: 0, bottom: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 26 }]} />
          <ScanFace size={150} color="rgba(255,255,255,0.9)" strokeWidth={1.2} absoluteStrokeWidth={false} />
          <View style={styles.scanTag}><Text style={styles.scanTagText}>Só as suas fotos</Text></View>
        </View>
        <View style={styles.eyebrow}>
          <Camera size={16} color={web.yellow} strokeWidth={1.8} absoluteStrokeWidth />
          <Text style={styles.eyebrowText}>ACERVO FOTOGRÁFICO OFICIAL DO CESMAC</Text>
        </View>
        <Text style={styles.h1} accessibilityRole="header">Participou de um evento do CESMAC? Encontre suas fotos.</Text>
        <Text style={styles.lead}>Escolha o evento, mostre o rosto para a câmera e veja apenas as fotos em que você aparece.</Text>
        <View style={{ marginTop: 34, maxWidth: 900, zIndex: 30 }}>
          <VisitorFilters value={filters} onChange={onFilters} variant="hero" onSubmit={onSearch} />
        </View>
        <Text style={styles.help}>
          Não sabe o nome do evento?{' '}
          <Text accessibilityRole="link" onPress={onSeeAll} style={styles.helpLink}>Veja todos os eventos</Text>
        </Text>
      </Wrap>
    </View>
  );
}

/**
 * The themes (tags) as browsing shortcuts, each with the symbol its creator chose. It scrolls
 * sideways — with arrows — so it never breaks however many tags the photographers create.
 */
export function ThemeStrip({ selected, onSelect }: { selected: number[]; onSelect: (ids: number[]) => void }) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const rail = useRef<ScrollView>(null);
  const x = useRef(0);
  useEffect(() => { listPublicThemes().then(setThemes).catch(() => undefined); }, []);
  const scroll = (d: number) => rail.current?.scrollTo({ x: Math.max(0, x.current + d), animated: true });
  if (!themes.length) return null;
  // "Todos" uses the grid symbol; every theme, the symbol its creator chose.
  const items: { id: number | null; name: string; icon: string | null }[] = [
    { id: null, name: 'Todos', icon: null }, ...themes.map((t) => ({ id: t.id, name: t.name, icon: t.icon })),
  ];
  return (
    <View style={styles.strip} accessibilityLabel="Temas">
      <Wrap style={{ paddingVertical: 18 }}>
        <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} onScroll={(e) => { x.current = e.nativeEvent.contentOffset.x; }}
                    scrollEventThrottle={32} contentContainerStyle={{ gap: 8, paddingHorizontal: 44 }}>
          {items.map(({ id, name, icon }, i) => {
            const on = id === null ? selected.length === 0 : selected.length === 1 && selected[0] === id;
            const tint = i % 2 ? visitor.pills[1] : visitor.pills[0];
            return (
              <Pressable key={name} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Tema ${name}`}
                         onPress={() => onSelect(id === null || on ? [] : [id])}
                         style={({ hovered }: any) => [styles.theme, hovered && !on && { backgroundColor: visitor.page }, on && styles.themeOn]}>
                <View style={[styles.themeIcon, { backgroundColor: tint.bg }]}>
                  {icon === null
                    ? <LayoutGrid size={24} color={visitor.primary} strokeWidth={1.7} absoluteStrokeWidth />
                    : <ThemeIcon name={icon} size={24} color={i % 2 ? '#A88406' : visitor.primary} strokeWidth={1.7} absoluteStrokeWidth />}
                </View>
                <Text style={[styles.themeText, on && { color: visitor.primary, fontFamily: poppins.semiBold }]} numberOfLines={2}>{name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Arrow side="left" onPress={() => scroll(-480)} />
        <Arrow side="right" onPress={() => scroll(480)} />
      </Wrap>
    </View>
  );
}

function Arrow({ side, onPress }: { side: 'left' | 'right'; onPress: () => void }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <>
      <View pointerEvents="none" style={[styles.fade, side === 'left' ? { left: 32, backgroundImage: 'linear-gradient(90deg, #fff 45%, rgba(255,255,255,0))' }
                                                                      : { right: 32, backgroundImage: 'linear-gradient(270deg, #fff 45%, rgba(255,255,255,0))' }] as never} />
      <Pressable accessibilityRole="button" accessibilityLabel={side === 'left' ? 'Temas anteriores' : 'Mais temas'} onPress={onPress}
                 style={({ hovered }: any) => [styles.arrow, side === 'left' ? { left: 28 } : { right: 28 }, hovered && { borderColor: visitor.primary }]}>
        <Icon size={20} color={visitor.heading} strokeWidth={1.8} absoluteStrokeWidth />
      </Pressable>
    </>
  );
}

/** Vertical event card (cover, photo count, the main theme's symbol, name, date, place, tags). The
 *  cover is the ONLY photo of the collection shown without a facial search (RF013 note 2). */
export function EventTile({ event }: { event: PublicEvent }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${event.name}, ${eventDate(event)}, ${event.location}`}
               onPress={() => router.push(`/evento/${event.id}`)}
               style={({ hovered }: any) => [styles.card, hovered && styles.cardHover]}>
      <View style={styles.cover}>
        <ImageOff size={28} color={visitor.placeholder} strokeWidth={1.4} absoluteStrokeWidth style={{ position: 'absolute' }} />
        <Image source={publicCoverUrl(event.id)} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        {event.themes.length > 0 && <View style={styles.badge}><ThemeIcon name={event.themes[0].icon} size={18} color={visitor.primary} strokeWidth={1.8} absoluteStrokeWidth /></View>}
        <View style={styles.count}>
          <Images size={14} color="#FFFFFF" strokeWidth={1.8} absoluteStrokeWidth />
          <Text style={styles.countText}>{event.photos === 1 ? '1 foto' : `${event.photos} fotos`}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{event.name}</Text>
        <View style={styles.meta}><CalendarDays size={16} color={visitor.primary} strokeWidth={1.7} absoluteStrokeWidth /><Text style={styles.metaText} numberOfLines={1}>{eventDate(event)}</Text></View>
        <View style={styles.meta}><MapPin size={16} color={visitor.primary} strokeWidth={1.7} absoluteStrokeWidth /><Text style={styles.metaText} numberOfLines={1}>{event.location}</Text></View>
        <View style={styles.pills}>
          {event.themes.map((t, i) => (
            <View key={t.id} style={[styles.pill, { backgroundColor: visitor.pills[i % 2].bg }]}>
              <Text style={[styles.pillText, { color: i % 2 ? '#A88406' : visitor.primary }]}>{t.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

export function EventGrid({ items, loading, error, empty }: { items: PublicEvent[]; loading: boolean; error: string | null; empty: string }) {
  const { width } = useWindowDimensions();
  const perRow = width >= 1200 ? 4 : 3;
  if (error) return <Note tone="danger">{error}</Note>;
  if (!items.length && loading) return <ActivityIndicator color={visitor.primary} style={{ marginVertical: 40 }} />;
  if (!items.length) return <Text style={styles.empty}>{empty}</Text>;
  return (
    <View style={styles.grid}>
      {items.map((e) => <View key={e.id} style={{ width: `${100 / perRow}%`, padding: 12 }}><EventTile event={e} /></View>)}
    </View>
  );
}

export function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={styles.head}>
      <View style={{ flex: 1 }}>
        <Text style={styles.h2} accessibilityRole="header">{title}</Text>
        {!!sub && <Text style={styles.sub}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

export function HowItWorks() {
  const steps: [LucideIcon, string, string][] = [
    [CalendarSearch, 'Escolha o evento', 'Pesquise pelo nome ou navegue pelos temas e pela data.'],
    [ScanFace, 'Mostre o rosto', 'Uma captura rápida, seguindo os movimentos da tela. Serve só para esta busca e é descartada logo depois. Antes, você lê e aceita o aviso de uso de imagem.'],
    [Download, 'Baixe suas fotos', 'Veja apenas as fotos em que você aparece e baixe na resolução original, com o crédito do fotógrafo e a marca do CESMAC.'],
  ];
  return (
    <View style={{ backgroundColor: visitor.surface }}>
      <Wrap style={{ paddingVertical: 56 }}>
        <SectionTitle title="Como funciona" sub="Três passos, sem criar conta." />
        <View style={styles.steps}>
          {steps.map(([Icon, t, d], i) => (
            <View key={t} style={styles.step}>
              <View style={styles.stepIcon}>
                <Icon size={26} color={visitor.primary} strokeWidth={1.7} absoluteStrokeWidth />
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
              </View>
              <View style={{ flex: 1, gap: 4 }}><Text style={styles.stepTitle}>{t}</Text><Text style={styles.stepText}>{d}</Text></View>
            </View>
          ))}
        </View>
      </Wrap>
    </View>
  );
}

/** What the system really does with faces (RF022, LGPD Art. 5º II) — each line is a rule in the code. */
export function PrivacyBand() {
  const facts: [LucideIcon, string, string][] = [
    [Lock, 'Galeria privada', 'As fotos de um evento só aparecem para quem foi encontrado nelas.'],
    [CameraOff, 'Selfie nunca guardada', 'Compara, mostra o resultado e descarta.'],
    [CalendarCheck, 'Busca só no evento', 'Nunca no acervo inteiro da instituição.'],
    [Trash, 'Remoção em até 72 h', 'Peça a remoção de uma foto sua a qualquer momento.'],
  ];
  return (
    <View style={{ backgroundColor: web.navy }}>
      <Wrap style={styles.privacy}>
        <View style={{ flex: 1.1 }}>
          <Text style={styles.privacyTitle}>Suas fotos aparecem <Text style={{ color: web.yellow }}>só para você</Text>.</Text>
          <Text style={styles.privacyText}>
            O rosto é dado pessoal sensível pela LGPD. Por isso o FOTOMAC foi desenhado para que ninguém veja a galeria inteira
            de um evento — nem a sua foto de busca.
          </Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/privacidade')}
                     style={({ hovered }: any) => [styles.yellowButton, hovered && { opacity: 0.9 }]}>
            <ShieldCheck size={18} color={web.navy} strokeWidth={1.8} absoluteStrokeWidth />
            <Text style={styles.yellowButtonText}>Política de Privacidade</Text>
          </Pressable>
        </View>
        <View style={styles.facts}>
          {facts.map(([Icon, t, d]) => (
            <View key={t} style={styles.fact}>
              <View style={styles.factIcon}><Icon size={20} color={web.yellow} strokeWidth={1.7} absoluteStrokeWidth /></View>
              <Text style={styles.factTitle}>{t}</Text>
              <Text style={styles.factText}>{d}</Text>
            </View>
          ))}
        </View>
      </Wrap>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { zIndex: 20, backgroundImage: `radial-gradient(1200px 500px at 85% -10%, rgba(68,200,245,.35), transparent 60%), linear-gradient(120deg, ${web.navy} 0%, ${web.navy2} 45%, ${visitor.primary} 100%)` } as object,
  scan: { position: 'absolute', right: 32, top: 0, bottom: 0, marginVertical: 'auto', width: 280, height: 280, alignItems: 'center',
          justifyContent: 'center', opacity: 0.9 } as object,
  corner: { position: 'absolute', width: 70, height: 70, borderWidth: 5, borderColor: 'rgba(255,255,255,0.55)' },
  scanTag: { position: 'absolute', bottom: -14, backgroundColor: web.yellow, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999,
             boxShadow: '0px 8px 20px rgba(0,0,0,0.25)' },
  scanTagText: { fontFamily: poppins.bold, fontSize: 13, color: web.navy },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrowText: { fontFamily: poppins.semiBold, fontSize: 13, letterSpacing: 0.5, color: web.yellow },
  h1: { fontFamily: poppins.bold, fontSize: 46, lineHeight: 53, color: '#FFFFFF', maxWidth: 760, marginTop: 14 },
  lead: { fontFamily: poppins.regular, fontSize: 18, lineHeight: 29, color: 'rgba(255,255,255,0.85)', maxWidth: 720, marginTop: 14 },
  help: { fontFamily: poppins.regular, fontSize: 14, color: 'rgba(255,255,255,0.85)', marginTop: 14 },
  helpLink: { fontFamily: poppins.semiBold, color: '#FFFFFF', textDecorationLine: 'underline' },
  strip: { backgroundColor: visitor.surface, borderBottomWidth: 1, borderBottomColor: web.line, zIndex: 1 },
  theme: { minWidth: 104, maxWidth: 160, alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14 },
  themeOn: { backgroundColor: web.softBlue },
  themeIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  themeText: { fontFamily: poppins.medium, fontSize: 13, lineHeight: 17, color: visitor.muted, textAlign: 'center' },
  arrow: { position: 'absolute', top: '50%', marginTop: -20, width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF',
           borderWidth: 1, borderColor: web.line, boxShadow: '0px 2px 8px rgba(0,0,0,0.12)', alignItems: 'center', justifyContent: 'center' },
  fade: { position: 'absolute', top: 0, bottom: 0, width: 70 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', boxShadow: web.cardShadow, flex: 1 },
  cardHover: { boxShadow: web.cardShadowHover, transform: [{ translateY: -3 }] },
  cover: { aspectRatio: 16 / 11, backgroundColor: visitor.chip, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', left: 12, top: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.95)',
           alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(0,0,0,0.15)' },
  count: { position: 'absolute', right: 12, bottom: 12, height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10,
           borderRadius: 8, backgroundColor: 'rgba(7,45,68,0.82)' },
  countText: { fontFamily: poppins.medium, fontSize: 12, color: '#FFFFFF' },
  body: { paddingTop: 16, paddingHorizontal: 18, paddingBottom: 18, gap: 8 },
  title: { fontFamily: poppins.semiBold, fontSize: 15, lineHeight: 21, color: visitor.heading, minHeight: 42 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  metaText: { flex: 1, fontFamily: poppins.regular, fontSize: 13, color: visitor.muted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingTop: 4 },
  pill: { borderRadius: 30, paddingVertical: 3, paddingHorizontal: 10 },
  pillText: { fontFamily: poppins.regular, fontSize: 11 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -12 },
  empty: { fontFamily: poppins.regular, fontSize: 15, color: visitor.muted, textAlign: 'center', paddingVertical: 40 },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  h2: { fontFamily: poppins.semiBold, fontSize: 28, color: visitor.title },
  sub: { fontFamily: poppins.regular, fontSize: 15, color: web.soft, marginTop: 4 },
  steps: { flexDirection: 'row', gap: 32 },
  step: { flex: 1, flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  stepIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: web.softBlue, alignItems: 'center', justifyContent: 'center' },
  stepNum: { position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: web.yellow, alignItems: 'center',
             justifyContent: 'center' },
  stepNumText: { fontFamily: poppins.bold, fontSize: 12, color: web.navy },
  stepTitle: { fontFamily: poppins.semiBold, fontSize: 17, color: visitor.heading },
  stepText: { fontFamily: poppins.regular, fontSize: 14, lineHeight: 22, color: visitor.muted },
  privacy: { flexDirection: 'row', gap: 56, alignItems: 'center', paddingVertical: 64 },
  privacyTitle: { fontFamily: poppins.bold, fontSize: 32, lineHeight: 40, color: '#FFFFFF' },
  privacyText: { fontFamily: poppins.regular, fontSize: 15, lineHeight: 25, color: 'rgba(255,255,255,0.8)', marginTop: 14 },
  yellowButton: { alignSelf: 'flex-start', marginTop: 24, height: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18,
                  borderRadius: 12, backgroundColor: web.yellow },
  yellowButtonText: { fontFamily: poppins.semiBold, fontSize: 15, color: web.navy },
  facts: { flex: 1.4, flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  fact: { width: '48%', flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
          borderRadius: 16, padding: 20, gap: 4 },
  factIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,197,6,0.15)', alignItems: 'center', justifyContent: 'center',
              marginBottom: 8 },
  factTitle: { fontFamily: poppins.semiBold, fontSize: 15, color: '#FFFFFF' },
  factText: { fontFamily: poppins.regular, fontSize: 13, lineHeight: 20, color: 'rgba(255,255,255,0.72)' },
});
