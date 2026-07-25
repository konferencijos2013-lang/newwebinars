import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/globals.css'
import App from './App.tsx'
import './i18n/config.ts'

// #region agent log
fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Debug-Session-Id': '85756a',
  },
  body: JSON.stringify({
    sessionId: '85756a',
    id: 'log_main_entry',
    runId: 'initial',
    hypothesisId: 'A',
    location: 'src/main.tsx:7',
    message: 'Main entry reached',
    data: {
      hasRoot: !!document.getElementById('root'),
      envUrl: import.meta.env.VITE_SUPABASE_URL ? 'set' : 'missing',
      envKey: import.meta.env.VITE_SUPABASE_ANON_KEY ? 'set' : 'missing',
    },
    timestamp: Date.now(),
  }),
}).catch(() => {})
// #endregion

const root = document.getElementById('root')
if (!root) {
  // #region agent log
  fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '85756a',
    },
    body: JSON.stringify({
      sessionId: '85756a',
      id: 'log_no_root',
      runId: 'initial',
      hypothesisId: 'B',
      location: 'src/main.tsx:8',
      message: 'Root element not found',
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
