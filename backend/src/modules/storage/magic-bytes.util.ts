type MagicValidator = (buffer: Buffer) => boolean;

const MAGIC_VALIDATORS: Record<string, MagicValidator> = {
  "image/jpeg": (b) =>
    b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,

  "image/png": (b) =>
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a,

  "image/webp": (b) =>
    b.length >= 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP",

  "image/avif": (b) =>
    b.length >= 12 && b.toString("ascii", 4, 12) === "ftypavif",
};

export function matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const validator = MAGIC_VALIDATORS[mimeType];
  return validator ? validator(buffer) : false;
}

export const SUPPORTED_MIME_TYPES = Object.keys(MAGIC_VALIDATORS);

export const MAGIC_BYTES_LENGTH = 16;
