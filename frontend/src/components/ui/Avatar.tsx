import { getInitials } from '../../utils/format'

import './Avatar.css'

interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  highlighted?: boolean
  muted?: boolean
}

export function Avatar({ name, size = 'sm', highlighted = false, muted = false }: AvatarProps) {
  const classes = [
    'ui-avatar',
    `ui-avatar--${size}`,
    highlighted ? 'ui-avatar--highlighted' : '',
    muted ? 'ui-avatar--muted' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} aria-hidden="true">
      {getInitials(name)}
    </span>
  )
}
