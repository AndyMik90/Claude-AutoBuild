import { useState } from 'react'
import { Slack, Video, Github } from 'lucide-react'
import { Card, Toggle } from '../components'

export function IntegrationsCard() {
  const [slack, setSlack] = useState(true)
  const [meet, setMeet] = useState(true)
  const [github, setGithub] = useState(false)

  const integrations = [
    { icon: Slack, name: 'Slack', desc: 'Used as a main source of communication', enabled: slack, toggle: setSlack, color: '#E91E63' },
    { icon: Video, name: 'Google meet', desc: 'Used for all types of calls', enabled: meet, toggle: setMeet, color: '#00897B' },
    { icon: Github, name: 'Github', desc: 'Enables automated workflows, code synchronization', enabled: github, toggle: setGithub, color: '#333' }
  ]

  return (
    <Card className="w-[320px]">
      <h3 className="text-heading-medium mb-4">Integrations</h3>

      <div className="space-y-4">
        {integrations.map((int, i) => (
          <div key={i} className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${int.color}15` }}
            >
              <int.icon className="w-5 h-5" style={{ color: int.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-heading-small">{int.name}</p>
              <p className="text-body-small text-(--color-text-secondary) truncate">{int.desc}</p>
            </div>
            <Toggle checked={int.enabled} onChange={int.toggle} />
          </div>
        ))}
      </div>
    </Card>
  )
}
