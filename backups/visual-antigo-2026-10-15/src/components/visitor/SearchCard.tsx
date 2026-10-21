import { Aperture, ChevronDown, ImageDown, ScanFace } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { poppins, visitor } from '@/theme/tokens';

import { Backdrop, Note, vtext } from './ui';

export type Source = 'camera' | 'gallery';

type Props = {
  consented: boolean;
  /** Shows the "Permissão para uso de imagem"; resolves true after "Estou ciente". */
  askConsent: () => Promise<boolean>;
  onPick: (source: Source) => void;
  busy: boolean;
};

/**
 * "Procure suas fotos" card of the event page (Figma "Frame 63").
 *
 * v1.6 adaptation: the Figma card says "Ao prosseguir, você aceita..." — a tacit acceptance,
 * forbidden by RF015 note 5 (LGPD Art. 8 §1). Here "Buscar minhas fotos" first shows the
 * permission notice; only after "Estou ciente" do the camera / gallery options appear.
 */
export function SearchCard({ consented, askConsent, onPick, busy }: Props) {
  const [open, setOpen] = useState(false);

  async function press() {
    if (open) return setOpen(false);
    if (consented || (await askConsent())) setOpen(true);
  }

  function pick(source: Source) {
    setOpen(false);
    onPick(source); // called inside the click: the browser only opens the file chooser on a gesture
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
          Antes de abrir a câmera ou a galeria, você verá o aviso de permissão para uso de imagem. Seu autorretrato
          serve só para esta busca e é descartado logo depois.
        </Note>
      </View>
      <View style={{ zIndex: 5, alignSelf: 'flex-start' }}>
        {open && <Backdrop onPress={() => setOpen(false)} />}
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open, busy }} disabled={busy} onPress={press}
                   style={({ hovered }: any) => [styles.button, hovered && { opacity: 0.9 }]}>
          {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
          <Text style={styles.buttonText}>{busy ? 'Buscando suas fotos…' : 'Buscar minhas fotos'}</Text>
          {!busy && <ChevronDown size={20} color="#FFFFFF" strokeWidth={1.8} absoluteStrokeWidth />}
        </Pressable>
        {open && (
          <View style={styles.menu} accessibilityRole="menu">
            <Option icon="camera" title="Tirar foto" hint="Use a câmera do seu dispositivo" onPress={() => pick('camera')} />
            <Option icon="gallery" title="Realizar upload" hint="Selecione uma foto da galeria" onPress={() => pick('gallery')} />
          </View>
        )}
      </View>
    </View>
  );
}

function Option({ icon, title, hint, onPress }: { icon: Source; title: string; hint: string; onPress: () => void }) {
  const Icon = icon === 'camera' ? Aperture : ImageDown;
  return (
    <Pressable accessibilityRole="menuitem" onPress={onPress}
               style={({ hovered }: any) => [styles.option, hovered && { backgroundColor: visitor.page }]}>
      <View style={[styles.optionIcon, { backgroundColor: icon === 'camera' ? 'rgba(0, 125, 197, 0.40)' : 'rgba(255, 205, 11, 0.20)' }]}>
        <Icon size={20} color={visitor.heading} strokeWidth={1.6} absoluteStrokeWidth />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionHint}>{hint}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: visitor.surface, borderRadius: 12, padding: 16, gap: 12, boxShadow: visitor.cardShadow, zIndex: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, borderRadius: 12,
            backgroundColor: visitor.primary },
  buttonText: { fontFamily: poppins.regular, fontSize: 14, color: '#FFFFFF' },
  menu: { position: 'absolute', top: 42, left: 0, width: 224, backgroundColor: visitor.surface, borderRadius: 12, padding: 8,
          gap: 4, boxShadow: visitor.menuShadow },
  option: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, borderRadius: 8 },
  optionIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  optionTitle: { fontFamily: poppins.semiBold, fontSize: 12, color: visitor.text },
  optionHint: { fontFamily: poppins.regular, fontSize: 10, color: visitor.text },
});
