import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { EntityManager } from 'typeorm';
import { Attachment } from '../database/entities';

export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads');
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  'image/heic': { ext: 'heic', magic: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString() === '%PDF-' },
};

/** Stores uploads on local disk (mount UPLOAD_DIR on a persistent volume). Content is checked, not just the file name. */
@Injectable()
export class FilesService {
  check(f: Express.Multer.File) {
    const t = TYPES[f.mimetype];
    if (!t || !t.magic(f.buffer)) throw new BadRequestException(`"${f.originalname}" is not an accepted file. Use JPG, PNG, WEBP, HEIC or PDF.`);
    if (f.size > MAX_FILE_BYTES) throw new BadRequestException(`"${f.originalname}" is larger than 10 MB`);
  }
  async save(em: EntityManager, f: Express.Multer.File, ownerType: string, ownerId: string, kind: string, userId: string | null) {
    this.check(f);
    const now = new Date(); const dir = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const key = `${dir}/${randomUUID()}.${TYPES[f.mimetype].ext}`;
    await mkdir(join(UPLOAD_DIR, dir), { recursive: true });
    await writeFile(join(UPLOAD_DIR, key), f.buffer, { mode: 0o640 });
    return em.save(Attachment, em.create(Attachment, { ownerType, ownerId, kind, originalName: f.originalname.slice(0, 200), mime: f.mimetype, size: f.size, storageKey: key, uploadedBy: userId }));
  }
  stream(a: Attachment) {
    const path = join(UPLOAD_DIR, a.storageKey);
    if (!path.startsWith(UPLOAD_DIR) || !existsSync(path)) throw new NotFoundException('File not found');
    return createReadStream(path);
  }
}
