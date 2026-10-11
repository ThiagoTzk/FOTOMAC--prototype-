import { CloudUpload } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

/**
 * WEB version of "Área de envio": drag & drop + file chooser. A plain DOM <div> is used for
 * the drag events, which React Native's <View> does not expose — this is why it lives in a
 * .web.tsx file (Expo picks it automatically on the web; the app uses Dropzone.tsx).
 */
export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files)); }}
      style={{ display: 'flex' }}>
      <View style={[styles.zone, over && { backgroundColor: panel.primarySoft }]}>
        <View style={styles.icon}><CloudUpload size={24} color={panel.primary} strokeWidth={1.6} absoluteStrokeWidth /></View>
        <Text style={styles.title}>Arraste suas fotos aqui</Text>
        <Text style={styles.hint}>ou selecione os arquivos do computador</Text>
        <Button variant="secondary" label="Selecionar arquivos" onPress={() => input.current?.click()} />
        <input ref={input} type="file" multiple accept="image/jpeg,.jpg,.jpeg" aria-label="Selecionar arquivos"
               style={{ display: 'none' }}
               onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      </View>
    </div>
  );
}

const styles = StyleSheet.create({
  zone: { flex: 1, height: 230, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: panel.primary, borderStyle: 'dashed',
          borderRadius: panel.cardRadius, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16 },
  icon: { width: 48, height: 48, borderRadius: 999, backgroundColor: panel.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.regular, fontSize: 20, color: panel.text, textAlign: 'center' },
  hint: { fontFamily: fonts.regular, fontSize: 14, color: panel.muted, textAlign: 'center' },
});
