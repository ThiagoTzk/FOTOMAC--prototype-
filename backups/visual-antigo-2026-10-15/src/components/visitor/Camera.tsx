import { Note, Sheet } from './ui';

type Props = { visible: boolean; onClose: () => void; onCapture: (photo: Blob) => void };

/** Native placeholder: the mobile app (a later stage) will use expo-camera. The web uses Camera.web.tsx. */
export function CameraCapture({ visible, onClose }: Props) {
  return (
    <Sheet visible={visible} title="Câmera" onClose={onClose}>
      <Note>A câmera estará disponível no aplicativo móvel em uma próxima etapa.</Note>
    </Sheet>
  );
}
