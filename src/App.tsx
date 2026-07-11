import { AppRoutes } from './routes'

// #region agent log
fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
  body: JSON.stringify({
    sessionId: '85756a',
    id: 'log_app_import',
    runId: 'initial',
    hypothesisId: 'D',
    location: 'src/App.tsx:1',
    message: 'App module loaded',
    data: {},
    timestamp: Date.now(),
  }),
}).catch(() => {})
// #endregion

function App() {
  // #region agent log
  fetch('http://127.0.0.1:7510/ingest/98e51e74-2cb8-43d7-ae19-9d551565ede3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '85756a' },
    body: JSON.stringify({
      sessionId: '85756a',
      id: 'log_app_render',
      runId: 'initial',
      hypothesisId: 'D',
      location: 'src/App.tsx:5',
      message: 'App render called',
      data: {},
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  return <AppRoutes />
}

export default App
