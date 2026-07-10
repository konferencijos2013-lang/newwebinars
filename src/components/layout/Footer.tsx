export function Footer() {
  return (
    <footer className="border-border bg-card border-t py-4">
      <div className="text-muted-foreground mx-auto max-w-6xl px-4 text-center text-sm">
        &copy; {new Date().getFullYear()} NewWebinars
      </div>
    </footer>
  )
}
