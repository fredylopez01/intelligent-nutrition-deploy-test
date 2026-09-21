import './MediaPlaceholder.css'

interface MediaPlaceholderProps {
  label: string
}

export function MediaPlaceholder({ label }: MediaPlaceholderProps) {
  return (
    <div className="media-placeholder">
      <svg
        className="media-placeholder__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        aria-hidden="true"
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="8.5" cy="9.5" r="1.5" />
        <path d="m3 16 5-4 4 3 3-2 6 5" />
      </svg>
      <span className="media-placeholder__label">{label}</span>
    </div>
  )
}
