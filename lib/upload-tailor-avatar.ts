import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { getFirebaseAuthClient, getFirebaseStorageClient } from '@/lib/firebase';
import { optimizeJpegForStorage } from '@/lib/upload-blob-utils';

const STORAGE_BUCKET_PATH = 'invoices-images';
const AVATAR_MAX_BYTES = 120_000;

async function assertSessionMatchesUser(userId: string): Promise<void> {
  const user = getFirebaseAuthClient().currentUser;
  if (!user) {
    throw new Error('يجب تسجيل الدخول لرفع صورة الحساب.');
  }
  if (user.uid !== userId) {
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

  const raw = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('تعذّر ضغط صورة الحساب.'))),
      'image/jpeg',
      0.88
    );
  });

  return optimizeJpegForStorage(raw, {
    maxBytes: AVATAR_MAX_BYTES,
    maxDimension: maxSize,
    targetBytes: 80_000,
  });
}

export async function uploadTailorAvatar(userId: string, jpegBlob: Blob): Promise<string> {
  await assertSessionMatchesUser(userId);

  const optimized = await optimizeJpegForStorage(jpegBlob, {
    maxBytes: AVATAR_MAX_BYTES,
    maxDimension: 512,
    targetBytes: 80_000,
  });

  const objectPath = `${STORAGE_BUCKET_PATH}/${userId}/avatar.jpg`;
  const storage = getFirebaseStorageClient();

  await uploadBytes(ref(storage, objectPath), optimized, {
    contentType: 'image/jpeg',
    cacheControl: 'public, max-age=86400',
  });

  const publicUrl = await getDownloadURL(ref(storage, objectPath));
  return `${publicUrl}?v=${Date.now()}`;
}
