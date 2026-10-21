import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CircleCheck, ScanFace, X } from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

export type Step = 'frente' | 'esquerda' | 'direita' | 'cima' | 'baixo';
type Props = {
  visible: boolean;
  onClose: () => void;
  onDone: (frames: Blob[], steps: Step[], order: Step[]) => void;
  /** Where the order of the movements comes from. The public search asks the SERVER (RF036 note 2),
   *  when "Começar" is pressed — so the order is unknown until the capture starts. Default: drawn here. */
  getOrder?: () => Promise<Step[]>;
  /** "search": the visitor's search (frames deleted right after it); "bench": the precision test. */
  variant?: 'bench' | 'search';
  /** Shown beside the camera before the capture starts (the search tips). */
  aside?: ReactNode;
};

const MOVES: Step[] = ['esquerda', 'direita', 'cima', 'baixo'];
const STEP_MS = 1900;       // time for each movement
const SETTLE_MS = 650;      // the head turns first; frames are taken after
// Between two movements the head comes back to the centre: every turn then starts from the middle.
// Real captures (17/10/2026) showed a turn to the right right after one to the left had no time to
// cross from side to side. The centre frames also strengthen the frontal reference.
const CENTER_MS = 1000;
const CENTER_FRAMES = 2;
const FRAMES_PER_STEP = 6;
const FRAME_GAP_MS = 180;
const MAX_SIDE = 1280;
const TEXT: Record<Step, string> = {
  frente: 'Olhe para a câmera', esquerda: 'Vire devagar para a sua esquerda', direita: 'Vire devagar para a sua direita',
  cima: 'Levante o rosto devagar', baixo: 'Abaixe o rosto devagar',
};
// The preview is a mirror: the person's left is on the screen's left, and so is the doll's.
const TARGET: Record<Step, { x: number; y: number }> = {
  frente: { x: 0, y: 0 }, esquerda: { x: -1, y: 0 }, direita: { x: 1, y: 0 }, cima: { x: 0, y: -1 }, baixo: { x: 0, y: 1 },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** A new random order for every recording: a video recorded before cannot follow it. */
const draw = () => [...MOVES].sort(() => Math.random() - 0.5);

/**
 * Guided face recording (Face ID style): a doll shows which way to turn, in an order drawn at random,
 * and frames are taken while the person follows it. NO video is recorded or sent — only still frames,
 * each tagged with the movement asked at that moment, so the server can check the head really
 * followed the order (liveness) and keep one frame per pose. Web only (camera of the browser).
 */
export function GuidedCapture({ visible, onClose, onDone, getOrder, variant = 'bench', aside }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const cancelled = useRef(false);
  const [phase, setPhase] = useState<'intro' | 'countdown' | 'recording' | 'done'>('intro');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(3);
  const [sequence, setSequence] = useState<Step[]>([]);
  const [current, setCurrent] = useState(0);
  const [centering, setCentering] = useState(false);

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
    cancelled.current = false;
    let stop = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {  // browsers allow the camera only on https (or localhost)
        setError('Este navegador não permite usar a câmera nesta página. Abra o site em https ou use outro navegador.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 } }, audio: false });
        if (stop) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        connect();
      } catch (e) {
        const name = (e as DOMException)?.name;
        setError(name === 'NotAllowedError' ? 'O acesso à câmera não foi permitido. Libere a câmera nas configurações do navegador.'
          : name === 'NotFoundError' ? 'Nenhuma câmera foi encontrada neste dispositivo.'
            : 'Não foi possível abrir a câmera. Libere o acesso à câmera no navegador.');
      }
    })();
    return () => {
      stop = true;
      cancelled.current = true;
      stream.current?.getTracks().forEach((t) => t.stop());  // the camera light never stays on
      stream.current = null;
      setReady(false); setPhase('intro'); setError(null); setCurrent(0); setSequence([]); setCentering(false);
    };
  }, [visible, connect]);

  async function frame(): Promise<Blob | null> {
    const el = video.current;
    if (!el || !el.videoWidth) return null;
    const k = Math.min(1, MAX_SIDE / Math.max(el.videoWidth, el.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(el.videoWidth * k);
    canvas.height = Math.round(el.videoHeight * k);
    canvas.getContext('2d')?.drawImage(el, 0, 0, canvas.width, canvas.height);  // the real image, not the mirror
    return new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  }

  async function start() {
    let order: Step[];
    try {
      order = getOrder ? await getOrder() : draw();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível iniciar a captura.');
      return;
    }
    const steps: Step[] = ['frente', ...order];
    setSequence(steps);
    setPhase('countdown');
    for (let n = 3; n > 0; n--) {
      setCount(n);
      await sleep(800);
      if (cancelled.current) return;
    }
    setPhase('recording');
    const frames: Blob[] = [];
    const labels: Step[] = [];
    for (let i = 0; i < steps.length; i++) {
      setCurrent(i);
      if (i > 1) {  // back to the centre before the next movement (tagged "frente")
        setCentering(true);
        await sleep(CENTER_MS - CENTER_FRAMES * FRAME_GAP_MS);
        for (let k = 0; k < CENTER_FRAMES; k++) {
          if (cancelled.current) return;
          const blob = await frame();
          if (blob) { frames.push(blob); labels.push('frente'); }
          await sleep(FRAME_GAP_MS);
        }
        setCentering(false);
      }
      await sleep(SETTLE_MS);
      for (let k = 0; k < FRAMES_PER_STEP; k++) {
        if (cancelled.current) return;
        const blob = await frame();
        if (blob) { frames.push(blob); labels.push(steps[i]); }
        await sleep(FRAME_GAP_MS);
      }
      await sleep(Math.max(0, STEP_MS - SETTLE_MS - FRAMES_PER_STEP * FRAME_GAP_MS));
    }
    setCurrent(steps.length);
    setPhase('done');
    stream.current?.getTracks().forEach((t) => t.stop());
    await sleep(700);
    if (!cancelled.current) onDone(frames, labels, order);
  }

  const step = phase === 'recording' && !centering ? sequence[current] ?? 'frente' : 'frente';
  const progress = sequence.length ? Math.min(1, current / sequence.length) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet} role="dialog" aria-modal aria-label={variant === 'search' ? 'Busca pelo seu rosto' : 'Gravação guiada do rosto'}>
          <View style={s.header}>
            <Text style={s.title}>{variant === 'search' ? 'Busca pelo seu rosto' : 'Gravação guiada do rosto'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} hitSlop={8}>
              <X size={22} color="#334155" strokeWidth={1.8} absoluteStrokeWidth />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 18 }} style={{ flexShrink: 1 }}>
          <View style={s.stage}>
            <View style={s.cameraBox}>
              <Ring progress={progress} />
              <View style={s.camera}>
                <video ref={videoRef} playsInline muted aria-label="Imagem da câmera"
                       style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', background: '#0F172A' }} />
              </View>
              {phase === 'countdown' && <View style={s.countdown}><Text style={s.countdownText}>{count}</Text></View>}
            </View>
            <View style={s.guide}>
              <Doll step={phase === 'recording' ? step : 'frente'} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 64 }}>
                {phase === 'recording' && <Arrow step={step} />}
                <Text style={s.instruction}>
                  {phase === 'intro' ? 'Siga o bonequinho' : phase === 'countdown' ? 'Prepare-se…' : phase === 'done' ? 'Pronto!' : centering ? 'Volte para o centro' : TEXT[step]}
                </Text>
              </View>
              {/* The order exists only after the draw: showing a default order before it would mislead. */}
              <View style={[s.chips, !sequence.length && { display: 'none' }]}>
                {sequence.map((st, i) => (
                  <View key={st} style={[s.chip, i < current && s.chipDone, phase === 'recording' && i === current && s.chipNow]}>
                    {i < current ? <CircleCheck size={14} color="#15835D" strokeWidth={2} absoluteStrokeWidth /> : null}
                    <Text style={[s.chipText, i < current && { color: '#15835D' }]}>{st}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          {phase === 'intro' && aside}
          {error ? <Text style={s.error}>{error}</Text> : phase === 'intro' && (
            <View style={{ gap: 12 }}>
              <Text style={s.text}>
                São cerca de 15 segundos. Com o rosto inteiro no círculo e boa luz, siga o bonequinho: ele mostra para onde
                virar o rosto, devagar. A ordem é sorteada a cada gravação — assim o sistema confirma que é uma pessoa de
                verdade, e não uma foto ou um vídeo gravado antes. Nenhum vídeo é gravado: só alguns quadros,{' '}
                {variant === 'search' ? 'apagados logo depois da busca.' : 'e só enquanto o teste estiver aberto.'}
              </Text>
              <Pressable accessibilityRole="button" disabled={!ready} onPress={start} style={[s.start, !ready && { opacity: 0.5 }]}>
                <ScanFace size={20} color="#FFFFFF" strokeWidth={1.8} absoluteStrokeWidth />
                <Text style={s.startText}>{ready ? 'Começar' : 'Abrindo a câmera…'}</Text>
              </Pressable>
            </View>
          )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Arrow({ step }: { step: Step }) {
  const props = { size: 34, color: '#0284C7', strokeWidth: 2.4, absoluteStrokeWidth: true };
  if (step === 'esquerda') return <ArrowLeft {...props} />;
  if (step === 'direita') return <ArrowRight {...props} />;
  if (step === 'cima') return <ArrowUp {...props} />;
  if (step === 'baixo') return <ArrowDown {...props} />;
  return null;
}

/** Progress ring around the camera (Face ID style). */
function Ring({ progress }: { progress: number }) {
  const r = 152, c = 2 * Math.PI * r;
  return (
    <Svg width={320} height={320} style={{ position: 'absolute' }} pointerEvents="none">
      <Circle cx={160} cy={160} r={r} stroke="#E2E8F0" strokeWidth={6} fill="none" />
      <Circle cx={160} cy={160} r={r} stroke="#16A34A" strokeWidth={6} fill="none" strokeLinecap="round"
              strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - progress)} transform="rotate(-90 160 160)" />
    </Svg>
  );
}

/** The doll: a head whose face slides toward the asked direction, like a head turning. */
function Doll({ step }: { step: Step }) {
  const [pos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  useEffect(() => {
    const target = TARGET[step];
    // Turn, hold, come back a little and turn again — a gentle "this way" loop while the step lasts.
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pos, { toValue: target, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      Animated.delay(420),
      Animated.timing(pos, { toValue: { x: target.x * 0.55, y: target.y * 0.55 }, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
    ]));
    if (step === 'frente') {
      Animated.timing(pos, { toValue: target, duration: 400, useNativeDriver: false }).start();
      return;
    }
    loop.start();
    return () => loop.stop();
  }, [step, pos]);
  const squash = pos.x.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.86, 1, 0.86] });
  const nod = pos.y.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.9, 1, 0.9] });
  return (
    <View style={{ width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`Bonequinho: ${TEXT[step]}`}>
      <Animated.View style={{ position: 'absolute', transform: [{ scaleX: squash }, { scaleY: nod }] }}>
        <Svg width={130} height={140}>
          <Ellipse cx={65} cy={74} rx={52} ry={60} fill="#FDE2C8" stroke="#E7B48F" strokeWidth={2} />
          <Path d="M17 62 C 22 20, 108 20, 113 62 C 100 40, 30 40, 17 62 Z" fill="#5B4636" />
        </Svg>
      </Animated.View>
      <Animated.View style={{ position: 'absolute', top: 58, transform: [
        { translateX: Animated.multiply(pos.x, 26) }, { translateY: Animated.multiply(pos.y, 14) },
      ] }}>
        <Svg width={70} height={60}>
          <Circle cx={18} cy={14} r={5.5} fill="#1E293B" />
          <Circle cx={52} cy={14} r={5.5} fill="#1E293B" />
          <Path d="M35 20 L 31 34 L 39 34" stroke="#C98C66" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M24 45 Q 35 53, 46 45" stroke="#B4533C" strokeWidth={3.5} fill="none" strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(9, 38, 56, 0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 820, maxHeight: '100%', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 24, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: 'Inter_700Bold', fontSize: 18, color: '#0F172A' },
  stage: { flexDirection: 'row', gap: 28, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' },
  cameraBox: { width: 320, height: 320, alignItems: 'center', justifyContent: 'center' },
  camera: { width: 280, height: 280, borderRadius: 140, overflow: 'hidden' },
  countdown: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: 'rgba(15,23,42,0.45)',
               alignItems: 'center', justifyContent: 'center' },
  countdownText: { fontFamily: 'Inter_800ExtraBold', fontSize: 72, color: '#FFFFFF' },
  guide: { flex: 1, minWidth: 280, alignItems: 'center', gap: 14 },
  instruction: { fontFamily: 'Inter_700Bold', fontSize: 22, color: '#0F172A', textAlign: 'center', flexShrink: 1 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999,
          backgroundColor: '#F1F5F9' },
  chipNow: { backgroundColor: '#E0F2FE', borderWidth: 1, borderColor: '#0284C7' },
  chipDone: { backgroundColor: '#DCFCE7' },
  chipText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#334155' },
  text: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, color: '#475569' },
  error: { fontFamily: 'Inter_500Medium', fontSize: 14, color: '#C63D4A' },
  start: { flexDirection: 'row', alignSelf: 'center', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 22, borderRadius: 12,
           backgroundColor: '#007DC5' },
  startText: { fontFamily: 'Inter_700Bold', fontSize: 15, color: '#FFFFFF' },
});
