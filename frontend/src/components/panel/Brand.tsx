import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, panel } from '@/theme/tokens';

/**
 * "Marca FOTOMAC" of the sidebar, read from the .fig file:
 * - symbol: the PNG cropped to the window the Figma layer shows (paint transform), 47.3 x 32;
 * - wordmark: ONE text layer with per-character styles — "FOTO" Montserrat Regular and
 *   "MAC" Montserrat ExtraBold, 19.48 px.
 * The visitor screens use the same mark at 35 x 24 / 14.6 px ("small"); the web site's top bar a
 * larger one ("large", 40 px high) — the camera symbol is the face of the system.
 */
export function Brand({ small, large }: { small?: boolean; large?: boolean }) {
  const k = small ? 24 / 32 : large ? 40 / 32 : 1;
  return (
    <View style={[styles.row, small && { paddingHorizontal: 0, height: 24, gap: 4.17 }, large && { paddingHorizontal: 0, height: 40, gap: 7 }]}
          accessibilityRole="header" accessibilityLabel="FOTOMAC">
      <Image source={require('@/assets/images/fotomac-symbol.png')} style={{ width: 47.3 * k, height: 32 * k }}
             contentFit="fill" accessibilityIgnoresInvertColors />
      <Text style={[styles.word, small && { fontSize: 14.61 }, large && { fontSize: 19.48 * k }]}>
        FOTO<Text style={styles.wordBold}>MAC</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5.57, paddingHorizontal: 8, height: 32 },
  word: { fontFamily: fonts.brandRegular, fontSize: 19.48, color: panel.primary },
  wordBold: { fontFamily: fonts.brandBold },
});
