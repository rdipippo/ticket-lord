import { useRef, useState } from 'react';
import { uploadsApi } from '../services/api';
import styles from './EventImageUpload.module.css';

// ─── Dimension rules (must match backend) ─────────────────────────────────────

const TARGET_RATIO = 16 / 9;
const RATIO_TOLERANCE = 0.05; // ±5 %
const MIN_WIDTH = 800;
const MIN_HEIGHT = 450;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface DimResult {
  width: number;
  height: number;
  error?: string;
}

function readImageDimensions(file: File): Promise<DimResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      const ratio = width / height;

      if (width < MIN_WIDTH || height < MIN_HEIGHT) {
        resolve({
          width,
          height,
          error: `Image is too small (${width}×${height}px). Minimum is ${MIN_WIDTH}×${MIN_HEIGHT}px.`,
        });
        return;
      }

      if (Math.abs(ratio - TARGET_RATIO) / TARGET_RATIO > RATIO_TOLERANCE) {
        resolve({
          width,
          height,
          error: `Image must be 16:9 (yours is ${width}×${height}). Crop to 1920×1080 before uploading.`,
        });
        return;
      }

      resolve({ width, height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 0, height: 0, error: 'Could not read image.' });
    };
    img.src = url;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface EventImageUploadProps {
  /** Current image URL (shows a preview) */
  currentImageUrl?: string;
  /** Called when the upload succeeds with the new image URL */
  onUpload: (imageUrl: string) => void;
}

export default function EventImageUpload({ currentImageUrl, onUpload }: EventImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const processFile = async (file: File) => {
    setError('');

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are accepted.');
      return;
    }

    if (file.size > MAX_BYTES) {
      setError(`File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`);
      return;
    }

    // Client-side dimension check — gives instant feedback before upload
    const dims = await readImageDimensions(file);
    if (dims.error) {
      setError(dims.error);
      return;
    }

    // Show local preview while uploading
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);

    try {
      const { data } = await uploadsApi.uploadEventImage(file);
      URL.revokeObjectURL(localUrl);
      setPreviewUrl(data.imageUrl);
      onUpload(data.imageUrl);
    } catch (err: unknown) {
      URL.revokeObjectURL(localUrl);
      setPreviewUrl(currentImageUrl ?? null);
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Upload failed. Please try again.';
      setError(msg);
    } finally {
      setUploading(false);
      // Reset file input so the same file can be re-selected after an error
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  return (
    <div className={styles.wrapper}>
      {/* Guidance */}
      <div className={styles.guidance} role="note" aria-label="Image upload requirements">
        <strong>Event image requirements</strong>
        <ul>
          <li>Aspect ratio: <strong>16:9</strong> (landscape) — required</li>
          <li>Recommended size: <strong>1920 × 1080 px</strong></li>
          <li>Minimum size: {MIN_WIDTH} × {MIN_HEIGHT} px</li>
          <li>Maximum file size: 5 MB</li>
          <li>Accepted formats: JPEG, PNG, WebP</li>
        </ul>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}

      {/* Uploading indicator */}
      {uploading && (
        <div className={styles.uploading} aria-live="polite">
          <span aria-hidden="true">⏳</span> Uploading image…
        </div>
      )}

      {/* Preview or dropzone */}
      {previewUrl && !uploading ? (
        <div className={styles.previewWrapper}>
          <img
            src={previewUrl}
            alt="Event image preview"
            className={styles.previewImg}
          />
          <div className={styles.previewOverlay} aria-hidden="true">
            <label className={styles.changeBtn}>
              Change image
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className={styles.hiddenInput}
                onChange={handleFileChange}
                aria-label="Replace event image"
              />
            </label>
          </div>
        </div>
      ) : (
        !uploading && (
          <label
            className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <span className={styles.dropzoneIcon} aria-hidden="true">🖼️</span>
            <span className={styles.dropzoneText}>Drop image here or click to browse</span>
            <span className={styles.dropzoneSubtext}>16:9 · 1920×1080 recommended · max 5 MB</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              aria-label="Upload event image"
            />
          </label>
        )
      )}
    </div>
  );
}
