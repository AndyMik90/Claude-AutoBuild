import { Sparkles, Zap, Brain, FileCode } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface WelcomeStepProps {
  onGetStarted: () => void;
  onSkip: () => void;
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <Card className="border border-border bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <h3 className="font-medium text-foreground">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Welcome step component for the onboarding wizard.
 * Displays a welcome message with a feature overview and actions to get started or skip.
 */
export function WelcomeStep({ onGetStarted, onSkip }: WelcomeStepProps) {
  const features = [
    {
      icon: <Sparkles className="h-5 w-5" />,
      title: 'AI-Powered Development',
      description: 'Generate code and build features using Claude Code agents'
    },
    {
      icon: <FileCode className="h-5 w-5" />,
      title: 'Spec-Driven Workflow',
      description: 'Define tasks with clear specifications and let Auto Claude handle the implementation'
    },
    {
      icon: <Brain className="h-5 w-5" />,
      title: 'Memory & Context',
      description: 'Optional Graphiti integration for persistent memory across sessions'
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: 'Parallel Execution',
      description: 'Run multiple agents in parallel for faster development cycles'
    }
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-2xl">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">
            Welcome to Auto Claude
          </h1>
          <p className="mt-3 text-muted-foreground text-lg">
            Build software autonomously with AI-powered agents
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          {features.map((feature, index) => (
            <FeatureCard
              key={index}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
            />
          ))}
        </div>

        {/* Description */}
        <div className="text-center mb-8">
          <p className="text-muted-foreground">
            This wizard will help you set up your environment in just a few steps.
            You can configure your Claude OAuth token, optionally set up memory features,
            and create your first task.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            onClick={onGetStarted}
            className="gap-2 px-8"
          >
            <Sparkles className="h-5 w-5" />
            Get Started
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground hover:text-foreground"
          >
            Skip Setup
          </Button>
        </div>
      </div>
    </div>
  );
}
