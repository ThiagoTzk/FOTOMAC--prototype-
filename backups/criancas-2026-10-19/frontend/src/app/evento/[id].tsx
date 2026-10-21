import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CalendarClock, CalendarDays, Camera, ChevronDown, ChevronUp, Images, MapPin } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  endVisit, failureReason, getPublicEvent, giveConsent, publicCoverUrl, searchFaces, startCapture, type PublicEvent,
  type ResultItem,
} from '@/api/public';
import { ThemeIcon } from '@/components/icons/themeIcons';
import { GuidedCapture, type Step } from '@/components/capture/GuidedCapture';
import { ConsentModal } from '@/components/visitor/ConsentModal';
import { Meta } from '@/components/visitor/EventCard';
import { VisitorHeader } from '@/components/visitor/Header';
import { PhotoViewer } from '@/components/visitor/PhotoViewer';
import { RemovalModal } from '@/components/visitor/Removal';
import { Results } from '@/components/visitor/Results';
import { SearchCard } from '@/components/visitor/SearchCard';
import { SearchTips } from '@/components/visitor/SearchTips';
import { Column, eventDate, Note, ResponsibleUse, ThemePills, useWide, vtext } from '@/components/visitor/ui';
import { PageBand, web, WebPage, Wrap } from '@/components/visitor/web/Site';
import { poppins, visitor } from '@/theme/tokens';

/**
 * Event page with a PRIVATE gallery (RF014) + facial search (RF015-RF019).
 *
 * No photo of the event is ever listed here before a search — the server would refuse it
 * anyway (RF014 note 1). After the search, only the photos found for THIS visitor appear.
 */
export default function EventPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const [results, setResults] = useState<ResultItem[] | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const [removing, setRemoving] = useState<ResultItem | null>(null);
  const [expanded, setExpanded] = useState(false);
  const consentAnswer = useRef<((ok: boolean) => void) | null>(null);
  const scroll = useRef<ScrollView>(null);
  const resultsY = useRef(0);
  const resultsBox = useRef<View>(null);
  const wide = useWide();

  useEffect(() => {
    getPublicEvent(id).then(setEvent).catch((e) => setNotFound(e.status === 404 ? 'Evento não encontrado ou não está mais disponível.' : e.message));
  }, [id]);

  // The result exists only while this page is ON SCREEN. Entering ends any previous visit;
  // leaving (back, home, menu, another event) ends this one — on the server AND in this page's
  // memory. Focus, not mount: the router may keep a left screen alive underneath the next one,
  // and coming back would show the old photos. On a shared computer the next person must never
  // see someone else's photos (RF014, RS001).
  useFocusEffect(useCallback(() => {
    endVisit();
    return () => {
      endVisit();
      setResults(null);
      setSelfie(null);
      setConsented(false);
      setViewer(null);
      setRemoving(null);
      setCameraOpen(false);
      setSearchError(null);
    };
    // "id": opening ANOTHER event in this same screen also starts a clean visit.
  }, [id])); // eslint-disable-line react-hooks/exhaustive-deps

  // Closing or reloading the tab also ends the visit.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    window.addEventListener('pagehide', endVisit);
    return () => window.removeEventListener('pagehide', endVisit);
  }, []);

  // The preview of the frontal frame exists only in this page's memory; it is released when leaving.
  useEffect(() => () => { if (selfie) URL.revokeObjectURL(selfie); }, [selfie]);

  function askConsent() {
    setConsentOpen(true);
    return new Promise<boolean>((resolve) => { consentAnswer.current = resolve; });
  }
  function answerConsent(ok: boolean) {
    setConsentOpen(false);
    consentAnswer.current?.(ok);
    consentAnswer.current = null;
  }

  function openCapture() {
    setSearchError(null);
    setCameraOpen(true);
  }

  /** The order of the movements comes from the server, asked when "Começar" is pressed (RF036). */
  async function getOrder(): Promise<Step[]> {
    try {
      return (await startCapture(id)).order;
    } catch (e) {
      if (failureReason(e) === 'consent_required') {  // the visit expired: close and ask the consent again
        setConsented(false);
        setCameraOpen(false);
        setSearchError(e instanceof Error ? e.message : 'Confirme o aviso de permissão novamente.');
      }
      throw e;
    }
  }

  async function search(frames: Blob[], steps: Step[]) {
    setCameraOpen(false);
    setBusy(true);
    setSearchError(null);
    const front = frames[steps.indexOf('frente')];
    setSelfie(front ? URL.createObjectURL(front) : null);
    try {
      const r = await searchFaces(id, frames, steps);
      setResults(r.items);
      setTimeout(() => {
        // Web layout: the results sit deep inside the page's bands, so the browser itself scrolls
        // to them (a ScrollView offset would be relative to the wrong parent).
        if (wide && Platform.OS === 'web') (resultsBox.current as unknown as HTMLElement | null)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
        else scroll.current?.scrollTo({ y: Math.max(0, resultsY.current - 16), animated: true });
      }, 50);
    } catch (e) {
      if (failureReason(e) === 'consent_required') setConsented(false); // session expired: ask again
      setSearchError(e instanceof Error ? e.message : 'Não foi possível concluir a busca.');
    } finally {
      setBusy(false);
    }
  }

  if (notFound && wide) {
    return (
      <WebPage>
        <PageBand crumbs={[{ label: 'Eventos', href: '/explorar' }, { label: 'Evento' }]} title="Evento indisponível" />
        <Wrap style={{ paddingVertical: 48 }}><Note tone="danger">{notFound}</Note></Wrap>
      </WebPage>
    );
  }
  if (notFound) {
    return (
      <View style={styles.page}>
        <VisitorHeader back="/" />
        <Column style={{ marginTop: 32 }}><Note tone="danger">{notFound}</Note></Column>
      </View>
    );
  }
  if (!event) return <View style={[styles.page, { justifyContent: 'center' }]}><ActivityIndicator color={visitor.primary} /></View>;

  const longText = event.description.length > 220;
  const photos = event.photos === 1 ? '1 foto' : `${event.photos} fotos`;
  const until = event.expires_on.split('-').reverse().join('/');
  const modals = (
    <>
      <ConsentModal visible={consentOpen} hasMinors={event.has_minors} onClose={() => answerConsent(false)}
                    onAccept={async () => { await giveConsent(id); setConsented(true); answerConsent(true); }} />
      <GuidedCapture visible={cameraOpen} variant="search" getOrder={getOrder} aside={<SearchTips />}
                     onClose={() => setCameraOpen(false)} onDone={search} />
      <PhotoViewer items={results ?? []} index={viewer} eventName={event.name} eventDate={event.date_label} onIndex={setViewer}
                   onRemove={(item) => { setViewer(null); setRemoving(item); }} />
      <RemovalModal item={removing} fallbackDate={event.date_label} onClose={() => setRemoving(null)}
                    onRemoved={(rid) => setResults((r) => r?.filter((x) => x.id !== rid) ?? null)} />
    </>
  );

  if (wide) {
    return (
      <WebPage scrollRef={scroll}>
        <PageBand crumbs={[{ label: 'Eventos', href: '/explorar' }, { label: event.name }]}>
          <View style={styles.webEvent}>
            {/* The cover is the only photo of the event shown before a search (RF013 note 2). */}
            <View style={styles.webCover}>
              <Image source={publicCoverUrl(event.id)} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
            </View>
            <View style={{ flex: 1, gap: 14 }}>
              <Text style={styles.webName} accessibilityRole="header">{event.name}</Text>
              {event.themes.length > 0 && (
                <View style={styles.chips}>
                  {event.themes.map((t) => (
                    <View key={t.id} style={styles.webTheme}>
                      <ThemeIcon name={t.icon} size={15} color={web.yellow} strokeWidth={1.8} absoluteStrokeWidth />
                      <Text style={styles.webThemeText}>{t.name}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={{ gap: 8 }}>
                <WebMeta icon={CalendarDays} text={eventDate(event)} />
                <WebMeta icon={MapPin} text={event.location} />
                <WebMeta icon={Images} text={photos} />
                {/* RF014 note 3: who covered the event, and the institution. */}
                <WebMeta icon={Camera} text={`${event.credits.join(', ')} — CESMAC`} />
                {/* RF022 note 5: the retention actually practised, from the event's own expiry date. */}
                <WebMeta icon={CalendarClock} text={`Fotos disponíveis até ${until}`} />
              </View>
            </View>
          </View>
        </PageBand>
        <Wrap style={{ paddingVertical: 48, gap: 32 }}>
          <View style={styles.webRow}>
            <View style={{ flex: 1, gap: 16, maxWidth: 560 }}>
              <SearchCard consented={consented} askConsent={askConsent} onStart={openCapture} busy={busy} />
              {searchError && <Note tone="danger">{searchError}</Note>}
            </View>
            <View style={{ flex: 1, gap: 16 }}>
              {!!event.description && (
                <View style={styles.webAbout}>
                  <Text style={vtext.h3}>Sobre o evento</Text>
                  <Text style={[styles.description, { fontSize: 14, lineHeight: 23 }]}>{event.description}</Text>
                </View>
              )}
              {results === null && <ResponsibleUse />}
            </View>
          </View>
          {results !== null && (
            <View ref={resultsBox} style={{ scrollMarginTop: 24 } as object}>
              <Results items={results} selfie={selfie} onOpen={setViewer} />
            </View>
          )}
        </Wrap>
        {modals}
      </WebPage>
    );
  }

  return (
    <ScrollView ref={scroll} style={styles.page} contentContainerStyle={{ paddingBottom: 48 }}>
      <VisitorHeader back="/" />
      <View style={styles.cover}>
        <Image source={publicCoverUrl(event.id)} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      </View>
      <View style={styles.info}>
        <Column style={{ gap: 8, paddingVertical: 16 }}>
          <View style={{ gap: 4 }}>
            <Text style={styles.name} accessibilityRole="header">{event.name}</Text>
            <ThemePills names={event.themes.map((t) => t.name)} size="md" />
          </View>
          <View style={{ gap: 4 }}>
            <Meta icon="date" text={eventDate(event)} size={13} />
            <Meta icon="place" text={event.location} size={13} />
          </View>
          <View style={styles.chips}>
            <View style={styles.chip}>
              <Images size={16} color={visitor.heading} strokeWidth={1.6} absoluteStrokeWidth />
              <Text style={styles.chipText}>{photos}</Text>
            </View>
            {/* RF014 note 3: who covered the event, and the institution. */}
            <View style={styles.chip}>
              <Camera size={16} color={visitor.heading} strokeWidth={1.6} absoluteStrokeWidth />
              <Text style={styles.chipText}>{event.credits.join(', ')} — CESMAC</Text>
            </View>
          </View>
          {!!event.description && (
            <View>
              <Text style={styles.about}>Sobre o evento</Text>
              <Text style={styles.description} numberOfLines={longText && !expanded ? 4 : undefined}>{event.description}</Text>
              {longText && (
                <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Mostrar menos' : 'Mostrar mais'}
                           onPress={() => setExpanded((x) => !x)} style={{ alignSelf: 'center', padding: 4 }}>
                  {expanded ? <ChevronUp size={24} color={visitor.heading} strokeWidth={1.6} absoluteStrokeWidth />
                    : <ChevronDown size={24} color={visitor.heading} strokeWidth={1.6} absoluteStrokeWidth />}
                </Pressable>
              )}
            </View>
          )}
          {/* RF022 note 5: the retention actually practised, from the event's own expiry date. */}
          <Text style={vtext.small}>Fotos disponíveis até {until}.</Text>
        </Column>
      </View>

      <Column style={{ gap: 16, marginTop: 24 }}>
        <SearchCard consented={consented} askConsent={askConsent} onStart={openCapture} busy={busy} />
        {searchError && <Note tone="danger">{searchError}</Note>}
        {results === null && <ResponsibleUse />}
        {results !== null && (
          <View onLayout={(e) => { resultsY.current = e.nativeEvent.layout.y; }} style={{ marginTop: 8 }}>
            <Results items={results} selfie={selfie} onOpen={setViewer} />
          </View>
        )}
      </Column>

      {modals}
    </ScrollView>
  );
}

function WebMeta({ icon: Icon, text }: { icon: typeof Camera; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Icon size={18} color={web.yellow} strokeWidth={1.7} absoluteStrokeWidth />
      <Text style={styles.webMeta}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: visitor.page },
  cover: { height: 120, backgroundColor: '#D9D9D9' },
  info: { backgroundColor: visitor.surface, boxShadow: visitor.headerShadow },
  name: { fontFamily: poppins.bold, fontSize: 20, color: visitor.heading },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12,
          backgroundColor: visitor.chip },
  chipText: { fontFamily: poppins.regular, fontSize: 12, color: visitor.muted },
  about: { fontFamily: poppins.semiBold, fontSize: 13, color: visitor.text },
  webEvent: { flexDirection: 'row', gap: 40, alignItems: 'center', marginTop: 24 },
  webCover: { width: 440, aspectRatio: 16 / 11, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)',
              boxShadow: '0px 16px 40px rgba(0,0,0,0.25)' },
  webName: { fontFamily: poppins.bold, fontSize: 34, lineHeight: 42, color: '#FFFFFF' },
  webTheme: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999,
              backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  webThemeText: { fontFamily: poppins.medium, fontSize: 13, color: '#FFFFFF' },
  webMeta: { flex: 1, fontFamily: poppins.regular, fontSize: 15, color: 'rgba(255,255,255,0.9)' },
  webRow: { flexDirection: 'row', gap: 32, alignItems: 'flex-start', zIndex: 5 },
  webAbout: { backgroundColor: visitor.surface, borderRadius: 12, padding: 20, gap: 8, boxShadow: visitor.cardShadow },
  description: { fontFamily: poppins.regular, fontSize: 12, lineHeight: 18, color: visitor.muted, textAlign: 'justify' },
});
