import React from 'react'
import { cn } from '../lib/utils'

export function Input({
  placeholder,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-10 w-full px-4 rounded-md border border-(--color-border-default)',
        'bg-(--color-surface-card) text-(--color-text-primary) text-sm',
        'focus:outline-none focus:border-(--color-accent-primary) focus:ring-2 focus:ring-(--color-accent-primary)/20',
        'placeholder:text-(--color-text-tertiary)',
        'transition-all duration-200',
        'disabled:bg-(--color-background-secondary) disabled:opacity-60',
        className
      )}
      placeholder={placeholder}
      {...props}
    />
  )
}
