import { router } from 'expo-router';

import type { EventItem } from '@/api/events';
import { Tabs } from '@/components/panel/ui';

export type EventTab = 'overview' | 'images' | 'info';

/** "Visão geral · Imagens · Colaboração" — the same shortcut on the event overview and on its images
 *  (17/10/2026). The overview tabs live in the URL (?aba=), so coming back from Imagens lands on the
 *  tab that was clicked. */
export function EventTabs({ event, value }: { event: EventItem; value: EventTab }) {
  const hideCollaboration = event.relation === 'viewer' || event.relation === 'contractor';
  const go = (k: EventTab) => {
    if (k === value) return;
    if (k === 'images') router.navigate(`/eventos/${event.id}/imagens`);
    else router.navigate(`/eventos/${event.id}?aba=${k === 'info' ? 'colaboracao' : 'geral'}`);
  };
  return (
    <Tabs tabs={[{ key: 'overview', label: 'Visão geral' }, { key: 'images', label: 'Imagens' },
                 ...(hideCollaboration ? [] : [{ key: 'info' as const, label: 'Colaboração' }])]}
          value={value} onChange={go} />
  );
}
