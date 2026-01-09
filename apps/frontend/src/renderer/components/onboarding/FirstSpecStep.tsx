import { useState } from 'react';
import {
  FileText,
  Lightbulb,
  CheckCircle2,
  ArrowRight,
  PenLine,
  ListChecks,
  Target,
  Sparkles
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

interface FirstSpecStepProps {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onOpenTaskCreator: () => void;
}

interface TipCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function TipCard({ icon, title, description }: TipCardProps) {
  return (
    <Card className="border border-border bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <h3 className="font-medium text-foreground text-sm">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * First spec creation step for the onboarding wizard.
 * Guides users through creating their first task/spec with helpful tips
 * and provides an action to open the Task Creator.
 */
export function FirstSpecStep({ onNext, onBack, onSkip, onOpenTaskCreator }: FirstSpecStepProps) {
  const { t } = useTranslation('onboarding');
  const [hasCreatedSpec, setHasCreatedSpec] = useState(false);

  const tips = [
    {
      icon: <PenLine className="h-4 w-4" />,
      title: t('firstSpecStep.tips.beDescriptive.title'),
      description: t('firstSpecStep.tips.beDescriptive.description')
    },
    {
      icon: <Target className="h-4 w-4" />,
      title: t('firstSpecStep.tips.startSmall.title'),
      description: t('firstSpecStep.tips.startSmall.description')
    },
    {
      icon: <ListChecks className="h-4 w-4" />,
      title: t('firstSpecStep.tips.includeContext.title'),
      description: t('firstSpecStep.tips.includeContext.description')
    },
    {
      icon: <Sparkles className="h-4 w-4" />,
      title: t('firstSpecStep.tips.letAiHelp.title'),
      description: t('firstSpecStep.tips.letAiHelp.description')
    }
  ];

  const handleOpenTaskCreator = () => {
    setHasCreatedSpec(true);
    onOpenTaskCreator();
  };

  const handleContinue = () => {
    onNext();
  };

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 py-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <FileText className="h-7 w-7" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            {t('firstSpecStep.title')}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {t('firstSpecStep.description')}
          </p>
        </div>

        {/* Success state after opening task creator */}
        {hasCreatedSpec && (
          <Card className="border border-success/30 bg-success/10 mb-6">
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <CheckCircle2 className="h-6 w-6 text-success shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-success">
                    {t('firstSpecStep.taskCreatorOpened')}
                  </h3>
                  <p className="mt-1 text-sm text-success/80">
                    {t('firstSpecStep.successMessage')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tips section */}
        <div className="space-y-4 mb-8">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Lightbulb className="h-4 w-4" />
            {t('firstSpecStep.tipsTitle')}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tips.map((tip, index) => (
              <TipCard
                key={index}
                icon={tip.icon}
                title={tip.title}
                description={tip.description}
              />
            ))}
          </div>
        </div>

        {/* Example task card */}
        <Card className="border border-info/30 bg-info/10 mb-8">
          <CardContent className="p-5">
            <div className="flex items-start gap-4">
              <FileText className="h-5 w-5 text-info shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {t('firstSpecStep.exampleTitle')}
                </p>
                <p className="text-sm text-muted-foreground italic">
                  {t('firstSpecStep.exampleDescription')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Primary action */}
        <div className="flex justify-center mb-6">
          <Button
            size="lg"
            onClick={handleOpenTaskCreator}
            className="gap-2 px-8"
          >
            <ArrowRight className="h-5 w-5" />
            {t('firstSpecStep.openTaskCreator')}
          </Button>
        </div>

        {/* Skip info */}
        <p className="text-center text-sm text-muted-foreground mb-2">
          {hasCreatedSpec
            ? t('firstSpecStep.continueMessage')
            : t('firstSpecStep.skipMessage')}
        </p>

        {/* Action Buttons */}
        <div className="flex justify-between items-center mt-10 pt-6 border-t border-border">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground"
          >
            {t('firstSpecStep.back')}
          </Button>
          <div className="flex gap-4">
            <Button
              variant="ghost"
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground"
            >
              {t('firstSpecStep.skip')}
            </Button>
            <Button onClick={handleContinue}>
              {t('firstSpecStep.continue')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
