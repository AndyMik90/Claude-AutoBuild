import React from 'react'
import { cn } from '../lib/utils'

export interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'outline'
}

export function Badge({ children, variant = 'default' }: BadgeProps) {
  const variants = {
    default: 'bg-(--color-background-secondary) text-(--color-text-secondary)',
    primary: 'bg-(--color-accent-primary-light) text-(--color-accent-primary)',
    success: 'bg-(--color-semantic-success-light) text-(--color-semantic-success)',
    warning: 'bg-(--color-semantic-warning-light) text-(--color-semantic-warning)',
    error: 'bg-(--color-semantic-error-light) text-(--color-semantic-error)',
    outline: 'bg-transparent border border-(--color-border-default) text-(--color-text-secondary)'
  }

  return (
    <span className={cn(
      'inline-flex items-center px-3 py-1 rounded-full text-label-small',
      variants[variant]
    )}>
      {children}
    </span>
  )
}
