#!/usr/bin/env node
/**
 * CDP Bridge - Chrome DevTools Protocol MCP Integration
 *
 * This is a lightweight bridge wrapper that provides configuration and
 * documentation for integrating Google's official Chrome DevTools MCP server
 * with Auto Claude for continuous feedback loops.
 *
 * The actual MCP server is Google's chrome-devtools-mcp package.
 * This bridge provides:
 * - Configuration validation
 * - Tool mapping to Auto Claude's CDP system
 * - Feedback loop integration helpers
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// CDP Bridge configuration
interface CDPBridgeConfig {
  // Chrome DevTools MCP server command
  command?: string;
  args?: string[];
  // Browser connection settings
  browserUrl?: string;
  wsEndpoint?: string;
  autoConnect?: boolean;
  headless?: boolean;
  viewport?: string;
  // Tool category filters
  categories?: {
    input?: boolean;
    navigation?: boolean;
    emulation?: boolean;
    performance?: boolean;
    network?: boolean;
    debugging?: boolean;
  };
}

/**
 * CDP Bridge Server
 *
 * This is a configuration and discovery server that helps Auto Claude
 * integrate with Google's Chrome DevTools MCP server.
 */
class CDPBridgeServer {
  private server: Server;
  private config: CDPBridgeConfig;

  constructor() {
    this.server = new Server(
      {
        name: 'cdp-bridge',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Load configuration from environment
    this.config = this.loadConfig();

    this.setupHandlers();
  }

  /**
   * Load CDP Bridge configuration from environment variables
   */
  private loadConfig(): CDPBridgeConfig {
    return {
      command: process.env.CDP_MCP_COMMAND || 'npx',
      args: this.parseArgs(process.env.CDP_MCP_ARGS || '-y,chrome-devtools-mcp@latest'),
      browserUrl: process.env.CDP_BROWSER_URL,
      wsEndpoint: process.env.CDP_WS_ENDPOINT,
      autoConnect: process.env.CDP_AUTO_CONNECT === 'true',
      headless: process.env.CDP_HEADLESS === 'true',
      viewport: process.env.CDP_VIEWPORT,
      categories: {
        input: process.env.CDP_CATEGORY_INPUT !== 'false',
        navigation: process.env.CDP_CATEGORY_NAVIGATION !== 'false',
        emulation: process.env.CDP_CATEGORY_EMULATION !== 'false',
        performance: process.env.CDP_CATEGORY_PERFORMANCE !== 'false',
        network: process.env.CDP_CATEGORY_NETWORK !== 'false',
        debugging: process.env.CDP_CATEGORY_DEBUGGING !== 'false',
      },
    };
  }

  /**
   * Parse command arguments from comma-separated string
   */
  private parseArgs(argsStr: string): string[] {
    if (!argsStr) return [];
    return argsStr.split(',').map(arg => arg.trim());
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools (discovery)
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'cdp_get_config',
            description: 'Get the current CDP Bridge configuration. Returns the Chrome DevTools MCP server setup including connection settings, tool categories, and browser configuration.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'cdp_get_server_command',
            description: 'Get the Chrome DevTools MCP server command to use. Returns the npx command and arguments needed to start Google\'s official chrome-devtools-mcp server.',
            inputSchema: {
              type: 'object',
              properties: {
                include_categories: {
                  type: 'boolean',
                  description: 'Include category filter flags in the command',
                  default: true,
                },
              },
            },
          },
          {
            name: 'cdp_list_tools',
            description: 'List all available Chrome DevTools MCP tools organized by category. Returns tool names mapped to Auto Claude\'s CDP configuration system.',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Filter by category: input, navigation, emulation, performance, network, debugging',
                  enum: ['input', 'navigation', 'emulation', 'performance', 'network', 'debugging', 'all'],
                  default: 'all',
                },
              },
            },
          },
          {
            name: 'cdp_get_tool_mapping',
            description: 'Get the mapping between Chrome DevTools MCP tools and Auto Claude\'s CDP tool categories. This helps configure which agents get access to which tools.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'cdp_validate_connection',
            description: 'Validate the CDP connection configuration. Checks if the browser URL, WebSocket endpoint, or auto-connect settings are properly configured.',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
          {
            name: 'cdp_get_feedback_loop_config',
            description: 'Get configuration for continuous feedback loops. Returns settings for how agents should use CDP tools for iterative testing and validation.',
            inputSchema: {
              type: 'object',
              properties: {
                agent_type: {
                  type: 'string',
                  description: 'Agent type for feedback loop configuration (e.g., coder, qa_reviewer, qa_fixer)',
                  default: 'qa_reviewer',
                },
              },
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'cdp_get_config':
          return this.getConfig();

        case 'cdp_get_server_command':
          return this.getServerCommand(!!args?.include_categories);

        case 'cdp_list_tools':
          return this.listTools((args?.category as string) || 'all');

        case 'cdp_get_tool_mapping':
          return this.getToolMapping();

        case 'cdp_validate_connection':
          return this.validateConnection();

        case 'cdp_get_feedback_loop_config':
          return this.getFeedbackLoopConfig((args?.agent_type as string) || 'qa_reviewer');

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Get current CDP Bridge configuration
   */
  private async getConfig() {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            description: 'CDP Bridge Configuration for Chrome DevTools MCP Server',
            config: this.config,
            notes: [
              'This configuration is used by Auto Claude to integrate with Google\'s official Chrome DevTools MCP server',
              'The actual MCP server is started using the command returned by cdp_get_server_command',
              'Tool categories can be filtered using environment variables',
              'See .env.example for all configuration options',
            ],
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Get Chrome DevTools MCP server command
   */
  private async getServerCommand(includeCategories: boolean) {
    const command = this.config.command || 'npx';
    let args = [...(this.config.args || ['-y', 'chrome-devtools-mcp@latest'])];

    // Add connection-specific arguments
    if (this.config.browserUrl) {
      args.push(`--browser-url=${this.config.browserUrl}`);
    }
    if (this.config.wsEndpoint) {
      args.push(`--ws-endpoint=${this.config.wsEndpoint}`);
    }
    if (this.config.autoConnect) {
      args.push('--auto-connect');
    }
    if (this.config.headless) {
      args.push('--headless=true');
    }
    if (this.config.viewport) {
      args.push(`--viewport=${this.config.viewport}`);
    }

    // Add category filters if requested
    if (includeCategories && this.config.categories) {
      if (this.config.categories.emulation === false) {
        args.push('--category-emulation=false');
      }
      if (this.config.categories.performance === false) {
        args.push('--category-performance=false');
      }
      if (this.config.categories.network === false) {
        args.push('--category-network=false');
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            command,
            args,
            full_command: `${command} ${args.join(' ')}`,
            mcp_config: {
              mcpServers: {
                'chrome-devtools': {
                  command,
                  args,
                },
              },
            },
          }, null, 2),
        },
      ],
    };
  }

  /**
   * List available Chrome DevTools MCP tools
   */
  private async listTools(category: string) {
    const toolsByCategory = {
      input: [
        'click', 'drag', 'fill', 'fill_form', 'handle_dialog',
        'hover', 'press_key', 'upload_file'
      ],
      navigation: [
        'close_page', 'list_pages', 'navigate_page',
        'new_page', 'select_page', 'wait_for'
      ],
      emulation: [
        'emulate', 'resize_page'
      ],
      performance: [
        'performance_analyze_insight', 'performance_start_trace', 'performance_stop_trace'
      ],
      network: [
        'get_network_request', 'list_network_requests'
      ],
      debugging: [
        'evaluate_script', 'get_console_message',
        'list_console_messages', 'take_screenshot', 'take_snapshot'
      ],
    };

    if (category === 'all') {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              all_tools: toolsByCategory,
              total_count: Object.values(toolsByCategory).flat().length,
              prefix: 'mcp__chrome-devtools__',
              usage: 'Tools are prefixed with mcp__chrome-devtools__ when used via MCP',
            }, null, 2),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            category,
            tools: toolsByCategory[category as keyof typeof toolsByCategory] || [],
            prefix: 'mcp__chrome-devtools__',
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Get tool mapping to Auto Claude's CDP categories
   */
  private async getToolMapping() {
    const mapping = {
      // Input automation → DOM tools
      input: ['dom'],
      // Navigation automation → DOM tools
      navigation: ['dom'],
      // Emulation → Emulation tools
      emulation: ['emulation'],
      // Performance → Performance tools
      performance: ['performance'],
      // Network → Network tools
      network: ['network'],
      // Debugging → Console tools + partial DOM/Storage
      debugging: ['console', 'storage', 'dom'],
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            description: 'Mapping from Chrome DevTools MCP tool categories to Auto Claude CDP categories',
            mapping,
            reverse_mapping: {
              dom: ['input', 'navigation', 'debugging'],
              emulation: ['emulation'],
              performance: ['performance'],
              network: ['network'],
              console: ['debugging'],
              storage: ['debugging'],
            },
            agent_permissions: {
              qa_reviewer: ['performance', 'network', 'debugging', 'dom', 'console'],
              qa_fixer: ['network', 'debugging', 'dom', 'console'],
              coder: [], // Default: no CDP
              planner: [], // Default: no CDP
            },
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Validate CDP connection configuration
   */
  private async validateConnection() {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if we have a valid connection method
    if (!this.config.browserUrl && !this.config.wsEndpoint && !this.config.autoConnect) {
      warnings.push('No connection method configured. Will use default (launch new Chrome instance)');
    }

    // Validate browser URL format
    if (this.config.browserUrl) {
      try {
        new URL(this.config.browserUrl);
      } catch {
        errors.push(`Invalid browser URL: ${this.config.browserUrl}`);
      }
    }

    // Validate WebSocket endpoint format
    if (this.config.wsEndpoint) {
      try {
        const url = new URL(this.config.wsEndpoint);
        if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
          errors.push(`WebSocket endpoint must use ws:// or wss:// protocol: ${this.config.wsEndpoint}`);
        }
      } catch {
        errors.push(`Invalid WebSocket endpoint: ${this.config.wsEndpoint}`);
      }
    }

    // Validate viewport format
    if (this.config.viewport) {
      const match = this.config.viewport.match(/^(\d+)x(\d+)$/);
      if (!match) {
        errors.push(`Invalid viewport format (expected WIDTHxHEIGHT): ${this.config.viewport}`);
      }
    }

    // Check if at least one category is enabled
    if (this.config.categories) {
      const enabledCategories = Object.entries(this.config.categories)
        .filter(([_, enabled]) => enabled)
        .map(([name]) => name);

      if (enabledCategories.length === 0) {
        warnings.push('All tool categories are disabled. No tools will be available.');
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            valid: errors.length === 0,
            errors,
            warnings,
            config: {
              has_browser_url: !!this.config.browserUrl,
              has_ws_endpoint: !!this.config.wsEndpoint,
              auto_connect: this.config.autoConnect,
              headless: this.config.headless,
              viewport: this.config.viewport,
              enabled_categories: Object.entries(this.config.categories || {})
                .filter(([_, enabled]) => enabled)
                .map(([name]) => name),
            },
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Get feedback loop configuration for an agent type
   */
  private async getFeedbackLoopConfig(agentType: string) {
    // Agent-specific feedback loop configurations
    const agentConfigs: Record<string, any> = {
      qa_reviewer: {
        description: 'QA Reviewer uses CDP tools to validate implementation against acceptance criteria',
        feedback_loops: [
          {
            name: 'visual_validation',
            tools: ['take_screenshot', 'take_snapshot'],
            frequency: 'after_each_subtask',
            description: 'Capture screenshots to verify visual changes',
          },
          {
            name: 'performance_check',
            tools: ['performance_start_trace', 'performance_stop_trace', 'performance_analyze_insight'],
            frequency: 'on_completion',
            description: 'Analyze performance metrics and identify issues',
          },
          {
            name: 'network_validation',
            tools: ['list_network_requests', 'get_network_request'],
            frequency: 'on_api_changes',
            description: 'Verify API requests are working correctly',
          },
          {
            name: 'console_errors',
            tools: ['list_console_messages', 'get_console_message'],
            frequency: 'continuous',
            description: 'Monitor console for errors and warnings',
          },
        ],
        continuous_mode: {
          enabled: true,
          screenshot_interval: 'on_state_change',
          error_threshold: 1, // Fail on first error
        },
      },
      qa_fixer: {
        description: 'QA Fixer uses CDP tools to verify fixes and iteratively test solutions',
        feedback_loops: [
          {
            name: 'fix_validation',
            tools: ['take_screenshot', 'evaluate_script', 'take_snapshot'],
            frequency: 'after_each_fix',
            description: 'Verify that fixes resolve reported issues',
          },
          {
            name: 'regression_check',
            tools: ['list_console_messages', 'list_network_requests'],
            frequency: 'after_each_fix',
            description: 'Check for regressions introduced by fixes',
          },
        ],
        continuous_mode: {
          enabled: true,
          iterate_until: ['no_errors', 'acceptance_criteria_met'],
          max_iterations: 5,
        },
      },
      coder: {
        description: 'Coder can optionally use CDP tools for real-time testing during development',
        feedback_loops: [
          {
            name: 'development_testing',
            tools: ['take_screenshot', 'list_console_messages'],
            frequency: 'on_demand',
            description: 'Quick verification during development',
          },
        ],
        continuous_mode: {
          enabled: false, // Disabled by default to minimize context
          opt_in_via_environment: 'CDP_ENABLED_FOR_AGENTS=coder',
        },
      },
      planner: {
        description: 'Planner does not need CDP tools for planning phase',
        feedback_loops: [],
        continuous_mode: {
          enabled: false,
        },
      },
    };

    const config = agentConfigs[agentType] || agentConfigs.planner;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            agent_type: agentType,
            ...config,
            environment_setup: {
              enable_for_agent: `CDP_ENABLED_FOR_AGENTS=${agentType}`,
              set_tool_categories: 'CDP_TOOL_CATEGORIES=network,performance,debugging,dom',
              start_chrome: 'Chrome must be running with remote debugging enabled',
              examples: [
                '# For new Chrome instance:',
                '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-debug-profile',
                '',
                '# For auto-connect (Chrome 145+):',
                '# Enable remote debugging at chrome://inspect/#remote-debugging',
                '# Then set: CDP_AUTO_CONNECT=true',
              ],
            },
          }, null, 2),
        },
      ],
    };
  }

  /**
   * Start the CDP Bridge server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    console.error('CDP Bridge MCP server running on stdio');
    console.error('Configuration loaded from environment variables');
    console.error('Use cdp_get_config to view current configuration');
    console.error('Use cdp_get_server_command to get Chrome DevTools MCP server command');
  }
}

/**
 * Main entry point
 */
async function main() {
  const server = new CDPBridgeServer();
  await server.start();
}

// Start the server
main().catch((error) => {
  console.error('Fatal error in CDP Bridge:', error);
  process.exit(1);
});
