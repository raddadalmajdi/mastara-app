import type { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_BUCKET = 'invoices-images';

async function assertSessionMatchesUser(supabase: SupabaseClient, userId: string): Promise<void> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('يجب تسجيل الدخول لرفع صورة الحساب.');
  }
  if (user.id !== userId) {
    throw new Error('لا يمكن رفع صورة إلا لحسابك الحالي.');
  }
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('تعذّر قراءة الصورة المختارة.'));
    };
    img.src = url;
  });
}

/** يُصغّر الصورة إلى مربّع مناسب لأيقونة الحساب ويُحوّلها JPEG. */
export async function fileToAvatarJpegBlob(file: File, maxSize = 512): Promise<Blob> {
  const img = await loadImageFromFile(file);
  const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const sx = ((img.naturalWidth || img.width) - side) / 2;
  const sy = ((img.naturalHeight || img.height) - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر معالجة الصورة.');

  ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('تعذّر ضغط صورة الحساب.'))),
      'image/jpeg',
      0.88
    );
  });
}

/** يرفع صورة الحساب إلى مجلد المستخدم في Storage ويُرجع الرابط العام. */
export async function uploadTailorAvatar(
  supabase: SupabaseClient,
  userId: string,
  jpegBlob: Blob
): Promise<string> {
  await assertSessionMatchesUser(supabase, userId);

  const objectPath = `${userId}/avatar.jpg`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(objectPath, jpegBlob, {
    contentType: 'image/jpeg',
    upsert: true,
    cacheControl: '3600',
  });

  if (error) {
    throw new Error(`تعذّر رفع صورة الحساب: ${error.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);

  return `${publicUrl}?v=${Date.now()}`;
}
