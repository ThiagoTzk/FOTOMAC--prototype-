export type Step = 'frente' | 'esquerda' | 'direita' | 'cima' | 'baixo';
type Props = {
  visible: boolean;
  onClose: () => void;
  onDone: (frames: Blob[], steps: Step[], order: Step[]) => void;
  getOrder?: () => Promise<Step[]>;
  variant?: 'bench' | 'search';
  aside?: import('react').ReactNode;
};

/** Native placeholder: the mobile app (version 2.0) records with expo-camera. The web uses GuidedCapture.web.tsx. */
export function GuidedCapture(_: Props) {
  return null;
}
