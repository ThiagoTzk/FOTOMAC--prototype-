import { Text } from 'react-native';

/**
 * Native placeholder: the institutional term is signed on the web page opened from the e-mail link.
 * The web build uses SignaturePad.web.tsx.
 */
export function SignaturePad(_: { onChange: (png: string | null) => void; clearSignal: number }) {
  return <Text>Abra o link do e-mail num navegador para assinar.</Text>;
}
