import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { getEvent, type EventItem } from '@/api/events';
import { EventForm } from '@/components/panel/EventForm';
import { PageHeader } from '@/components/panel/PageHeader';
import { Card, Notice } from '@/components/panel/ui';
import { TriangleAlert } from 'lucide-react-native';
import { panel } from '@/theme/tokens';

/** Figma "04 — Editar evento". */
export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getEvent(id).then(setEvent).catch((e) => setError(e.message)); }, [id]);

  if (error) return <Notice tone="danger" icon={TriangleAlert} title="Evento indisponível" description={error} />;
  if (!event) return <Card><ActivityIndicator color={panel.primary} /></Card>;
  if (!event.can_manage) {
    // The server refuses anyway (403); the screen just explains why (RF005 note 1).
    return <Notice tone="warning" icon={TriangleAlert} title="Edição restrita"
                   description="Somente o fotógrafo responsável pelo evento e o administrador podem editar o cadastro." />;
  }
  return (
    <>
      <PageHeader crumbs={[{ label: 'Eventos', href: '/eventos' }, { label: event.name, href: `/eventos/${event.id}` }, { label: 'Editar' }]}
                  title="Editar evento" />
      <EventForm event={event} />
    </>
  );
}
