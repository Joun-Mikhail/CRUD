import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { formatOhms, MAX_READINGS, parseDecimal, type ReadingInput } from './ohmsLaw'

/** One row's V/I while typing, or a dash if the row is not complete yet. */
function rowResistance(row: ReadingInput): string {
  const v = parseDecimal(row.voltage)
  const i = parseDecimal(row.currentMa)
  return v > 0 && i > 0 ? formatOhms(v / (i / 1000)) : '—'
}

/** Editable measurement table: voltage in volts, current in milliamperes, live R = V / I. */
export function ReadingsTable({
  rows,
  rowErrors,
  onChange,
}: {
  rows: ReadingInput[]
  /** Error per row, shown only after a save attempt. */
  rowErrors: (string | undefined)[]
  onChange: (rows: ReadingInput[]) => void
}) {
  const update = (index: number, field: keyof ReadingInput, value: string) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)))

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Measured voltage and current for each reading</caption>
          <thead className="bg-subtle">
            <tr className="text-left text-xs text-muted">
              <th scope="col" className="w-9 py-2 pl-3 font-medium">
                #
              </th>
              <th scope="col" className="px-1.5 py-2 font-medium">
                Voltage V (V)
              </th>
              <th scope="col" className="px-1.5 py-2 font-medium">
                Current I (mA)
              </th>
              <th scope="col" className="w-20 px-1.5 py-2 text-right font-medium sm:w-28">
                Resistance R (Ω)
              </th>
              <th scope="col" className="w-11 py-2">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, index) => {
              const error = rowErrors[index]
              return (
                <tr key={index} className="align-top">
                  <td className="pt-4 pl-3 text-xs text-muted tabular-nums">{index + 1}</td>
                  <td className="px-1.5 py-2">
                    <Input
                      label={`Voltage, reading ${index + 1}`}
                      hideLabel
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="V"
                      value={row.voltage}
                      onChange={(event) => update(index, 'voltage', event.target.value)}
                      error={error}
                    />
                  </td>
                  <td className="px-1.5 py-2">
                    <Input
                      label={`Current, reading ${index + 1}`}
                      hideLabel
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="mA"
                      value={row.currentMa}
                      onChange={(event) => update(index, 'currentMa', event.target.value)}
                      aria-invalid={error ? true : undefined}
                    />
                  </td>
                  <td className="px-1.5 pt-4 text-right font-medium text-fg tabular-nums">{rowResistance(row)}</td>
                  <td className="py-2 pr-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1"
                      aria-label={`Remove reading ${index + 1}`}
                      disabled={rows.length <= 1}
                      onClick={() => onChange(rows.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          icon={<Plus aria-hidden="true" className="size-4" />}
          disabled={rows.length >= MAX_READINGS}
          onClick={() => onChange([...rows, { voltage: '', currentMa: '' }])}
        >
          Add reading
        </Button>
        <span className="text-xs text-muted">
          Up to {MAX_READINGS} readings. Empty rows are ignored. A decimal comma or point both work.
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">
        Resistance R = V / I needs the current in amperes, so each row converts it first: I (A) = I (mA) / 1000. Example:
        4.6 mA = 0.0046 A, so R = 1.0 V / 0.0046 A ≈ 217 Ω.
      </p>
    </>
  )
}
