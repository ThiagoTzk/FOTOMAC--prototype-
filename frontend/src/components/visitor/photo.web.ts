/**
 * WEB: gets a photo from the device's gallery / files and turns it into a JPEG in memory.
 *
 * Why re-encode in the browser: the search accepts JPEG (RF016), but galleries also hold PNG,
 * screenshots, etc. Drawing the picture on a canvas and exporting JPEG gives the server ONE
 * format, whatever the source — the same treatment as a camera capture (RF016 note 2). It also
 * shrinks the photo (max 1600 px), so less personal data travels, and EXIF (GPS, device) is
 * not carried over. Nothing is saved: the bytes live only in memory until the search ends.
 */
const MAX_SIDE = 1600;

/** Must be called directly from a click (browsers only open the file chooser on a user gesture). */
export function pickPhoto(): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

export async function toJpeg(source: Blob | HTMLVideoElement, mirror = false): Promise<Blob> {
  let width: number;
  let height: number;
  let drawable: CanvasImageSource;
  if (source instanceof Blob) {
    try {
      // "from-image": a portrait photo taken sideways is turned upright by its EXIF orientation.
      const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
      drawable = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } catch {
      throw new Error('Não foi possível abrir esta imagem. Escolha uma foto em JPG ou PNG.');
    }
  } else {
    drawable = source;
    width = source.videoWidth;
    height = source.videoHeight;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(drawable, 0, 0, canvas.width, canvas.height);
  if ('close' in drawable) (drawable as ImageBitmap).close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível preparar a imagem.'))), 'image/jpeg', 0.92));
}
