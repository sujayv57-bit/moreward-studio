import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { Ctx } from './context.ts';
import { badRequest } from './http.ts';

// Allow-list of types. SVG/HTML are deliberately excluded (script execution risk).
export const ALLOWED: Record<string, { mimes: string[]; magic?: (b: Buffer) => boolean }> = {
  '.pdf': { mimes: ['application/pdf'], magic: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  '.png': { mimes: ['image/png'], magic: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
  '.jpg': { mimes: ['image/jpeg'], magic: (b) => b.subarray(0, 3).toString('hex') === 'ffd8ff' },
  '.jpeg': { mimes: ['image/jpeg'], magic: (b) => b.subarray(0, 3).toString('hex') === 'ffd8ff' },
  '.webp': { mimes: ['image/webp'], magic: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  '.docx': { mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], magic: (b) => b.subarray(0, 2).toString() === 'PK' },
  '.xlsx': { mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], magic: (b) => b.subarray(0, 2).toString() === 'PK' },
  '.csv': { mimes: ['text/csv', 'application/vnd.ms-excel', 'text/plain'] },
  '.txt': { mimes: ['text/plain'] },
};
export function makeUpload(ctx: Ctx) {
  fs.mkdirSync(ctx.uploadsDir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: ctx.uploadsDir,
      filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')), // never trust the client filename on disk
    }),
    limits: { fileSize: ctx.maxUploadBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const rule = ALLOWED[ext];
      if (!rule || !rule.mimes.includes(file.mimetype)) return cb(badRequest(`File type not allowed (${ext || 'unknown'}). Allowed: ${Object.keys(ALLOWED).join(', ')}`));
      cb(null, true);
    },
  });
}
/** After upload, verify magic bytes match the claimed extension. */
export function verifyMagic(filePath: string, originalName: string): boolean {
  const rule = ALLOWED[path.extname(originalName).toLowerCase()];
  if (!rule?.magic) return true;
  const fd = fs.openSync(filePath, 'r'); const buf = Buffer.alloc(16); fs.readSync(fd, buf, 0, 16, 0); fs.closeSync(fd);
  return rule.magic(buf);
}
