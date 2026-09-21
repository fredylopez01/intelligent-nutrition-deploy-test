import type { ButtonHTMLAttributes, ReactNode } from 'react'

import './Button.css'

type ButtonVariant = 'primary' | 'outline' | 'danger' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  fullWidth?: boolean
  children: ReactNode
}

export function Button({
  variant = 'primary',
  fullWidth = false,
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    fullWidth ? 'ui-button--full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
