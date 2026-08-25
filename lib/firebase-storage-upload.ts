'use client';

import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type FirebaseStorage,
  type StorageReference,
  type UploadMetadata,
} from 'firebase/storage';
import { toUploadUserMessage } from '@/lib/upload-blob-utils';

const DEFAULT_UPLOAD_TIMEOUT_MS = 180_000;

export type ResumableUploadOptions = {
  timeoutMs?: number;
  onProgress?: (percent: number) => void;
};

/** يرفع Blob بشكل قابل للاستئناف — مناسب لشبكات الهاتف غير المستقرة. */
export function uploadBlobResumable(
  storageRef: StorageReference,
  blob: Blob,
  metadata: UploadMetadata,
  options?: ResumableUploadOptions
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, metadata);
    let settled = false;

    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      task.cancel();
      reject(
        new Error(
          'انتهت مهلة الرفع — الشبكة بطيئة أو غير مستقرة. تحقق من الاتصال وحاول مجدداً.'
        )
      );
    }, timeoutMs);

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      fn();
    };

    task.on(
      'state_changed',
      (snapshot) => {
        const total = snapshot.totalBytes;
        if (total <= 0) return;
        const percent = Math.round((snapshot.bytesTransferred / total) * 100);
        options?.onProgress?.(percent);
      },
      (error) => {
        finish(() => reject(error));
      },
      () => {
        finish(() => resolve());
      }
    );
  });
}

/** يحذف ملفات Storage المرفوعة جزئياً (rollback). */
export async function rollbackStorageObjects(
  storage: FirebaseStorage,
  objectPaths: string[]
): Promise<void> {
  await Promise.all(
    objectPaths.map(async (objectPath) => {
      try {
        await deleteObject(ref(storage, objectPath));
      } catch {
        /* best-effort — قد يكون الملف غير موجود أصلاً */
      }
    })
  );
}

export async function uploadAndGetDownloadUrl(
  storage: FirebaseStorage,
  objectPath: string,
  blob: Blob,
  metadata: UploadMetadata,
  options?: ResumableUploadOptions
): Promise<string> {
  const storageRef = ref(storage, objectPath);
  try {
    await uploadBlobResumable(storageRef, blob, metadata, options);
    return await getDownloadURL(storageRef);
  } catch (error) {
    throw new Error(toUploadUserMessage(error));
  }
}
