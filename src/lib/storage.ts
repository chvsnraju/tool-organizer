import { supabase } from './supabase';

async function compressDataUrl(
  sourceDataUrl: string,
  maxDimension = 1280,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(sourceDataUrl);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = () => resolve(sourceDataUrl);
    img.src = sourceDataUrl;
  });
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function uploadImage(
  base64: string,
  bucket: 'items' | 'containers',
  userId: string
): Promise<string> {
  // Rough size check on the raw base64 string (actual bytes ≈ 75% of base64 length)
  const estimatedBytes = base64.length * 0.75;
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large (>${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB). Please use a smaller image.`);
  }

  const normalizedBase64 = await compressDataUrl(base64);

  // Convert base64 to blob
  const base64Data = normalizedBase64.replace(/^data:image\/\w+;base64,/, '');
  const bytes = atob(base64Data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    arr[i] = bytes.charCodeAt(i);
  }
  const blob = new Blob([arr], { type: 'image/jpeg' });

  const filename = `${userId}/${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filename, blob, { contentType: 'image/jpeg', upsert: false });

  if (error) {
    // Fall back to storing base64 if storage isn't set up
    console.warn('Storage upload failed, falling back to base64:', error.message);
    return normalizedBase64;
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filename);
  return urlData.publicUrl;
}

export async function deleteImage(url: string, bucket: 'items' | 'containers'): Promise<void> {
  // Only delete from storage if it's a Supabase storage URL (not base64)
  if (!url || url.startsWith('data:')) return;

  try {
    const pathMatch = url.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)/);
    if (pathMatch) {
      await supabase.storage.from(bucket).remove([pathMatch[1]]);
    }
  } catch (err) {
    console.warn('Failed to delete image from storage:', err);
  }
}
