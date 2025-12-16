import { MoreVertical } from 'lucide-react'
import { Card, ProgressCircle, AvatarGroup } from '../components'

export function ProjectStatusCard() {
  return (
    <Card className="w-[380px]">
      <div className="flex justify-between items-start mb-4">
        <ProgressCircle value={43} size="md" />
        <button className="p-1 hover:bg-(--color-background-secondary) rounded transition-colors">
          <MoreVertical className="w-5 h-5 text-(--color-text-tertiary)" />
        </button>
      </div>

      <h3 className="text-heading-large mb-2">Amber website redesign</h3>
      <p className="text-body-medium text-(--color-text-secondary) mb-4">
        In today's fast-paced digital landscape, our mission is to transform our website into a more intuitive, engaging, and user-friendly platfor...
      </p>

      <AvatarGroup
        avatars={[
          { name: 'User 1' },
          { name: 'User 2' },
          { name: 'User 3' },
          { name: 'User 4' },
          { name: 'User 5' }
        ]}
        max={4}
      />
    </Card>
  )
}
