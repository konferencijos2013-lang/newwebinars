import type { GuideVisuals } from './evergreenGuide'

export function ProcessFigure({ visuals }: { visuals: GuideVisuals }) {
  return (
    <figure className="mt-6">
      <ol className="grid gap-3 sm:grid-cols-3">
        {visuals.process.map((step, index) => (
          <li key={step.title} className="bg-card rounded-2xl border p-4">
            <p className="text-primary text-xs font-bold">{index + 1}</p>
            <p className="mt-2 font-semibold">{step.title}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">{step.text}</p>
          </li>
        ))}
      </ol>
      <figcaption className="text-muted-foreground mt-2 text-xs">
        {visuals.processLabel}
      </figcaption>
    </figure>
  )
}

export function CompareFigure({ visuals }: { visuals: GuideVisuals }) {
  return (
    <figure className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            {visuals.compareHeaders.map((header) => (
              <th key={header || 'aspect'} className="p-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visuals.compareRows.map((row) => (
            <tr key={row.aspect} className="border-t">
              <th className="p-2 font-medium">{row.aspect}</th>
              <td className="p-2">{row.live}</td>
              <td className="p-2">{row.evergreen}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="text-muted-foreground mt-2 text-xs">
        {visuals.compareLabel}
      </figcaption>
    </figure>
  )
}

export function FunnelFigure({ visuals }: { visuals: GuideVisuals }) {
  return (
    <figure className="mt-6">
      <ol className="mx-auto grid max-w-md gap-2">
        {visuals.funnel.map((step, index) => (
          <li
            key={step.title}
            className="bg-card rounded-2xl border px-4 py-3"
            style={{ width: `${100 - index * 12}%`, marginInline: 'auto' }}
          >
            <p className="font-semibold">{step.title}</p>
            <p className="text-muted-foreground mt-1 text-sm leading-6">{step.text}</p>
          </li>
        ))}
      </ol>
      <figcaption className="text-muted-foreground mt-2 text-xs">
        {visuals.funnelLabel}
      </figcaption>
    </figure>
  )
}
