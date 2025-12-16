import React from 'react'
import { cn } from '../lib/utils'

export interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: boolean
}

export function Card({
  children,
  className,
  padding = true
}: CardProps) {
  return (
    <div className={cn(
      'bg-(--color-surface-card) rounded-xl shadow-md',
      padding && 'p-6',
      className
    )}>
      {children}
    </div>
  )
}
