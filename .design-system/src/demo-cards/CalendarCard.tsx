import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { Card } from '../components'

export function CalendarCard() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const dates = [
    [29, 30, 31, 1, 2, 3, 4],
    [5, 6, 7, 8, 9, 10, 11],
    [12, 13, 14, 15, 16, 17, 18],
    [19, 20, 21, 22, 23, 24, 25],
    [26, 27, 28, 29, 30, 31, 1]
  ]

  return (
    <Card className="w-[300px]">
      <div className="flex items-center justify-between mb-4">
        <button className="p-1 hover:bg-(--color-background-secondary) rounded transition-colors">
          <ChevronLeft className="w-5 h-5 text-(--color-text-tertiary)" />
        </button>
        <h3 className="text-heading-small">February, 2021</h3>
        <button className="p-1 hover:bg-(--color-background-secondary) rounded transition-colors">
          <ChevronRight className="w-5 h-5 text-(--color-text-tertiary)" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {days.map((day, i) => (
          <div key={i} className="text-label-small text-(--color-text-tertiary) py-2">
            {day}
          </div>
        ))}
        {dates.flat().map((date, i) => {
          const isCurrentMonth = (i < 3 && date > 20) || (i > 30 && date < 10) ? false : true
          const isSelected = date === 26 && isCurrentMonth
          const isToday = date === 16 && isCurrentMonth

          return (
            <button
              key={i}
              className={cn(
                'w-9 h-9 rounded-md text-body-medium transition-colors',
                !isCurrentMonth && 'text-(--color-text-tertiary)',
                isSelected && 'bg-(--color-accent-primary) text-(--color-text-inverse) rounded-full',
                isToday && !isSelected && 'text-(--color-accent-primary) font-semibold',
                !isSelected && 'hover:bg-(--color-background-secondary)'
              )}
            >
              {date}
            </button>
          )
        })}
      </div>
    </Card>
  )
}
