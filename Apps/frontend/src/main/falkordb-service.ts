/**
 * FalkorDB Service
 *
 * Queries the FalkorDB graph database for memories stored by Graphiti.
 * Uses ioredis to communicate with FalkorDB via Redis protocol.
 */

import Redis from 'ioredis';
import type { MemoryEpisode } from '../shared/types';

interface FalkorDBConfig {
  host: string;
  port: number;
  password?: string;
}

interface EpisodicNode {
  uuid: string;
  name: string;
  created_at: string;
  content?: string;
  source_description?: string;
}

interface EntityNode {
  uuid: string;
  name: string;
  summary?: string;
}

/**
 * Parse FalkorDB GRAPH.QUERY results into structured data
 */
function parseGraphResult(result: unknown[]): Record<string, unknown>[] {
  if (!Array.isArray(result) || result.length < 2) {
    return [];
  }

  // Result format: [headers, [row1, row2, ...], stats]
  const headers = result[0] as string[];
  const rows = result[1] as unknown[][];

  if (!Array.isArray(headers) || !Array.isArray(rows)) {
    return [];
  }

  return rows.map(row => {
    const obj: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      obj[header] = row[idx];
    });
    return obj;
  });
}

/**
 * FalkorDB Service for querying graph memories
 */
export class FalkorDBService {
  private config: FalkorDBConfig;
  private redis: Redis | null = null;

  constructor(config: FalkorDBConfig) {
    this.config = config;
  }

  /**
   * Get a Redis connection (lazy initialization)
   */
  private async getConnection(): Promise<Redis> {
    if (this.redis) {
      return this.redis;
    }

    this.redis = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      lazyConnect: true,
      connectTimeout: 5000,
      maxRetriesPerRequest: 1,
    });

    await this.redis.connect();
    return this.redis;
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
  }

  /**
   * List all available graphs in the database
   */
  async listGraphs(): Promise<string[]> {
    try {
      const redis = await this.getConnection();
      const result = await redis.call('GRAPH.LIST') as string[];
      return result || [];
    } catch (error) {
      console.error('Failed to list graphs:', error);
      return [];
    }
  }

  /**
   * Query episodic memories from a specific graph
   */
  async getEpisodicMemories(graphName: string, limit: number = 20): Promise<MemoryEpisode[]> {
    try {
      const redis = await this.getConnection();

      // Query episodic nodes with their details
      const query = `
        MATCH (e:Episodic)
        RETURN e.uuid as uuid, e.name as name, e.created_at as created_at,
               e.content as content, e.source_description as description
        ORDER BY e.created_at DESC
        LIMIT ${limit}
      `;

      const result = await redis.call('GRAPH.QUERY', graphName, query) as unknown[];
      const episodes = parseGraphResult(result) as unknown as EpisodicNode[];

      return episodes.map(ep => ({
        id: ep.uuid || ep.name,
        type: this.inferEpisodeType(ep.name, ep.content),
        timestamp: ep.created_at || new Date().toISOString(),
        content: ep.content || ep.source_description || ep.name,
        session_number: this.extractSessionNumber(ep.name),
      }));
    } catch (error) {
      console.error(`Failed to get episodic memories from ${graphName}:`, error);
      return [];
    }
  }

  /**
   * Query entity memories (patterns, gotchas, etc.) from a graph
   */
  async getEntityMemories(graphName: string, limit: number = 20): Promise<MemoryEpisode[]> {
    try {
      const redis = await this.getConnection();

      // Query entity nodes
      const query = `
        MATCH (e:Entity)
        RETURN e.uuid as uuid, e.name as name, e.summary as summary, e.created_at as created_at
        ORDER BY e.created_at DESC
        LIMIT ${limit}
      `;

      const result = await redis.call('GRAPH.QUERY', graphName, query) as unknown[];
      const entities = parseGraphResult(result) as unknown as EntityNode[];

      return entities
        .filter(ent => ent.summary) // Only include entities with summaries
        .map(ent => ({
          id: ent.uuid || ent.name,
          type: this.inferEntityType(ent.name),
          timestamp: new Date().toISOString(),
          content: ent.summary || ent.name,
        }));
    } catch (error) {
      console.error(`Failed to get entity memories from ${graphName}:`, error);
      return [];
    }
  }

  /**
   * Get all memories from all spec-related graphs
   */
  async getAllMemories(limit: number = 20): Promise<MemoryEpisode[]> {
    const graphs = await this.listGraphs();
    const memories: MemoryEpisode[] = [];

    // Filter to spec-related graphs (exclude auto_build_memory and project_ prefixed)
    const specGraphs = graphs.filter(g =>
      !g.startsWith('project_') &&
      g !== 'auto_build_memory' &&
      g !== 'default_db'
    );

    for (const graph of specGraphs) {
      const episodic = await this.getEpisodicMemories(graph, Math.ceil(limit / specGraphs.length));
      memories.push(...episodic.map(m => ({ ...m, id: `${graph}:${m.id}` })));
    }

    // Sort by timestamp descending
    memories.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return memories.slice(0, limit);
  }

  /**
   * Search memories across all graphs
   */
  async searchMemories(query: string, limit: number = 20): Promise<MemoryEpisode[]> {
    const graphs = await this.listGraphs();
    const results: MemoryEpisode[] = [];
    const queryLower = query.toLowerCase();

    // Filter to spec-related graphs
    const specGraphs = graphs.filter(g =>
      !g.startsWith('project_') &&
      g !== 'auto_build_memory' &&
      g !== 'default_db'
    );

    for (const graph of specGraphs) {
      try {
        const redis = await this.getConnection();

        // Search in episodic nodes
        const episodicQuery = `
          MATCH (e:Episodic)
          WHERE toLower(e.name) CONTAINS '${queryLower}' OR toLower(e.content) CONTAINS '${queryLower}'
          RETURN e.uuid as uuid, e.name as name, e.created_at as created_at,
                 e.content as content, e.source_description as description
          LIMIT ${Math.ceil(limit / specGraphs.length)}
        `;

        const episodicResult = await redis.call('GRAPH.QUERY', graph, episodicQuery) as unknown[];
        const episodes = parseGraphResult(episodicResult) as unknown as EpisodicNode[];

        results.push(...episodes.map(ep => ({
          id: `${graph}:${ep.uuid || ep.name}`,
          type: this.inferEpisodeType(ep.name, ep.content),
          timestamp: ep.created_at || new Date().toISOString(),
          content: ep.content || ep.source_description || ep.name,
          session_number: this.extractSessionNumber(ep.name),
          score: 1.0,
        })));

        // Search in entity nodes
        const entityQuery = `
          MATCH (e:Entity)
          WHERE toLower(e.name) CONTAINS '${queryLower}' OR toLower(e.summary) CONTAINS '${queryLower}'
          RETURN e.uuid as uuid, e.name as name, e.summary as summary
          LIMIT ${Math.ceil(limit / specGraphs.length)}
        `;

        const entityResult = await redis.call('GRAPH.QUERY', graph, entityQuery) as unknown[];
        const entities = parseGraphResult(entityResult) as unknown as EntityNode[];

        results.push(...entities
          .filter(ent => ent.summary)
          .map(ent => ({
            id: `${graph}:${ent.uuid || ent.name}`,
            type: this.inferEntityType(ent.name),
            timestamp: new Date().toISOString(),
            content: ent.summary || ent.name,
            score: 1.0,
          })));
      } catch (error) {
        console.error(`Failed to search memories in ${graph}:`, error);
      }
    }

    return results.slice(0, limit);
  }

  /**
   * Test connection to FalkorDB
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const redis = await this.getConnection();
      await redis.ping();
      const graphs = await this.listGraphs();
      return {
        success: true,
        message: `Connected to FalkorDB with ${graphs.length} graphs`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Infer the episode type from its name
   */
  private inferEpisodeType(name: string, content?: string): MemoryEpisode['type'] {
    const nameLower = (name || '').toLowerCase();
    const contentLower = (content || '').toLowerCase();

    if (nameLower.includes('session_') || contentLower.includes('"type": "session_insight"')) {
      return 'session_insight';
    }
    if (nameLower.includes('pattern') || contentLower.includes('"type": "pattern"')) {
      return 'pattern';
    }
    if (nameLower.includes('gotcha') || contentLower.includes('"type": "gotcha"')) {
      return 'gotcha';
    }
    if (nameLower.includes('codebase') || contentLower.includes('"type": "codebase_discovery"')) {
      return 'codebase_discovery';
    }
    return 'session_insight';
  }

  /**
   * Infer the entity type from its name
   */
  private inferEntityType(name: string): MemoryEpisode['type'] {
    const nameLower = (name || '').toLowerCase();

    if (nameLower.includes('pattern')) {
      return 'pattern';
    }
    if (nameLower.includes('gotcha')) {
      return 'gotcha';
    }
    if (nameLower.includes('file_insight') || nameLower.includes('codebase')) {
      return 'codebase_discovery';
    }
    return 'session_insight';
  }

  /**
   * Extract session number from episode name
   */
  private extractSessionNumber(name: string): number | undefined {
    const match = name.match(/session_(\d+)/i);
    return match ? parseInt(match[1], 10) : undefined;
  }
}

// Singleton instance for reuse
let serviceInstance: FalkorDBService | null = null;

/**
 * Get or create a FalkorDB service instance
 */
export function getFalkorDBService(config: FalkorDBConfig): FalkorDBService {
  if (!serviceInstance ||
      serviceInstance['config'].host !== config.host ||
      serviceInstance['config'].port !== config.port) {
    // Close existing connection if config changed
    if (serviceInstance) {
      serviceInstance.close().catch(() => {});
    }
    serviceInstance = new FalkorDBService(config);
  }
  return serviceInstance;
}

/**
 * Close the singleton service instance
 */
export async function closeFalkorDBService(): Promise<void> {
  if (serviceInstance) {
    await serviceInstance.close();
    serviceInstance = null;
  }
}
