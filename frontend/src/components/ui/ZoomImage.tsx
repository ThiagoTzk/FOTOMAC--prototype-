import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export type ZoomImageProps = {
  uri: string;
  /** Small copy shown blurred while the large one loads. */
  placeholder?: string;
  alt: string;
  style?: StyleProp<ViewStyle>;
  /** At 1x, a horizontal swipe asks for the next (1) or previous (-1) photo. */
  onSwipe?: (direction: 1 | -1) => void;
  /** Colour of the zoom buttons: over a dark viewer or a light card. */
  theme?: 'light' | 'dark';
  /** Listen to the + − 0 keys (only one zoomable photo on screen at a time). */
  keyboard?: boolean;
};

/**
 * Native placeholder: the photo, whole. Pinch-to-zoom on the phone app comes with the mobile
 * work (react-native-gesture-handler); the web version is ZoomImage.web.tsx.
 */
export function ZoomImage({ uri, placeholder, alt, style }: ZoomImageProps) {
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <Image source={uri} placeholder={placeholder} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityLabel={alt} />
    </View>
  );
}
