import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: 5173,
      /**
       * The client calls /api/v1/... — proxying keeps the browser same-origin
       * in dev, so no CORS setup is needed on the backend.
       *
       * This is **required**, not a convenience: auth tokens now arrive as
       * `HttpOnly; SameSite=Lax` cookies. A cross-origin request would neither
       * be allowed to set them nor send them back, so the app only works
       * same-origin.
       */
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET ?? 'https://petrox.quicko.rw',
          changeOrigin: true,
          /**
           * The backend sets cookies without a Domain, so they bind to the
           * upstream host. Rewriting to '' rebinds them to whatever host the
           * dev server is on, so the browser stores and returns them.
           */
          cookieDomainRewrite: '',
          /**
           * 🔴 **Strips `Secure` and `SameSite=None` in dev.**
           *
           * The API sets both flags — correct for its own HTTPS origin, and
           * required there, since `SameSite=None` is only honoured alongside
           * `Secure`. But the dev server is plain `http://localhost:5173`, and
           * a browser silently **refuses to store a `Secure` cookie over HTTP**.
           *
           * The symptom is specific and misleading: login appears to work,
           * because the response carries the user and the store is populated in
           * memory — but nothing is persisted, so the first request after a
           * reload is anonymous, `/auth/refresh` 401s, and the interceptor
           * redirects to `/login`. It reads as "refreshing logs me out".
           *
           * Rewriting the header here keeps the flags intact upstream and in
           * production; only the copy the dev browser sees is relaxed.
           */
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const setCookie = proxyRes.headers['set-cookie']
              if (!setCookie) return
              proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
                cookie
                  .replace(/;\s*Secure/gi, '')
                  // `None` needs `Secure`; `Lax` is what a same-origin proxy wants.
                  .replace(/;\s*SameSite=None/gi, '; SameSite=Lax'),
              )
            })
          },
        },
      },
    },
  }
})
