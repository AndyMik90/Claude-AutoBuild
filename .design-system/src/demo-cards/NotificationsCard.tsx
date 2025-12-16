import { MoreVertical, Check, X } from 'lucide-react'
import { Card, Avatar, Badge, Button } from '../components'

export function NotificationsCard() {
  return (
    <Card className="w-[320px]" padding={false}>
      <div className="p-4 border-b border-(--color-border-default)">
        <div className="flex items-center justify-between">
          <h3 className="text-heading-small">Notifications</h3>
          <Badge variant="primary">6</Badge>
        </div>
        <p className="text-body-small text-(--color-text-tertiary) mt-1">Unread</p>
      </div>

      <div className="divide-y divide-(--color-border-default)">
        <div className="p-4 flex gap-3">
          <Avatar size="sm" name="Ashlynn George" />
          <div className="flex-1 min-w-0">
            <p className="text-body-small">
              <span className="font-semibold">Ashlynn George</span>
              <span className="text-(--color-text-tertiary)"> · 1h</span>
            </p>
            <p className="text-body-small text-(--color-text-secondary)">
              has invited you to access "Magma project"
            </p>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="success" pill>
                <Check className="w-3 h-3 mr-1" /> Accept
              </Button>
              <Button size="sm" variant="secondary" pill>
                <X className="w-3 h-3 mr-1" /> Deny request
              </Button>
            </div>
          </div>
          <button className="p-1 hover:bg-(--color-background-secondary) rounded self-start transition-colors">
            <MoreVertical className="w-4 h-4 text-(--color-text-tertiary)" />
          </button>
        </div>

        <div className="p-4 flex gap-3">
          <Avatar size="sm" name="Ashlynn George" />
          <div className="flex-1">
            <p className="text-body-small">
              <span className="font-semibold">Ashlynn George</span>
              <span className="text-(--color-text-tertiary)"> · 1h</span>
            </p>
            <p className="text-body-small text-(--color-text-secondary)">
              changed status of task in "Magma project"
            </p>
          </div>
          <button className="p-1 hover:bg-(--color-background-secondary) rounded self-start transition-colors">
            <MoreVertical className="w-4 h-4 text-(--color-text-tertiary)" />
          </button>
        </div>
      </div>

      <div className="p-4 flex gap-2 border-t border-(--color-border-default)">
        <Button variant="secondary" className="flex-1" pill>Mark all as read</Button>
        <Button variant="primary" className="flex-1" pill>View all</Button>
      </div>
    </Card>
  )
}
