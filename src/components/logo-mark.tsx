/**
 * Logo RuangAjar: topi wisuda (mortarboard) — dipakai di sidebar guru/siswa,
 * halaman login, favicon (public/favicon.svg), dan banner repo (docs/banner.svg).
 * fill="currentColor" agar mengikuti warna teks kontainernya.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" aria-hidden="true">
      {/* papan topi */}
      <path d="M32 13 L57 23.5 L32 34 L7 23.5 Z" />
      {/* kepala topi */}
      <path
        d="M19.5 27.5 L19.5 38 Q19.5 47 32 47 Q44.5 47 44.5 38 L44.5 27.5 L32 33.2 Z"
        opacity="0.95"
      />
      {/* tassel */}
      <rect x="55.2" y="23.5" width="2.4" height="13" rx="1.2" />
      <circle cx="56.4" cy="39.5" r="3.2" />
    </svg>
  )
}
