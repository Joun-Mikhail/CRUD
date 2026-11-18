import type { ReactNode } from 'react'

/**
 * The LabProof banner: navy → electric-blue gradient with a restrained violet glow.
 * Its colours are fixed (not theme tokens), so white text keeps its contrast in both themes.
 */
export function LabHero({
  title,
  text,
  action,
  level = 1,
}: {
  title: string
  text: string
  action?: ReactNode
  /** 1 on the LabProof page itself, 2 when the banner is embedded in another page. */
  level?: 1 | 2
}) {
  const Heading = level === 1 ? 'h1' : 'h2'
  return (
    <section className="relative overflow-hidden rounded-xl bg-linear-to-br from-navy via-navy-2 to-electric p-6 text-white shadow-pop sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-hero-violet/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute right-6 bottom-4 hidden opacity-30 sm:block">
        {/* a tiny V–I line, as a visual motif */}
        <svg viewBox="0 0 120 60" className="h-16 w-32">
          <line x1="4" y1="56" x2="116" y2="4" className="stroke-white" strokeWidth="2" strokeDasharray="5 4" />
          {[18, 42, 66, 90].map((x) => (
            <circle key={x} cx={x} cy={56 - ((x - 4) * 52) / 112} r="3.5" className="fill-white" />
          ))}
        </svg>
      </div>
      <p className="relative text-xs font-semibold tracking-widest text-blue-100 uppercase">
        LabProof Lite · Engineering lab module
      </p>
      <Heading className="relative mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</Heading>
      <p className="relative mt-2 max-w-xl text-sm text-blue-100">{text}</p>
      <p className="relative mt-2 max-w-xl text-xs text-blue-100">
        Part of Serverless Notes, the bachelor’s thesis system: every experiment is saved as a private note through the
        same authenticated API.
      </p>
      {action ? <div className="relative mt-5 flex flex-wrap gap-2">{action}</div> : null}
    </section>
  )
}
