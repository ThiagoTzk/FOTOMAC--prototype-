import { ScanFace } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { poppins, visitor } from '@/theme/tokens';

import { Note, vtext } from './ui';

type Props = {
  consented: boolean;
  /** Shows the "Permissão para uso de imagem"; resolves true after "Estou ciente". */
  askConsent: () => Promise<boolean>;
  /** Opens the guided capture. */
  onStart: () => void;
  busy: boolean;
};

/**
 * "Procure suas fotos" card of the event page (Figma "Frame 63").
 *
 * v1.6 adaptation: the Figma card says "Ao prosseguir, você aceita..." — a tacit acceptance,
 * forbidden by RF015 note 5 (LGPD Art. 8 §1). Here "Buscar minhas fotos" first shows the
 * permission notice; only after "Estou ciente" does the camera open.
 *
 * v2.0: the search is made ONLY with the camera, by the guided capture with liveness check (RF036).
 * The "Realizar upload" option is gone: a photo from the gallery could be anyone's photo.
 */
export function SearchCard({ consented, askConsent, onStart, busy }: Props) {
  async function press() {
    if (consented || (await askConsent())) onStart();
  }

  return (
    <View style={styles.card}>
      <View>
        <Text style={vtext.h3}>Procure suas fotos</Text>
        <Text style={[vtext.h4, { marginTop: 2 }]}>Galeria privada</Text>
        <Text style={[vtext.small, { textAlign: 'justify' }]}>
          A galeria desse evento é privada e para você poder visualizar suas fotos você precisa realizar uma busca no
          campo abaixo.
        </Text>
      </View>
      <View style={{ gap: 4 }}>
        <View style={styles.row}>
          <ScanFace size={36} color={visitor.primary} strokeWidth={1.5} absoluteStrokeWidth />
          <Text style={vtext.h3}>Reconhecimento facial</Text>
        </View>
        <Note>
          Antes de abrir a câmera, você verá o aviso de permissão para uso de imagem. A busca usa uma captura rápida do seu
          rosto, seguindo os movimentos indicados na tela; nenhum vídeo é gravado e os quadros são apagados logo depois.
        </Note>
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ busy }} disabled={busy} onPress={press}
                 style={({ hovered }: any) => [styles.button, hovered && { opacity: 0.9 }]}>
        {busy ? <ActivityIndicator size="small" color="#FFFFFF" />
          : <ScanFace size={20} color="#FFFFFF" strokeWidth={1.8} absoluteStrokeWidth />}
        <Text style={styles.buttonText}>{busy ? 'Buscando suas fotos…' : 'Buscar minhas fotos'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: visitor.surface, borderRadius: 12, padding: 16, gap: 12, boxShadow: visitor.cardShadow, zIndex: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { height: 38, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12,
            borderRadius: 12, backgroundColor: visitor.primary },
  buttonText: { fontFamily: poppins.regular, fontSize: 14, color: '#FFFFFF' },
});
