/**
 * Frames of a short video, extracted IN THE BROWSER: the video itself never leaves this computer —
 * only still frames are sent, and the server keeps at most 5 of them (one per pose).
 * Web only (the panel runs in the browser).
 */
const MAX_SECONDS = 10;   // a guided head turn takes 3–6 s
const FRAMES = 40;        // enough to catch every pose; the server picks the sharp ones
const MAX_SIDE = 1280;    // a face in a selfie video is large: more pixels add nothing

export async function extractFrames(file: Blob): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error('Não foi possível ler o vídeo. Use MP4, MOV ou WebM.'));
    });
    const duration = Math.min(Number.isFinite(video.duration) ? video.duration : MAX_SECONDS, MAX_SECONDS);
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context || !canvas.width) throw new Error('Não foi possível ler o vídeo.');
    const frames: Blob[] = [];
    for (let i = 0; i < FRAMES; i++) {
      video.currentTime = (duration * (i + 0.5)) / FRAMES;
      await new Promise<void>((resolve) => { video.onseeked = () => resolve(); });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (blob) frames.push(blob);
    }
    return frames;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
