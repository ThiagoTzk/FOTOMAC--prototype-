import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { listPublicEvents, type PublicEvent, type PublicFilters } from '@/api/public';
import { visitor } from '@/theme/tokens';

import { EventCard } from './EventCard';
import { Note, VButton, vtext } from './ui';

/** Published events, 20 per page (RF013 note 7), loaded page by page with "Carregar mais". */
export function usePublicEvents(filters: PublicFilters) {
  const key = JSON.stringify({ ...filters, page: undefined });
  const current = useRef(key);
  const [state, setState] = useState<{ key: string; items: PublicEvent[]; total: number; page: number } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchPage = (page: number, append: boolean) => {
    listPublicEvents({ ...filters, page })
      .then((r) => {
        if (current.current !== key) return; // an older search answered late: ignore it
        setState((s) => ({ key, total: r.total, page, items: append && s ? [...s.items, ...r.items] : r.items }));
      })
      .catch((e) => setError({ key, message: e.message }))
      .finally(() => setLoadingMore(false));
  };

  useEffect(() => { current.current = key; fetchPage(1, false); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const fresh = state?.key === key ? state : null;
  const failed = error?.key === key ? error.message : null;
  return {
    items: fresh?.items ?? [], total: fresh?.total ?? 0, error: failed,
    loading: (!fresh && !failed) || loadingMore,
    more: fresh && fresh.items.length < fresh.total ? () => { setLoadingMore(true); fetchPage(fresh.page + 1, true); } : null,
  };
}

type Props = { items: PublicEvent[]; loading: boolean; error: string | null; more: (() => void) | null; empty: string };

export function EventList({ items, loading, error, more, empty }: Props) {
  const { width } = useWindowDimensions();
  // One card per row on phones, two on tablets, three on a computer.
  const perRow = width >= 1100 ? 3 : width >= 760 ? 2 : 1;
  if (error) return <Note tone="danger">{error}</Note>;
  if (!items.length && loading) return <ActivityIndicator color={visitor.primary} style={{ marginTop: 24 }} />;
  if (!items.length) return <Text style={[vtext.body, styles.empty]}>{empty}</Text>;
  return (
    <View style={{ gap: 20 }}>
      <View style={styles.grid}>
        {items.map((e) => <View key={e.id} style={{ width: `${100 / perRow}%`, padding: 6 }}><EventCard event={e} /></View>)}
      </View>
      {more && <View style={{ alignItems: 'center' }}><VButton label="Carregar mais eventos" variant="ghost" onPress={more} loading={loading} /></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', margin: -6 },
  empty: { textAlign: 'center', color: visitor.muted, paddingVertical: 24 },
});
