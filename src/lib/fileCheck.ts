// Security step 3 (finding F10): the storage server only checks the file type the app declares, not what is inside.
// So before every upload the app looks at the first bytes and refuses anything that is not really a picture, PDF,
// sound or video (for example a web page or a program renamed to .jpg).
export type FileType = 'jpeg' | 'png' | 'pdf' | 'mp4' | 'aac' | 'mp3' | 'ogg' | 'amr';
export type UploadKind = 'image' | 'pdf' | 'audio' | 'video';

const ALLOWED: Record<UploadKind, FileType[]> = {
  image: ['jpeg', 'png'],
  pdf: ['pdf'],
  audio: ['mp4', 'aac', 'mp3', 'ogg', 'amr'],   // m4a sound is an mp4 container
  video: ['mp4'],                                // mp4 and 3gp share the same "ftyp" start
};

const starts = (b: Uint8Array, bytes: number[], at = 0): boolean => b.length >= at + bytes.length && bytes.every((x, i) => b[at + i] === x);
const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));

export function sniff(buf: ArrayBuffer): FileType | null {
  const b = new Uint8Array(buf, 0, Math.min(buf.byteLength, 16));
  if (starts(b, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (starts(b, ascii('%PDF-'))) return 'pdf';
  if (starts(b, ascii('ftyp'), 4)) return 'mp4';
  if (starts(b, ascii('ID3'))) return 'mp3';
  if (starts(b, ascii('OggS'))) return 'ogg';
  if (starts(b, ascii('#!AMR'))) return 'amr';
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xf6) === 0xf0) return 'aac';   // ADTS sync word
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';   // MPEG audio frame
  return null;
}

/** Throws an error with code 'bad-file' unless the bytes really are the kind of file being uploaded. */
export function checkFile(buf: ArrayBuffer, kind: UploadKind): void {
  const t = sniff(buf);
  if (!t || !ALLOWED[kind].includes(t)) throw Object.assign(new Error('bad-file'), { code: 'bad-file' });
}
