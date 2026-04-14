import { Router, Response } from 'express';
import multer from 'multer';
import sizeOf from 'image-size';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── Config ──────────────────────────────────────────────────────────────────

export const UPLOADS_DIR = path.join(__dirname, '../../uploads/events');

/** 16:9 aspect ratio requirements. */
const TARGET_RATIO = 16 / 9;  // 1.7̄̄7̄
const RATIO_TOLERANCE = 0.05; // ±5 %
const MIN_WIDTH = 800;
const MIN_HEIGHT = 450;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

// Ensure the uploads directory exists at startup
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── Multer ───────────────────────────────────────────────────────────────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP images are accepted'));
    }
  },
});

// ─── POST /api/uploads/event-image ───────────────────────────────────────────

router.post(
  '/event-image',
  authenticate,
  upload.single('image'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    // Validate dimensions
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dims = sizeOf(req.file.buffer);
      width = dims.width;
      height = dims.height;
    } catch {
      res.status(422).json({ error: 'Could not read image dimensions' });
      return;
    }

    if (!width || !height) {
      res.status(422).json({ error: 'Could not determine image dimensions' });
      return;
    }

    if (width < MIN_WIDTH || height < MIN_HEIGHT) {
      res.status(422).json({
        error: `Image is too small (${width}×${height}px). Minimum size is ${MIN_WIDTH}×${MIN_HEIGHT}px. Recommended: 1920×1080px.`,
      });
      return;
    }

    const ratio = width / height;
    if (Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO > RATIO_TOLERANCE) {
      const actualRatio = ratio.toFixed(2);
      res.status(422).json({
        error: `Image must have a 16:9 aspect ratio (yours is ${width}×${height}, ratio ${actualRatio}:1). Crop it to 16:9 before uploading — recommended size is 1920×1080px.`,
      });
      return;
    }

    // Save to disk
    const originalExt = path.extname(req.file.originalname).toLowerCase();
    const ext = ACCEPTED_MIME.includes(req.file.mimetype)
      ? { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }[req.file.mimetype] ?? originalExt
      : originalExt;
    const filename = `${uuidv4()}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    try {
      await fs.promises.writeFile(filepath, req.file.buffer);
    } catch {
      res.status(500).json({ error: 'Failed to save image' });
      return;
    }

    res.json({ imageUrl: `/uploads/events/${filename}` });
  }
);

export default router;
