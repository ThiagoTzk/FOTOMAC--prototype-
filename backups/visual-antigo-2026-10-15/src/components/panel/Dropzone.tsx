import { Text } from 'react-native';

/**
 * Native placeholder: photo upload is a WEB-only feature by requirement (§2.1 — the mobile app
 * offers only the public functions). The web build uses Dropzone.web.tsx.
 */
export function Dropzone(_: { onFiles: (files: File[]) => void }) {
  return <Text>O envio de imagens está disponível somente na plataforma web.</Text>;
}
