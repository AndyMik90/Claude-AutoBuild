/**
 * Integration provider types for external roadmap services (Canny, GitHub Issues, etc.)
 *
 * This architecture allows bidirectional sync with external feedback/roadmap systems:
 * - Import: Fetch feature requests from external services
 * - Export: Push status updates back when features progress
 */

import type { RoadmapFeatureStatus } from '../../shared/types';

/**
 * Represents an item from an external feedback/roadmap system
 */
export interface FeedbackItem {
  externalId: string;
  title: string;
  description: string;
  votes: number;
  status: string;  // Provider-specific status
  url: string;
  createdAt: Date;
  updatedAt?: Date;
  author?: string;
  tags?: string[];
}

/**
 * Connection status for a provider
 */
export interface ProviderConnection {
  id: string;
  name: string;
  connected: boolean;
  lastSync?: Date;
  error?: string;
}

/**
 * Configuration for a provider
 */
export interface ProviderConfig {
  enabled: boolean;
  apiKey?: string;
  boardId?: string;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
}

/**
 * Abstract interface for integration adapters
 *
 * Implement this interface to add support for new external services.
 * Each adapter handles mapping between internal and external status systems.
 */
export interface IntegrationAdapter {
  /** Unique identifier for this provider */
  readonly providerId: string;

  /** Display name for the provider */
  readonly providerName: string;

  /**
   * Test the connection to the external service
   */
  testConnection(): Promise<{ success: boolean; error?: string }>;

  /**
   * Fetch all items from the external service
   */
  fetchItems(): Promise<FeedbackItem[]>;

  /**
   * Update the status of an item in the external service
   */
  updateStatus(externalId: string, status: string): Promise<void>;

  /**
   * Map internal roadmap status to provider-specific status
   */
  mapStatusToProvider(internalStatus: RoadmapFeatureStatus): string;

  /**
   * Map provider-specific status to internal roadmap status
   */
  mapStatusFromProvider(externalStatus: string): RoadmapFeatureStatus;
}

/**
 * Canny-specific status mapping
 * Reference: https://developers.canny.io/api-reference
 */
export const CANNY_STATUS_MAP = {
  toProvider: {
    under_review: 'under review',
    planned: 'planned',
    in_progress: 'in progress',
    done: 'complete'
  } as Record<RoadmapFeatureStatus, string>,

  fromProvider: {
    'open': 'under_review',
    'under review': 'under_review',
    'planned': 'planned',
    'in progress': 'in_progress',
    'complete': 'done',
    'closed': 'done'
  } as Record<string, RoadmapFeatureStatus>
};

/**
 * GitHub Issues status mapping
 */
export const GITHUB_ISSUES_STATUS_MAP = {
  toProvider: {
    under_review: 'open',
    planned: 'open',
    in_progress: 'open',
    done: 'closed'
  } as Record<RoadmapFeatureStatus, string>,

  fromProvider: {
    'open': 'under_review',
    'closed': 'done'
  } as Record<string, RoadmapFeatureStatus>
};
