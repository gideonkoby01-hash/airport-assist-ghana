// ID and profile photos are shrunk in the browser before upload: about 1,600 px on the long side, JPEG at 80%
// (roughly 300 KB instead of 3-5 MB). That keeps storage small, uploads quick on mobile data, and the
// photo is still easy to read.
export const MAX_SIDE = 1600;
export const JPEG_QUALITY = 0.8;

// New width and height that fit within `max` on the long side, never enlarging.
export function fitWithin(width, height, max = MAX_SIDE) {
  const longest = Math.max(width, height);
  if (!longest || longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Returns a smaller JPEG file, or the original file when it cannot be shrunk or shrinking would not help.
export async function shrinkImage(file) {
  try {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type) || typeof createImageBitmap !== 'function') return file;
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff'; // transparent PNGs become white, not black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return file; // never block a booking because a photo could not be shrunk
  }
}
