import { ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';

import { getConsentText, type Consent } from '@/api/public';
import { poppins, visitor } from '@/theme/tokens';

import { Note, Sheet, VButton, vtext } from './ui';

type Props = { visible: boolean; onAccept: () => Promise<void>; onClose: () => void };

/**
 * RF015 — "Permissão para uso de imagem", BEFORE any access to the camera or the gallery.
 *
 * The text comes from the server (it is versioned there and the version is what gets
 * recorded). There is no pre-ticked box: the only way forward is pressing "Estou ciente"
 * (LGPD Art. 8 §1 / Art. 11, I — specific and highlighted consent for sensitive data).
 */
export function ConsentModal({ visible, onAccept, onClose }: Props) {
  const [consent, setConsent] = useState<Consent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && !consent) getConsentText().then(setConsent).catch((e) => setError(e.message));
  }, [visible, consent]);

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      await onAccept();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  // Opens the policy in a new tab, so the visitor does not lose their place in the event.
  const openPolicy = () => (Platform.OS === 'web' ? window.open('/privacidade', '_blank', 'noopener') : Linking.openURL('/privacidade'));

  return (
    <Sheet visible={visible} title={consent?.title ?? 'Permissão para uso de imagem'} onClose={onClose} width={420}>
      <View style={styles.icon}><ShieldCheck size={28} color={visitor.primary} strokeWidth={1.6} absoluteStrokeWidth /></View>
      {consent?.paragraphs.map((p) => <Text key={p} style={[vtext.body, { textAlign: 'justify' }]}>{p}</Text>)}
      {consent && (
        <Text style={vtext.small}>
          As fotos deste evento ficam disponíveis por {consent.retention} após a data do evento.{' '}
          <Text style={styles.link} accessibilityRole="link" onPress={openPolicy}>Política de Privacidade e LGPD</Text>
        </Text>
      )}
      {error && <Note tone="danger">{error}</Note>}
      <View style={styles.actions}>
        <VButton label="Agora não" variant="ghost" onPress={onClose} />
        <VButton label="Estou ciente" onPress={accept} loading={saving} disabled={!consent} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  icon: { width: 48, height: 48, borderRadius: 999, backgroundColor: 'rgba(0, 125, 197, 0.10)', alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: poppins.semiBold, color: visitor.primary, textDecorationLine: 'underline' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 4 },
});
