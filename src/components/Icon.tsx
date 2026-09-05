// One authored set. 24x24 box, 1.75 stroke, round caps and joins, no fills
// except where a shape is genuinely solid (the record dot). Consistency here
// is the whole point of not reaching for emoji.

interface Props {
  name: keyof typeof PATHS
  size?: number
  className?: string
}

const PATHS = {
  arrowRight: <path d="M4 12h15m0 0-6-6m6 6-6 6" />,
  arrowLeft: <path d="M20 12H5m0 0 6-6m-6 6 6 6" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15" />
    </>
  ),
  check: <path d="m5 13 4.5 4.5L19 7" />,
  sound: (
    <>
      <path d="M4 9.5h3.2L12 5.2v13.6L7.2 14.5H4z" />
      <path d="M16 9.2a4 4 0 0 1 0 5.6M18.8 6.4a8 8 0 0 1 0 11.2" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 9.5h3.2L12 5.2v13.6L7.2 14.5H4z" />
      <path d="m16.5 9.5 5 5m0-5-5 5" />
    </>
  ),
  record: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none" />
    </>
  ),
  download: <path d="M12 3.5v12m0 0 4.5-4.5M12 15.5 7.5 11M4.5 19.5h15" />,
  undo: <path d="M8.5 8.5 4 13l4.5 4.5M4 13h10.5A5.5 5.5 0 0 0 20 7.5" />,
  eraser: (
    <>
      <path d="m8.6 20-4.2-4.2a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l4.2 4.2a2 2 0 0 1 0 2.8L13.5 20z" />
      <path d="M8.6 20H20M9.8 10.2l6 6" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  skip: <path d="M6 5.5v13l9-6.5zM18 5.5v13" />,
} as const

export function Icon({ name, size = 17, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: 'none' }}
    >
      {PATHS[name]}
    </svg>
  )
}
