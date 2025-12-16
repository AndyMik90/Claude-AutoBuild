import { MoreVertical } from 'lucide-react'
import { Card, Avatar, Badge } from '../components'

export function ProfileCard() {
  return (
    <Card className="w-[280px]">
      <div className="flex justify-end mb-4">
        <button className="p-1 hover:bg-(--color-background-secondary) rounded transition-colors">
          <MoreVertical className="w-5 h-5 text-(--color-text-tertiary)" />
        </button>
      </div>
      <div className="flex flex-col items-center text-center">
        <Avatar size="2xl" name="Christine Thompson" />
        <h3 className="text-heading-large mt-4">Christine Thompson</h3>
        <p className="text-body-medium text-(--color-text-secondary)">Project manager</p>
        <div className="flex flex-wrap gap-2 mt-4 justify-center">
          <Badge variant="outline">UI/UX Design</Badge>
          <Badge variant="outline">Project management</Badge>
          <Badge variant="outline">Agile methodologies</Badge>
        </div>
      </div>
    </Card>
  )
}
