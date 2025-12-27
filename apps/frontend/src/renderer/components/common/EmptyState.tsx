/**
 * Empty State Component
 *
 * Displays helpful tips and actions when a section is empty.
 * Improves discoverability of features.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useTourContext } from '../../contexts/TourContext';

interface EmptyStateProps {
  type: 'kanban' | 'ideation' | 'roadmap' | 'terminals';
  onAction?: () => void;
}

export function EmptyState({ type, onAction }: EmptyStateProps) {
  const { t } = useTranslation('common');
  const { startMainTour } = useTourContext();

  const configs = {
    kanban: {
      icon: '📋',
      titleKey: 'emptyStates.kanban.title',
      descriptionKey: 'emptyStates.kanban.description',
      actionKey: 'emptyStates.kanban.action',
      tips: [
        'emptyStates.kanban.tip1',
        'emptyStates.kanban.tip2',
        'emptyStates.kanban.tip3'
      ]
    },
    ideation: {
      icon: '💡',
      titleKey: 'emptyStates.ideation.title',
      descriptionKey: 'emptyStates.ideation.description',
      actionKey: 'emptyStates.ideation.action',
      tips: [
        'emptyStates.ideation.tip1',
        'emptyStates.ideation.tip2'
      ]
    },
    roadmap: {
      icon: '🗺️',
      titleKey: 'emptyStates.roadmap.title',
      descriptionKey: 'emptyStates.roadmap.description',
      actionKey: 'emptyStates.roadmap.action',
      tips: [
        'emptyStates.roadmap.tip1',
        'emptyStates.roadmap.tip2'
      ]
    },
    terminals: {
      icon: '🖥️',
      titleKey: 'emptyStates.terminals.title',
      descriptionKey: 'emptyStates.terminals.description',
      actionKey: null,
      tips: [
        'emptyStates.terminals.tip1',
        'emptyStates.terminals.tip2'
      ]
    }
  };

  const config = configs[type];

  return (
    <div className="empty-state">
      <div className="empty-state-icon">{config.icon}</div>
      <h3 className="empty-state-title">{t(config.titleKey)}</h3>
      <p className="empty-state-description">{t(config.descriptionKey)}</p>

      <div className="empty-state-tips">
        <h4>{t('emptyStates.tipsTitle')}</h4>
        <ul>
          {config.tips.map((tipKey, index) => (
            <li key={index}>{t(tipKey)}</li>
          ))}
        </ul>
      </div>

      <div className="empty-state-actions">
        {config.actionKey && onAction && (
          <button className="empty-state-action-primary" onClick={onAction}>
            {t(config.actionKey)}
          </button>
        )}
        <button className="empty-state-action-secondary" onClick={startMainTour}>
          {t('emptyStates.takeTour')}
        </button>
      </div>

      <style>{`
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          text-align: center;
          max-width: 480px;
          margin: 0 auto;
        }

        .empty-state-icon {
          font-size: 64px;
          margin-bottom: 16px;
          opacity: 0.8;
        }

        .empty-state-title {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary, #1a1a1a);
          margin: 0 0 8px 0;
        }

        .empty-state-description {
          font-size: 16px;
          color: var(--text-secondary, #666);
          margin: 0 0 24px 0;
          line-height: 1.5;
        }

        .empty-state-tips {
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 12px;
          padding: 16px 24px;
          margin-bottom: 24px;
          width: 100%;
          text-align: left;
        }

        .empty-state-tips h4 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #1a1a1a);
          margin: 0 0 12px 0;
        }

        .empty-state-tips ul {
          margin: 0;
          padding-left: 20px;
        }

        .empty-state-tips li {
          font-size: 14px;
          color: var(--text-secondary, #666);
          margin-bottom: 8px;
          line-height: 1.4;
        }

        .empty-state-tips li:last-child {
          margin-bottom: 0;
        }

        .empty-state-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: center;
        }

        .empty-state-action-primary {
          background: var(--primary-color, #6366f1);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .empty-state-action-primary:hover {
          background: var(--primary-hover, #4f46e5);
        }

        .empty-state-action-secondary {
          background: transparent;
          color: var(--primary-color, #6366f1);
          border: 1px solid var(--primary-color, #6366f1);
          border-radius: 8px;
          padding: 12px 24px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .empty-state-action-secondary:hover {
          background: var(--primary-color, #6366f1);
          color: white;
        }
      `}</style>
    </div>
  );
}

export default EmptyState;
