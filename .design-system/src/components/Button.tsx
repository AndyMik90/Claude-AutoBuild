import React from 'react'
import { cn } from '../lib/utils'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'success' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  pill?: boolean
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  pill = false,
  className,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2'

  const variants = {
    primary: 'bg-(--color-accent-primary) text-(--color-text-inverse) hover:bg-(--color-accent-primary-hover) focus:ring-(--color-accent-primary)',
    secondary: 'bg-transparent border border-(--color-border-default) text-(--color-text-primary) hover:bg-(--color-background-secondary)',
    ghost: 'bg-transparent text-(--color-text-secondary) hover:bg-(--color-background-secondary)',
    success: 'bg-(--color-semantic-success) text-white hover:opacity-90',
    danger: 'bg-(--color-semantic-error) text-white hover:opacity-90'
  }

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base'
  }

  const radius = pill ? 'rounded-full' : 'rounded-md'

  return (
    <button
      className={cn(baseStyles, variants[variant], sizes[size], radius, className)}
      {...props}
    >
      {children}
    </button>
  )
}
