/**
 * Native placeholder: the mobile app (React Native + Expo, a later stage) will use the
 * device's own picker here. The web build uses photo.web.ts.
 */
export function pickPhoto(): Promise<Blob | null> {
  return Promise.reject(new Error('Disponível no aplicativo móvel em uma próxima etapa.'));
}

export function toJpeg(_source: Blob | HTMLVideoElement, _mirror = false): Promise<Blob> {
  return Promise.reject(new Error('Disponível no aplicativo móvel em uma próxima etapa.'));
}
