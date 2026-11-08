import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// Base path aplikasi.
// - "/" (default) untuk dev server dan hosting di domain root (Vercel, Netlify, …).
// - Untuk GitHub Pages project site (https://<user>.github.io/<repo>/), set
//   VITE_BASE_PATH=/<repo>/ saat build — workflow deploy di .github/workflows
//   sudah melakukannya otomatis.
// - Bisa juga dipaksa lewat flag CLI: `vite build --base=/LMS/`.
const base = process.env.VITE_BASE_PATH || "/"

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
