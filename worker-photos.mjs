import { Buffer } from 'node:buffer';

export const photoPath = /^\/api\/photos\/[1-9]\d*\/[1-9]\d{0,2}\/[a-f0-9-]{36}$/;
export const photoUpload = /^\/api\/photos\/([1-9]\d*)\/[1-9]\d{0,2}$/;

export async function readLimited(request, limit) {
  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw Object.assign(new Error('ไฟล์หรือข้อมูลมีขนาดเกินกำหนด'), { code: 'resource-exhausted' });
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  return Buffer.concat(chunks, size);
}

export async function savePhoto(db, request, pathname) {
  const type = request.headers.get('Content-Type');
  const file = await readLimited(request, 5 * 1024 * 1024);
  const valid = (type === 'image/jpeg' && file.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
    (type === 'image/png' && file.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) ||
    (type === 'image/webp' && file.subarray(0, 4).toString() === 'RIFF' && file.subarray(8, 12).toString() === 'WEBP');
  if (!valid) throw Object.assign(new Error('ไฟล์รูปไม่ถูกต้อง'), { code: 'invalid-argument' });
  const url = `${pathname}/${crypto.randomUUID()}`;
  const chunkSize = 1024 * 1024;
  const insert = db.prepare('INSERT INTO candidate_photo_chunks VALUES (?, ?, ?, ?)');
  const chunks = [];
  for (let offset = 0; offset < file.length; offset += chunkSize) {
    chunks.push(insert.bind(url, offset / chunkSize, type, file.subarray(offset, offset + chunkSize)));
  }
  await db.batch(chunks);
  return url;
}
