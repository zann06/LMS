/** Aturan file pengumpulan tugas (sama dengan batas bucket 'submissions' di database). */
export const SUBMISSION_BUCKET = 'submissions'
export const MAX_SUBMISSION_MB = 10
export const SUBMISSION_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.doc,.docx'

const ALLOWED_EXT = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'doc', 'docx']

/** Nama file aman untuk path Storage (tanpa spasi/karakter khusus/non-ASCII). */
export function safeFileName(name: string) {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\-]+/g, '_').slice(-100) || 'file'
}

/** Kembalikan pesan error bila file tidak boleh diunggah; null bila aman. */
export function validateSubmissionFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!ALLOWED_EXT.includes(ext)) return 'Format file harus PDF, gambar (JPG/PNG/WEBP), atau Word'
  if (file.size === 0) return 'File kosong'
  if (file.size > MAX_SUBMISSION_MB * 1024 * 1024) return `Ukuran file maksimal ${MAX_SUBMISSION_MB} MB`
  return null
}

export const fileNameOf = (path: string | null | undefined) => (path ? path.split('/').pop()!.replace(/^\d+_/, '') : '')
