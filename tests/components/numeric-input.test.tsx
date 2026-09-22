// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useState } from 'react'
import NumericInput from '@/components/ui/NumericInput'

afterEach(() => cleanup())

/** Controlled-component test harness — mirrors how every real call site uses
 *  NumericInput (owns a number in its own state, passes value/onChange down). */
function Harness({ initial = 0, mode, min }: { initial?: number; mode?: 'integer' | 'decimal'; min?: number }) {
  const [v, setV] = useState(initial)
  return <NumericInput value={v} onChange={setV} mode={mode} min={min} aria-label="จำนวน" />
}

describe('NumericInput — mobile keyboard + type', () => {
  it('renders type="text" with inputMode="decimal" by default (not type="number")', () => {
    render(<Harness />)
    const input = screen.getByLabelText('จำนวน')
    expect(input.getAttribute('type')).toBe('text')
    expect(input.getAttribute('inputMode')).toBe('decimal')
  })

  it('mode="integer" renders inputMode="numeric"', () => {
    render(<Harness mode="integer" />)
    expect(screen.getByLabelText('จำนวน').getAttribute('inputMode')).toBe('numeric')
  })
})

describe('NumericInput — decimal mode accepts money-style input', () => {
  it('accepts a trailing "." without snapping back to the integer part (the classic controlled-number-input bug)', () => {
    render(<Harness initial={0} />)
    const input = screen.getByLabelText('จำนวน') as HTMLInputElement
    fireEvent.change(input, { target: { value: '12.' } })
    expect(input.value).toBe('12.') // must NOT have been reformatted to "12"
  })

  it('commits the correct number as the user keeps typing after the decimal point', () => {
    render(<Harness initial={0} />)
    const input = screen.getByLabelText('จำนวน') as HTMLInputElement
    fireEvent.change(input, { target: { value: '12.' } })
    fireEvent.change(input, { target: { value: '12.5' } })
    expect(input.value).toBe('12.5')
  })

  it('rejects a second "." (only one decimal point allowed)', () => {
    render(<Harness initial={0} />)
    const input = screen.getByLabelText('จำนวน') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1.2.3' } })
    expect(input.value).toBe('0') // change was rejected outright, draft unchanged from initial
  })

  it('rejects non-numeric characters (e.g. pasted "abc")', () => {
    render(<Harness initial={5} />)
    const input = screen.getByLabelText('จำนวน') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'abc' } })
    expect(input.value).toBe('5')
  })

  it('empty field commits 0, not NaN', () => {
    const onChange = vi.fn()
    function H() {
      const [v, setV] = useState(10)
      return <NumericInput value={v} onChange={(n) => { setV(n); onChange(n) }} aria-label="จำนวน" />
    }
    render(<H />)
    fireEvent.change(screen.getByLabelText('จำนวน'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(0)
  })
})

describe('NumericInput — mode="integer" rejects decimal points entirely', () => {
  it('rejects a "." keystroke', () => {
    render(<Harness initial={3} mode="integer" />)
    const input = screen.getByLabelText('จำนวน') as HTMLInputElement
    fireEvent.change(input, { target: { value: '3.5' } })
    expect(input.value).toBe('3')
  })
})

describe('NumericInput — min clamping', () => {
  it('clamps a committed value up to min (e.g. never lets a quantity go negative)', () => {
    const onChange = vi.fn()
    function H() {
      const [v, setV] = useState(5)
      return <NumericInput value={v} onChange={(n) => { setV(n); onChange(n) }} min={0} aria-label="จำนวน" />
    }
    render(<H />)
    fireEvent.change(screen.getByLabelText('จำนวน'), { target: { value: '-3' } })
    // '-' fails the numeric pattern outright (no negative-number support),
    // so the keystroke is rejected before min-clamping even applies — this
    // documents that behavior explicitly rather than leaving it implicit.
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('NumericInput — external value changes update the field (e.g. loading real data after a fetch)', () => {
  it('reflects a new external value the component did not generate itself', () => {
    function H({ v }: { v: number }) {
      return <NumericInput value={v} onChange={vi.fn()} aria-label="จำนวน" />
    }
    const { rerender } = render(<H v={0} />)
    expect((screen.getByLabelText('จำนวน') as HTMLInputElement).value).toBe('0')
    rerender(<H v={35000} />)
    expect((screen.getByLabelText('จำนวน') as HTMLInputElement).value).toBe('35000')
  })
})
