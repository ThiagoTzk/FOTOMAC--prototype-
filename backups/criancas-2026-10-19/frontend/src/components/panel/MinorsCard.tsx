import { ShieldCheck, Square, SquareCheck, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { authorizeMinors, isoToBr, revokeMinors, type EventItem } from '@/api/events';
import { Modal } from '@/components/panel/Modal';
import { Button, Card, Field, Input, Notice, SectionTitle } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/**
 * Event FOR children (school events, olympiads…): taking part requires the guardians' signed term, which
 * the school or organisation collects beforehand — so every child in it is authorised, and nothing is
 * blurred. The event is published only after the authorisation is registered (LGPD Art. 14 §1).
 * (Blurring is for events NOT meant for children where one appears by chance — see the event page.)
 */
export function MinorsCard({ event, onChange }: { event: EventItem; onChange: (e: EventItem) => void }) {
  const [open, setOpen] = useState(false);
  const [reference, setReference] = useState('');
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const authorized = !!event.minors_authorized_at;

  async function save() {
    setBusy(true); setError(null);
    try { onChange(await authorizeMinors(event.id, reference)); setOpen(false); } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally { setBusy(false); }
  }

  return (
    <Card padding={24} style={{ gap: 12 }}>
      <SectionTitle title="Participantes menores de idade" />
      <Text style={s.text}>
        Imagem de criança e de adolescente é dado pessoal altamente sensível (LGPD, Art. 14). Em evento com crianças, participar
        exige o termo assinado pelos responsáveis, coletado pela escola ou pela organização. O evento só é publicado depois de
        registrada essa autorização.
      </Text>
      {authorized ? (
        <Notice tone="success" icon={ShieldCheck} title={`Autorização prévia dos responsáveis registrada em ${isoToBr(event.minors_authorized_at!.slice(0, 10))}`}
                description={`Termos assinados: ${event.minors_authorization_ref}`} actionLabel={event.can_manage ? 'Revogar' : undefined}
                onAction={() => revokeMinors(event.id).then(onChange).catch((e) => setError(e.message))} />
      ) : (
        <Notice tone="warning" icon={ShieldCheck} title="Obrigatório: autorização prévia dos responsáveis"
                description="A escola ou a organização coleta, antes do evento e como condição de participação, o termo assinado de uso da imagem e da busca facial de cada participante. Você registra aqui onde os termos estão arquivados. Sem isso, o evento não é publicado."
                actionLabel={event.can_manage ? 'Registrar autorização' : undefined} onAction={() => setOpen(true)} />
      )}
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}

      <Modal visible={open} onClose={() => setOpen(false)} icon={ShieldCheck} title="Registrar a autorização dos responsáveis" width={600}>
        <View style={{ gap: 14 }}>
          <Field label="Onde os termos assinados estão arquivados" help="Ex.: Secretaria do Colégio X, pasta OBR 2026. Os termos ficam com a escola ou a organização — o FOTOMAC não os guarda.">
            <Input value={reference} onChangeText={setReference} maxLength={300} accessibilityLabel="Onde os termos estão arquivados" />
          </Field>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: declared }} onPress={() => setDeclared((d) => !d)} style={s.declare}>
            {declared ? <SquareCheck size={22} color={panel.primary} strokeWidth={1.8} absoluteStrokeWidth />
              : <Square size={22} color={panel.muted} strokeWidth={1.8} absoluteStrokeWidth />}
            <Text style={[s.text, { flex: 1 }]}>
              Declaro que a escola ou a organização do evento coletou, como condição de participação, o termo assinado por pelo menos um
              dos pais ou pelo responsável legal de CADA participante menor de 18 anos, com autorização específica e destacada para o uso
              da imagem e para a busca por reconhecimento facial (LGPD, Art. 14 § 1º).
            </Text>
          </Pressable>
          {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
          <View style={s.actions}>
            <Button variant="secondary" label="Cancelar" onPress={() => setOpen(false)} />
            <Button label="Registrar" loading={busy} disabled={!declared || reference.trim().length < 5} onPress={save} />
          </View>
        </View>
      </Modal>
    </Card>
  );
}

const s = StyleSheet.create({
  text: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: panel.muted },
  declare: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 10, backgroundColor: panel.warningSoft },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
});
