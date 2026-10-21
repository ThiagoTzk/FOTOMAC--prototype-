import { Image } from 'expo-image';
import { CircleCheck, EyeOff, TriangleAlert } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { blurFaces, locateFaces, previewUrl, setMinorsChecked, type Box, type ImageItem } from '@/api/images';
import { Button, Notice } from '@/components/panel/ui';
import { fonts, panel } from '@/theme/tokens';

type Props = { image: ImageItem; onDone: (updated: ImageItem) => void; height?: number };
type Pick = { box: Box; on: boolean; drawn: boolean };

/**
 * Blur minors' faces IN THE FILE (LGPD Art. 14, RF009 note 7). The detector only says where the
 * faces are — no age, no biometric vector. Click a face to select it; drag to draw a face the
 * detector missed (small or turned children). The original file is replaced: nothing with the
 * face is kept. A published photo is re-indexed, and the blurred face gives no vector.
 */
export function BlurEditor({ image, onDone, height = 560 }: Props) {
  const area = useRef<View>(null);
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    locateFaces(image.id).then((r) => alive && setPicks(r.faces.map((box) => ({ box, on: false, drawn: false }))))
      .catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [image.id, image.version]);

  // The photo at its own proportion inside the area: one scale for drawing and for the boxes.
  const k = size.w && size.h ? Math.min(size.w / image.width, size.h / image.height) : 0;
  const offset = { x: (size.w - image.width * k) / 2, y: (size.h - image.height * k) / 2 };
  const point = (e: any) => {
    const r = (area.current as unknown as HTMLElement).getBoundingClientRect();
    const px = (e.nativeEvent.pageX - window.scrollX - r.left - offset.x) / k;
    const py = (e.nativeEvent.pageY - window.scrollY - r.top - offset.y) / k;
    return { x: Math.max(0, Math.min(image.width, px)), y: Math.max(0, Math.min(image.height, py)) };
  };

  function release(e: any) {
    if (!draft || !picks) return;
    const end = point(e);
    const [x, y] = [Math.min(draft.x0, end.x), Math.min(draft.y0, end.y)];
    const [w, h] = [Math.abs(end.x - draft.x0), Math.abs(end.y - draft.y0)];
    setDraft(null);
    if (w * k > 10 && h * k > 10) {  // a drag: a face the detector missed
      setPicks([...picks, { box: [Math.round(x), Math.round(y), Math.round(w), Math.round(h)], on: true, drawn: true }]);
      return;
    }
    // A click: toggles the face under it (the smallest, when boxes overlap).
    const hit = picks.map((p, i) => ({ p, i })).filter(({ p }) => end.x >= p.box[0] && end.x <= p.box[0] + p.box[2]
      && end.y >= p.box[1] && end.y <= p.box[1] + p.box[3]).sort((a, b) => a.p.box[2] * a.p.box[3] - b.p.box[2] * b.p.box[3])[0];
    if (hit) setPicks(picks.map((p, i) => (i === hit.i ? { ...p, on: !p.on } : p)));
  }

  const chosen = (picks ?? []).filter((p) => p.on);
  async function apply() {
    setBusy(true); setError(null);
    try { onDone(await blurFaces(image.id, chosen.map((p) => p.box))); } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível borrar.');
    } finally { setBusy(false); }
  }
  async function none() {
    setBusy(true); setError(null);
    try { onDone(await setMinorsChecked(image.id, true)); } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível registrar.');
    } finally { setBusy(false); }
  }

  return (
    <View style={{ gap: 12 }}>
      <View ref={area} style={[s.area, { height }]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            onStartShouldSetResponder={() => true} onResponderGrant={(e) => { const p = point(e); setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }); }}
            onResponderMove={(e) => { const p = point(e); setDraft((d) => d && { ...d, x1: p.x, y1: p.y }); }} onResponderRelease={release}
            accessibilityLabel="Foto: clique num rosto para borrar, ou arraste para marcar um rosto não detectado">
        {k > 0 && (
          <View pointerEvents="none" style={{ position: 'absolute', left: offset.x, top: offset.y, width: image.width * k, height: image.height * k }}>
            <Image source={previewUrl(image.id, image.version)} style={StyleSheet.absoluteFill} contentFit="contain" />
            {(picks ?? []).map((p, i) => (
              <View key={i} style={[s.box, { left: p.box[0] * k, top: p.box[1] * k, width: p.box[2] * k, height: p.box[3] * k },
                                    p.on ? s.boxOn : s.boxOff]} />
            ))}
            {draft && (
              <View style={[s.box, s.draft, { left: Math.min(draft.x0, draft.x1) * k, top: Math.min(draft.y0, draft.y1) * k,
                                               width: Math.abs(draft.x1 - draft.x0) * k, height: Math.abs(draft.y1 - draft.y0) * k }]} />
            )}
          </View>
        )}
        {!picks && !error && <ActivityIndicator color="#FFFFFF" style={{ position: 'absolute', top: '45%', alignSelf: 'center' }} />}
      </View>
      {error && <Notice tone="danger" icon={TriangleAlert} title={error} />}
      <Text style={s.help}>
        {picks ? `${picks.filter((p) => !p.drawn).length} rosto(s) detectado(s). ` : ''}Clique nos rostos de menores para selecionar;
        arraste para marcar um rosto que o detector não achou. Borrar substitui o arquivo original — não dá para desfazer.
      </Text>
      <View style={s.actions}>
        <Button variant="secondary" icon={CircleCheck} label="Sem menores nesta foto" disabled={busy || !picks} onPress={none} />
        <Button variant="danger" icon={EyeOff} label={chosen.length ? `Borrar ${chosen.length} rosto(s) e substituir o original` : 'Selecione os rostos'}
                disabled={!chosen.length || busy} loading={busy} onPress={apply} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  area: { backgroundColor: '#0B0F14', borderRadius: 10, overflow: 'hidden', cursor: 'crosshair' } as object,
  box: { position: 'absolute', borderWidth: 2, borderRadius: 3 },
  boxOff: { borderColor: 'rgba(255,255,255,0.85)', borderStyle: 'dashed' },
  boxOn: { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.28)' },
  draft: { borderColor: '#FACC15', borderStyle: 'dashed' },
  help: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: panel.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' },
});
