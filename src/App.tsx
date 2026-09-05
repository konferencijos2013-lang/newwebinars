import { ErrorBoundary } from './components/ErrorBoundary'
import { AppRoutes } from './routes'

function App() {
  return (
    <ErrorBoundary>
      <AppRoutes />
    </ErrorBoundary>
  )
}

export default App
