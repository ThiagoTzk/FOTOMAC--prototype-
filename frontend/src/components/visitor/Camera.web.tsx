import { Aperture } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { poppins, visitor } from '@/theme/tokens';

import { toJpeg } from './photo';
import { Note, Sheet, VButton } from './ui';

type Props = { visible: boolean; onClose: () => void; onCapture: (photo: Blob) => void };

const FRAME = { w: 258, h: 280 };
const OVAL = { w: 118, h: 168 };

/**
 * "Captura de foto": live camera with the face mould (dark mask + blue oval, read from the .fig).
 *
 * Opened only AFTER the "Estou ciente" (RF015 note 1). The camera is turned off as soon as the
 * window closes or the photo is taken — the light of the camera never stays on.
 */
export function CameraCapture({ visible, onClose, onCapture }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The modal may mount the <video> after the stream is ready (or before): whichever comes
  // last connects the two.
  const connect = useCallback(() => {
    const el = video.current;
    if (!el || !stream.current || el.srcObject === stream.current) return;
    el.srcObject = stream.current;
    el.play().catch(() => undefined);
    setReady(true);
  }, []);
  const videoRef = useCallback((el: HTMLVideoElement | null) => { video.current = el; connect(); }, [connect]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        // Browsers only allow the camera on https (or localhost).
        setError('Este navegador não permite usar a câmera aqui. Use “Realizar upload” para enviar uma foto.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        connect();
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(name === 'NotAllowedError'
          ? 'O acesso à câmera não foi permitido. Libere a câmera nas configurações do navegador ou use “Realizar upload”.'
          : name === 'NotFoundError' ? 'Nenhuma câmera foi encontrada neste dispositivo. Use “Realizar upload”.'
            : 'Não foi possível abrir a câmera. Use “Realizar upload” para enviar uma foto.');
      }
    })();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      setReady(false);
      setError(null);
    };
  }, [visible, connect]);

  async function capture() {
    if (!video.current) return;
    const photo = await toJpeg(video.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    onCapture(photo);
  }

  return (
    <Sheet visible={visible} title="Centralize o rosto no molde" onClose={onClose}>
      <View style={styles.frame}>
        {/* The preview is mirrored, like a mirror; the photo sent is the real (unmirrored) image. */}
        <video ref={videoRef} playsInline muted aria-label="Imagem da câmera"
               style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', borderRadius: 8,
                        background: '#1F2937' }} />
        <svg width={FRAME.w} height={FRAME.h} style={{ position: 'absolute', inset: 0 }} aria-hidden>
          <defs>
            <mask id="fotomac-oval">
              <rect width={FRAME.w} height={FRAME.h} fill="white" />
              <ellipse cx={FRAME.w / 2} cy={46 + OVAL.h / 2} rx={OVAL.w / 2} ry={OVAL.h / 2} fill="black" />
            </mask>
          </defs>
          <rect width={FRAME.w} height={FRAME.h} rx={8} fill="rgba(0,0,0,0.6)" mask="url(#fotomac-oval)" />
          <ellipse cx={FRAME.w / 2} cy={46 + OVAL.h / 2} rx={OVAL.w / 2 - 1} ry={OVAL.h / 2 - 1} fill="none"
                   stroke={visitor.primary} strokeWidth={2} />
        </svg>
      </View>
      {error ? <Note tone="danger">{error}</Note>
        : <Text style={styles.hint}>Posicione seu rosto dentro do molde para melhor resultado</Text>}
      <View style={{ alignItems: 'center' }}>
        <VButton label="Capturar" icon={Aperture} onPress={capture} disabled={!ready || !!error} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  frame: { width: FRAME.w, height: FRAME.h, alignSelf: 'center', borderRadius: 8, overflow: 'hidden' },
  hint: { fontFamily: poppins.regular, fontSize: 12, lineHeight: 18, color: visitor.muted, textAlign: 'center',
          maxWidth: 258, alignSelf: 'center' },
});
