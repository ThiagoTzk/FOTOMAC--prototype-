import { useEffect, useRef } from 'react';

import { visitor } from '@/theme/tokens';

type Props = {
  /** PNG of the drawing as a data URL, or null when the box is empty / was cleared. */
  onChange: (png: string | null) => void;
  clearSignal: number;   // changes when the parent asks to clear the box
};

const WIDTH = 600;
const HEIGHT = 200;

/**
 * The electronic signature (RF020): drawn with the mouse, the finger or a pen, on a real <canvas> —
 * pointer events cover all three. The PNG is transparent outside the strokes, so it can be printed over
 * the line of the official PDF form. Web only (Expo picks this file on the web; the app has SignaturePad.tsx).
 */
export function SignaturePad({ onChange, clearSignal }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    inked.current = false;
    onChange(null);
  }, [clearSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    // The box is drawn at a fixed resolution and shown at any width: scale the pointer to it.
    return { x: ((e.clientX - rect.left) / rect.width) * WIDTH, y: ((e.clientY - rect.top) / rect.height) * HEIGHT };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#14232F';
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    inked.current = true;
  }

  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) onChange(e.currentTarget.toDataURL('image/png'));
  }

  return (
    <canvas ref={canvas} width={WIDTH} height={HEIGHT} aria-label="Quadro de assinatura: assine com o mouse, o dedo ou a caneta"
            role="img" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
            style={{ width: '100%', maxWidth: WIDTH, aspectRatio: `${WIDTH} / ${HEIGHT}`, touchAction: 'none', cursor: 'crosshair',
                     background: '#FFFFFF', border: `1px solid ${visitor.cardBorder}`, borderRadius: 10 }} />
  );
}
