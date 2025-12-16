import { MoreVertical, MessageSquare } from 'lucide-react'
import { Card, Avatar } from '../components'

export function TeamMembersCard() {
  const members = [
    { name: 'Julie Andrews', role: 'Project manager' },
    { name: 'Kevin Conroy', role: 'Project manager' },
    { name: 'Jim Connor', role: 'Project manager' },
    { name: 'Tom Kinley', role: 'Project manager' }
  ]

  return (
    <Card className="w-[320px]" padding={false}>
      <div className="divide-y divide-(--color-border-default)">
        {members.map((member, i) => (
          <div key={i} className="p-4 flex items-center gap-3">
            <Avatar name={member.name} />
            <div className="flex-1">
              <p className="text-heading-small">{member.name}</p>
              <p className="text-body-small text-(--color-text-secondary)">{member.role}</p>
            </div>
            <button className="p-1 hover:bg-(--color-background-secondary) rounded transition-colors">
              <MoreVertical className="w-4 h-4 text-(--color-text-tertiary)" />
            </button>
            <button className="p-2 bg-(--color-semantic-error-light) text-(--color-semantic-error) rounded-md hover:opacity-80 transition-opacity">
              <MessageSquare className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-(--color-border-default) flex justify-center gap-3">
        <img src="https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg" alt="Stripe" className="h-6" />
        <div className="px-3 py-1 bg-[#1A1F71] text-white text-sm font-bold rounded">VISA</div>
        <div className="px-2 py-1 bg-[#003087] text-white text-xs font-bold rounded">PayPal</div>
        <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-yellow-500 rounded-full" />
      </div>
    </Card>
  )
}
