// The mark: one ring built from four arcs, one per instrument. It is the
// product's own logic — four people, one loop — and it doubles as a record.
//
// In the top bar it turns exactly once per loop, driven by the same --phase
// the audio scheduler publishes. The logo is a loop that loops.

interface Props {
  size?: number
  /** Turn with the shared clock. Off for static contexts. */
  spin?: boolean
}

export function LogoMark({ size = 22, spin = false }: Props) {
  return (
    <svg
      className={spin ? 'brand-mark spin' : 'brand-mark'}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M 53.26 16.16 A 34 34 0 0 1 83.84 46.74"
        stroke="#FF6B5A"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M 83.84 53.26 A 34 34 0 0 1 53.26 83.84"
        stroke="#FFC24B"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M 46.74 83.84 A 34 34 0 0 1 16.16 53.26"
        stroke="#5FD6A6"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <path
        d="M 16.16 46.74 A 34 34 0 0 1 46.74 16.16"
        stroke="#8FA8FF"
        strokeWidth="13"
        strokeLinecap="round"
      />
      <circle cx="50" cy="50" r="6" fill="#F4EFE8" />
    </svg>
  )
}
