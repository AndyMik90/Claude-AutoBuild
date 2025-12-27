/**
 * Feature Overview Component
 *
 * A comprehensive overview of all Auto-Claude features.
 * Helps users understand what the application can do.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTourContext } from '../../contexts/TourContext';

interface FeatureCardProps {
  icon: string;
  titleKey: string;
  descriptionKey: string;
  stepsKeys: string[];
  tourId?: 'tasks' | 'ideation' | 'roadmap';
}

function FeatureCard({ icon, titleKey, descriptionKey, stepsKeys, tourId }: FeatureCardProps) {
  const { t } = useTranslation('common');
  const { startFeatureTour } = useTourContext();

  return (
    <div className="feature-card">
      <div className="feature-card-header">
        <span className="feature-icon">{icon}</span>
        <h3>{t(titleKey)}</h3>
      </div>
      <p className="feature-description">{t(descriptionKey)}</p>
      <div className="feature-steps">
        <h4>{t('featureOverview.howItWorks')}</h4>
        <ol>
          {stepsKeys.map((stepKey, index) => (
            <li key={index}>{t(stepKey)}</li>
          ))}
        </ol>
      </div>
      {tourId && (
        <button
          className="feature-tour-button"
          onClick={() => startFeatureTour(tourId)}
        >
          {t('featureOverview.learnMore')}
        </button>
      )}
    </div>
  );
}

export function FeatureOverview() {
  const { t } = useTranslation('common');
  const { startMainTour } = useTourContext();

  const features = [
    {
      icon: '📋',
      titleKey: 'featureOverview.features.kanban.title',
      descriptionKey: 'featureOverview.features.kanban.description',
      stepsKeys: [
        'featureOverview.features.kanban.step1',
        'featureOverview.features.kanban.step2',
        'featureOverview.features.kanban.step3',
        'featureOverview.features.kanban.step4',
        'featureOverview.features.kanban.step5'
      ],
      tourId: 'tasks' as const
    },
    {
      icon: '💡',
      titleKey: 'featureOverview.features.ideation.title',
      descriptionKey: 'featureOverview.features.ideation.description',
      stepsKeys: [
        'featureOverview.features.ideation.step1',
        'featureOverview.features.ideation.step2',
        'featureOverview.features.ideation.step3'
      ],
      tourId: 'ideation' as const
    },
    {
      icon: '🗺️',
      titleKey: 'featureOverview.features.roadmap.title',
      descriptionKey: 'featureOverview.features.roadmap.description',
      stepsKeys: [
        'featureOverview.features.roadmap.step1',
        'featureOverview.features.roadmap.step2',
        'featureOverview.features.roadmap.step3'
      ],
      tourId: 'roadmap' as const
    },
    {
      icon: '🖥️',
      titleKey: 'featureOverview.features.terminals.title',
      descriptionKey: 'featureOverview.features.terminals.description',
      stepsKeys: [
        'featureOverview.features.terminals.step1',
        'featureOverview.features.terminals.step2',
        'featureOverview.features.terminals.step3'
      ]
    },
    {
      icon: '🔀',
      titleKey: 'featureOverview.features.git.title',
      descriptionKey: 'featureOverview.features.git.description',
      stepsKeys: [
        'featureOverview.features.git.step1',
        'featureOverview.features.git.step2',
        'featureOverview.features.git.step3'
      ]
    }
  ];

  return (
    <div className="feature-overview">
      <div className="feature-overview-header">
        <h1>{t('featureOverview.title')}</h1>
        <p className="feature-overview-subtitle">{t('featureOverview.subtitle')}</p>
        <button className="start-tour-button" onClick={startMainTour}>
          {t('featureOverview.startTour')}
        </button>
      </div>

      <div className="feature-overview-intro">
        <h2>{t('featureOverview.whatIs.title')}</h2>
        <p>{t('featureOverview.whatIs.description')}</p>
      </div>

      <div className="feature-cards">
        {features.map((feature, index) => (
          <FeatureCard key={index} {...feature} />
        ))}
      </div>

      <div className="feature-overview-footer">
        <h2>{t('featureOverview.getStarted.title')}</h2>
        <p>{t('featureOverview.getStarted.description')}</p>
        <div className="quick-start-steps">
          <div className="quick-start-step">
            <span className="step-number">1</span>
            <span>{t('featureOverview.getStarted.step1')}</span>
          </div>
          <div className="quick-start-step">
            <span className="step-number">2</span>
            <span>{t('featureOverview.getStarted.step2')}</span>
          </div>
          <div className="quick-start-step">
            <span className="step-number">3</span>
            <span>{t('featureOverview.getStarted.step3')}</span>
          </div>
        </div>
      </div>

      <style>{`
        .feature-overview {
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 24px;
        }

        .feature-overview-header {
          text-align: center;
          margin-bottom: 48px;
        }

        .feature-overview-header h1 {
          font-size: 32px;
          font-weight: 700;
          color: var(--text-primary, #1a1a1a);
          margin: 0 0 8px 0;
        }

        .feature-overview-subtitle {
          font-size: 18px;
          color: var(--text-secondary, #666);
          margin: 0 0 24px 0;
        }

        .start-tour-button {
          background: var(--primary-color, #6366f1);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 14px 28px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .start-tour-button:hover {
          background: var(--primary-hover, #4f46e5);
        }

        .feature-overview-intro {
          background: linear-gradient(135deg, var(--primary-color, #6366f1) 0%, #8b5cf6 100%);
          color: white;
          padding: 32px;
          border-radius: 16px;
          margin-bottom: 48px;
        }

        .feature-overview-intro h2 {
          font-size: 24px;
          margin: 0 0 12px 0;
        }

        .feature-overview-intro p {
          font-size: 16px;
          line-height: 1.6;
          margin: 0;
          opacity: 0.95;
        }

        .feature-cards {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
          gap: 24px;
          margin-bottom: 48px;
        }

        .feature-card {
          background: var(--bg-primary, white);
          border: 1px solid var(--border-color, #e5e5e5);
          border-radius: 12px;
          padding: 24px;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .feature-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.1);
        }

        .feature-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }

        .feature-icon {
          font-size: 32px;
        }

        .feature-card-header h3 {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-primary, #1a1a1a);
          margin: 0;
        }

        .feature-description {
          font-size: 14px;
          color: var(--text-secondary, #666);
          line-height: 1.5;
          margin: 0 0 16px 0;
        }

        .feature-steps {
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .feature-steps h4 {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary, #666);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 12px 0;
        }

        .feature-steps ol {
          margin: 0;
          padding-left: 20px;
        }

        .feature-steps li {
          font-size: 14px;
          color: var(--text-primary, #1a1a1a);
          margin-bottom: 8px;
          line-height: 1.4;
        }

        .feature-steps li:last-child {
          margin-bottom: 0;
        }

        .feature-tour-button {
          background: transparent;
          color: var(--primary-color, #6366f1);
          border: 1px solid var(--primary-color, #6366f1);
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
        }

        .feature-tour-button:hover {
          background: var(--primary-color, #6366f1);
          color: white;
        }

        .feature-overview-footer {
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 16px;
          padding: 32px;
          text-align: center;
        }

        .feature-overview-footer h2 {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary, #1a1a1a);
          margin: 0 0 8px 0;
        }

        .feature-overview-footer > p {
          font-size: 16px;
          color: var(--text-secondary, #666);
          margin: 0 0 24px 0;
        }

        .quick-start-steps {
          display: flex;
          justify-content: center;
          gap: 32px;
          flex-wrap: wrap;
        }

        .quick-start-step {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .step-number {
          width: 32px;
          height: 32px;
          background: var(--primary-color, #6366f1);
          color: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 14px;
        }

        .quick-start-step span:last-child {
          font-size: 14px;
          color: var(--text-primary, #1a1a1a);
        }
      `}</style>
    </div>
  );
}

export default FeatureOverview;
