export interface ProcessedSignaturePng {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Loads an image File (PNG, JPG, WEBP) or URL/DataURL onto an HTML Canvas,
 * removes white/near-white paper backgrounds cleanly (with soft edge feathering),
 * and exports a transparent PNG DataURL + Blob.
 */
export async function processSignatureImageToTransparentPng(
  input: File | string
): Promise<ProcessedSignaturePng> {
  const imageSrc =
    typeof input === 'string'
      ? input
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read signature image file.'));
          reader.readAsDataURL(input);
        });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    if (!imageSrc.startsWith('data:') && !imageSrc.startsWith('blob:')) {
      el.crossOrigin = 'anonymous';
    }
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to decode signature image. Please upload a valid PNG, JPG, or WEBP file.'));
    el.src = imageSrc;
  });

  const width = img.naturalWidth || img.width || 600;
  const height = img.naturalHeight || img.height || 200;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('HTML Canvas 2D context is unavailable.');
  }

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Automatically remove white / near-white paper backgrounds while preserving ink strokes
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a === 0) continue;

    const maxChannel = Math.max(r, g, b);
    const minChannel = Math.min(r, g, b);
    const chroma = maxChannel - minChannel;

    // Pure white or near-white neutral pixels -> fully transparent
    if (minChannel >= 230 && chroma <= 28) {
      data[i + 3] = 0;
    } else if (minChannel >= 200 && chroma <= 24) {
      // Soft feathering near white edges to avoid jagged halos
      const factor = (230 - minChannel) / 30;
      data[i + 3] = Math.round(a * Math.max(0, Math.min(1, factor)));
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('Failed to export transparent PNG blob from canvas.'));
      },
      'image/png'
    );
  });

  return { dataUrl, blob, width, height };
}

/**
 * Converts a PNG/SVG data URL or image URL into a PNG Blob via HTML Canvas.
 */
export async function imageSourceToPngBlob(source: string): Promise<Blob> {
  if (source.startsWith('data:image/png')) {
    const res = await fetch(source);
    return res.blob();
  }
  const processed = await processSignatureImageToTransparentPng(source);
  return processed.blob;
}
