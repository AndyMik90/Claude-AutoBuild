import { Card, Button, ProgressCircle, AvatarGroup } from '../components'

export function MilestoneCard() {
  return (
    <Card className="w-[380px]">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-heading-medium">Wireframes milestone</h3>
        <Button variant="secondary" size="sm" pill>View details</Button>
      </div>

      <div className="flex items-center gap-6">
        <div>
          <p className="text-body-small text-(--color-text-secondary)">Due date:</p>
          <p className="text-heading-small">March 20th</p>
        </div>

        <ProgressCircle value={39} size="lg" />

        <div>
          <p className="text-body-small text-(--color-text-secondary)">Asignees:</p>
          <AvatarGroup
            avatars={[
              { name: 'A' },
              { name: 'B' },
              { name: 'C' },
              { name: 'D' },
              { name: 'E' }
            ]}
            max={4}
          />
        </div>
      </div>
    </Card>
  )
}
