import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Camera, ChevronDown, ChevronUp, Images } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  endVisit, failureReason, getPublicEvent, giveConsent, publicCoverUrl, searchFaces, type PublicEvent, type ResultItem,
} from '@/api/public';
import { CameraCapture } from '@/components/visitor/Camera';
import { ConsentModal } from '@/components/visitor/ConsentModal';
import { Meta } from '@/components/visitor/EventCard';
import { VisitorHeader } from '@/components/visitor/Header';
import { PhotoViewer } from '@/components/visitor/PhotoViewer';
import { pickPhoto, toJpeg } from '@/components/visitor/photo';
import { RemovalModal } from '@/components/visitor/Removal';
import { Results } from '@/components/visitor/Results';
import { SearchCard, type Source } from '@/components/visitor/SearchCard';
import { Column, eventDate, Note, ResponsibleUse, ThemePills, vtext } from '@/components/visitor/ui';
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

  // The selfie preview exists only in this page's memory; it is released when leaving.
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

  function pick(source: Source) {
    setSearchError(null);
    if (source === 'camera') return setCameraOpen(true);
    pickPhoto()
      .then((file) => (file ? toJpeg(file) : null))
      .then((jpeg) => jpeg && search(jpeg))
      .catch((e) => setSearchError(e.message));
  }

  async function search(photo: Blob) {
    setCameraOpen(false);
    setBusy(true);
    setSearchError(null);
    setSelfie(URL.createObjectURL(photo));
    try {
      const r = await searchFaces(id, photo);
      setResults(r.items);
      setTimeout(() => scroll.current?.scrollTo({ y: Math.max(0, resultsY.current - 16), animated: true }), 50);
    } catch (e) {
      if (failureReason(e) === 'consent_required') setConsented(false); // session expired: ask again
      setSearchError(e instanceof Error ? e.message : 'Não foi possível concluir a busca.');
    } finally {
      setBusy(false);
    }
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
              <Text style={styles.chipText}>{event.photos === 1 ? '1 foto' : `${event.photos} fotos`}</Text>
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
          <Text style={vtext.small}>Fotos disponíveis até {event.expires_on.split('-').reverse().join('/')}.</Text>
        </Column>
      </View>

      <Column style={{ gap: 16, marginTop: 24 }}>
        <SearchCard consented={consented} askConsent={askConsent} onPick={pick} busy={busy} />
        {searchError && <Note tone="danger">{searchError}</Note>}
        {results === null && <ResponsibleUse />}
        {results !== null && (
          <View onLayout={(e) => { resultsY.current = e.nativeEvent.layout.y; }} style={{ marginTop: 8 }}>
            <Results items={results} selfie={selfie} onOpen={setViewer} />
          </View>
        )}
      </Column>

      <ConsentModal visible={consentOpen} onClose={() => answerConsent(false)}
                    onAccept={async () => { await giveConsent(id); setConsented(true); answerConsent(true); }} />
      <CameraCapture visible={cameraOpen} onClose={() => setCameraOpen(false)} onCapture={search} />
      <PhotoViewer items={results ?? []} index={viewer} eventName={event.name} eventDate={event.date_label} onIndex={setViewer}
                   onRemove={(item) => { setViewer(null); setRemoving(item); }} />
      <RemovalModal item={removing} fallbackDate={event.date_label} onClose={() => setRemoving(null)}
                    onRemoved={(rid) => setResults((r) => r?.filter((x) => x.id !== rid) ?? null)} />
    </ScrollView>
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
  description: { fontFamily: poppins.regular, fontSize: 12, lineHeight: 18, color: visitor.muted, textAlign: 'justify' },
});
