import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react-native';
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ZoomImageProps } from './ZoomImage';

const MIN = 1;
const MAX = 5;
const STEP = 1.5;
const SWIPE = 60; // px of horizontal travel, at 1x, that counts as "next/previous photo"

type View3 = { s: number; x: number; y: number };

/**
 * Photo with zoom on the web: mouse wheel, double click, pinch, drag to move, +/- buttons and
 * the keys + − 0. At 1x a horizontal swipe asks for the next/previous photo (onSwipe).
 *
 * Plain DOM on purpose: React Native's gesture system does not reach the browser's wheel and
 * pinch, and the zoom must not scroll or zoom the whole page underneath.
 */
export function ZoomImage(props: ZoomImageProps) {
  // A new photo always opens whole, at 1x: a new key gives it a fresh state.
  return <Zoomable key={props.uri} {...props} />;
}

function Zoomable({ uri, placeholder, alt, style, onSwipe, theme = 'light', keyboard = false }: ZoomImageProps) {
  const box = useRef<HTMLDivElement>(null);
  const [v, setV] = useState<View3>({ s: 1, x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ start: View3; x: number; y: number; dist: number; mx: number; my: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const current = useRef(v);
  useEffect(() => { current.current = v; }, [v]);

  /** Keeps the photo from being dragged out of its frame. */
  const clamp = (n: View3): View3 => {
    const el = box.current;
    if (!el || n.s <= 1) return { s: Math.max(MIN, n.s), x: 0, y: 0 };
    const mx = (el.clientWidth * (n.s - 1)) / 2;
    const my = (el.clientHeight * (n.s - 1)) / 2;
    return { s: Math.min(MAX, n.s), x: Math.max(-mx, Math.min(mx, n.x)), y: Math.max(-my, Math.min(my, n.y)) };
  };

  /** Zoom keeping the point under (px, py) — relative to the frame's centre — where it is. */
  const zoomAt = (cur: View3, s: number, px = 0, py = 0): View3 => {
    const ns = Math.max(MIN, Math.min(MAX, s));
    const k = ns / cur.s;
    return clamp({ s: ns, x: px - (px - cur.x) * k, y: py - (py - cur.y) * k });
  };

  const fromCentre = (clientX: number, clientY: number) => {
    const r = box.current!.getBoundingClientRect();
    return { px: clientX - r.left - r.width / 2, py: clientY - r.top - r.height / 2 };
  };

  // The wheel listener must be non-passive to stop the page from scrolling while zooming.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const { px, py } = fromCentre(e.clientX, e.clientY);
      setV((cur) => zoomAt(cur, cur.s * Math.exp(-e.deltaY * 0.0025), px, py));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!keyboard) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') setV((c) => zoomAt(c, c.s * STEP));
      else if (e.key === '-') setV((c) => zoomAt(c, c.s / STEP));
      else if (e.key === '0') setV({ s: 1, x: 0, y: 0 });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [keyboard]); // eslint-disable-line react-hooks/exhaustive-deps

  /** (Re)starts a gesture from the fingers on screen now — also when one of two fingers lifts. */
  function begin() {
    const pts = [...pointers.current.values()];
    if (!pts.length) { gesture.current = null; return; }
    const mid = pts.length >= 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dist = pts.length >= 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { start: current.current, x: mid.x, y: mid.y, dist, mx: mid.x, my: mid.y };
  }

  function down(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    begin();
    setDragging(true);
  }

  function move(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length === 2 && g.dist > 0) {
      // Pinch: scale by the change in finger distance, around the point between the fingers.
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const { px, py } = fromCentre(g.mx, g.my);
      setV(zoomAt(g.start, g.start.s * (dist / g.dist), px, py));
    } else if (pts.length === 1 && g.start.s > 1) {
      setV(clamp({ ...g.start, x: g.start.x + (e.clientX - g.x), y: g.start.y + (e.clientY - g.y) }));
    }
  }

  function up(e: ReactPointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    const single = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    if (!single) { begin(); return; } // a finger of a pinch lifted: carry on from the other one
    gesture.current = null;
    setDragging(false);
    if (!g) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (g.start.s === 1 && onSwipe && Math.abs(dx) > SWIPE && Math.abs(dy) < SWIPE) onSwipe(dx < 0 ? 1 : -1);
  }

  function doubleClick(e: React.MouseEvent<HTMLDivElement>) {
    const { px, py } = fromCentre(e.clientX, e.clientY);
    setV((cur) => (cur.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(cur, 2.5, px, py)));
  }

  const dark = theme === 'dark';
  const frame: CSSProperties = {
    position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', userSelect: 'none',
    cursor: v.s > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
  };
  const img: CSSProperties = {
    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
    transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})`, transformOrigin: 'center',
    // Smooth for buttons and double click; instant while a finger or the mouse is moving it.
    transition: dragging ? 'none' : 'transform 120ms ease-out',
    pointerEvents: 'none', WebkitUserDrag: 'none',
  } as CSSProperties;

  return (
    <View style={[styles.wrap, style]}>
      <div ref={box} style={frame} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
           onDoubleClick={doubleClick} role="img" aria-label={alt}>
        {placeholder && !loaded && <img src={placeholder} alt="" style={{ ...img, filter: 'blur(6px)' }} draggable={false} />}
        <img src={uri} alt={alt} style={{ ...img, opacity: loaded ? 1 : 0 }} draggable={false} onLoad={() => setLoaded(true)} />
      </div>
      <View style={[styles.controls, dark ? styles.controlsDark : styles.controlsLight]}>
        <ZoomButton label="Diminuir zoom" dark={dark} disabled={v.s <= MIN} onPress={() => setV((c) => zoomAt(c, c.s / STEP))} Icon={ZoomOut} />
        <span style={{ minWidth: 44, textAlign: 'center', font: '500 12px Poppins_500Medium, sans-serif', color: dark ? '#FFFFFF' : '#374151' }}
              aria-live="polite">{Math.round(v.s * 100)}%</span>
        <ZoomButton label="Aumentar zoom" dark={dark} disabled={v.s >= MAX} onPress={() => setV((c) => zoomAt(c, c.s * STEP))} Icon={ZoomIn} />
        <ZoomButton label="Ver a foto inteira" dark={dark} disabled={v.s === 1} onPress={() => setV({ s: 1, x: 0, y: 0 })} Icon={Maximize2} />
      </View>
    </View>
  );
}

function ZoomButton({ label, onPress, disabled, dark, Icon }: {
  label: string; onPress: () => void; disabled: boolean; dark: boolean; Icon: typeof ZoomIn;
}) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onPress}
            style={{ width: 34, height: 34, border: 0, borderRadius: 8, background: 'transparent', display: 'flex',
                     alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer',
                     opacity: disabled ? 0.35 : 1 }}>
      <Icon size={18} color={dark ? '#FFFFFF' : '#1F2937'} strokeWidth={1.8} absoluteStrokeWidth />
    </button>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', overflow: 'hidden' },
  controls: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center',
              gap: 2, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 12 },
  controlsDark: { backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  controlsLight: { backgroundColor: 'rgba(255, 255, 255, 0.92)', boxShadow: '0px 1px 6px rgba(0, 0, 0, 0.18)' },
});
