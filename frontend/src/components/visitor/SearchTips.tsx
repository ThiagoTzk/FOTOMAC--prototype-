import { Focus, Glasses, ScanFace, Sun, UserRound, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { poppins, visitor } from '@/theme/tokens';

import { Note } from './ui';

// Each tip matches what the recognition really depends on: the detector needs a sharp, lit,
// frontal face, and with more than one face the LARGEST one is used (face/selection.py).
const TIPS: [LucideIcon, string, string][] = [
  [Sun, 'Lugar bem iluminado', 'Fique de frente para a luz (janela ou lâmpada à sua frente, nunca atrás de você).'],
  [ScanFace, 'Rosto inteiro à mostra', 'Comece olhando para a câmera, com o rosto inteiro dentro do círculo.'],
  [Glasses, 'Nada cobrindo o rosto', 'Óculos (principalmente escuros), máscara, boné, chapéu ou cabelo no rosto atrapalham o reconhecimento.'],
  [UserRound, 'Só você na foto', 'Se outra pessoa aparecer mais perto da câmera, o sistema pode usar o rosto dela.'],
  [Focus, 'Movimentos devagar', 'Siga o bonequinho virando só a cabeça, devagar, com o celular ou o computador parado.'],
];

/** "Dicas para encontrar suas fotos" — shown beside the camera, before the guided capture starts. */
export function SearchTips() {
  return (
    <View style={{ gap: 12 }}>
      <Text style={styles.title}>Dicas para encontrar suas fotos</Text>
      <View style={{ gap: 10 }}>
        {TIPS.map(([Icon, title, text]) => (
          <View key={title} style={styles.tip}>
            <View style={styles.icon}><Icon size={18} color={visitor.primary} strokeWidth={1.8} absoluteStrokeWidth /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.tipTitle}>{title}</Text>
              <Text style={styles.tipText}>{text}</Text>
            </View>
          </View>
        ))}
      </View>
      {/* RF016 note 5: similarity, not identity — said BEFORE the search, not only with the result. */}
      <Note>
        O reconhecimento facial indica semelhança visual, não identidade. Iluminação, óculos, ângulo do rosto e partes
        do rosto cobertas podem afetar o resultado.
      </Note>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: poppins.semiBold, fontSize: 15, color: visitor.heading },
  tip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  icon: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(0, 125, 197, 0.10)', alignItems: 'center',
          justifyContent: 'center' },
  tipTitle: { fontFamily: poppins.semiBold, fontSize: 13, color: visitor.text },
  tipText: { fontFamily: poppins.regular, fontSize: 12, lineHeight: 17, color: visitor.muted },
});
