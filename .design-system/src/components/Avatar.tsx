import React from 'react'
import { cn } from '../lib/utils'

export interface AvatarProps {
  src?: string
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  color?: string
}

export function Avatar({ src, name = 'User', size = 'md', color }: AvatarProps) {
  const sizes = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-xl',
    '2xl': 'w-[120px] h-[120px] text-3xl'
  }

  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  // Default to neutral gray, can be overridden with color prop
  const bgStyle = color
    ? { backgroundColor: color }
    : {}

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold border-2 border-(--color-surface-card) overflow-hidden',
        !color && 'bg-(--color-border-default)',
        sizes[size]
      )}
      style={bgStyle}
    >
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" />
      ) : (
        <span className={cn(color ? 'text-white' : 'text-(--color-text-primary)')}>{initials}</span>
      )}
    </div>
  )
}

interface AvatarGroupProps {
  avatars: { name: string; src?: string }[]
  max?: number
}

export function AvatarGroup({ avatars, max = 4 }: AvatarGroupProps) {
  const visible = avatars.slice(0, max)
  const remaining = avatars.length - max

  return (
    <div className="flex -space-x-2">
      {visible.map((avatar, i) => (
        <Avatar key={i} {...avatar} size="sm" />
      ))}
      {remaining > 0 && (
        <div className="w-8 h-8 rounded-full bg-(--color-background-secondary) flex items-center justify-center text-xs font-medium text-(--color-text-secondary) border-2 border-(--color-surface-card)">
          +{remaining}
        </div>
      )}
    </div>
  )
}
