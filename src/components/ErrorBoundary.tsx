import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryState = { hasError: boolean }

export class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application error', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="bg-background text-foreground flex min-h-svh items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold">Nepavyko parodyti puslapio</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Atnaujinkite puslapį. Jei problema kartojasi, susisiekite su
            pagalba.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-primary text-primary-foreground mt-5 rounded-md px-4 py-2 text-sm font-medium"
          >
            Atnaujinti
          </button>
        </div>
      </main>
    )
  }
}
