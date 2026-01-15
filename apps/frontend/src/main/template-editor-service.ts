import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import type { APIProfile } from '../shared/types/profile';

const SYSTEM_PROMPT = `You are a template editing assistant that helps users inject dynamic parameters into project template files.

**Parameter Syntax:**
Dynamic parameters use double curly braces with this format:
{{title="Parameter Name",type=text}}
{{title="Parameter Name",type=text,default="default value"}}
{{title="Parameter Name",type=dropdown,options="option1,option2,option3"}}
{{title="Parameter Name",type=dropdown,options="option1,option2",default="option1"}}
{{title="Parameter Name",type=secret,group="SecretGroupName",key="KEY_NAME"}}

**Escaping Quotes:**
When parameter syntax appears inside quoted strings (JavaScript, JSON, etc.), use backslash escaping:
- Escape double quotes with backslash: \\"
- Escape backslashes with double backslash: \\\\

Examples:
- JavaScript: console.log("{{title=\\"Console Message\\",type=text,default=\\"Hello\\"}}");
- JSON: "description": "{{title=\\"Project Description\\",type=text}}"
- HTML: <div title="{{title=\\"Page Title\\",type=text}}">

**Parameter Types:**
1. **text** - Free-form text input
   - Optional: default="value"
   - Example: {{title="Project Name",type=text}}
   - In strings: {{title=\\"Project Name\\",type=text}}

2. **dropdown** - Select from predefined options
   - Required: options="opt1,opt2,opt3" (comma-separated)
   - Optional: default="opt1"
   - Example: {{title="Region",type=dropdown,options="US,EU,ASIA",default="US"}}
   - In strings: {{title=\\"Region\\",type=dropdown,options=\\"US,EU,ASIA\\",default=\\"US\\"}}

3. **secret** - Reference encrypted credentials from Secrets Manager
   - Required: group="GroupName", key="KEY_NAME"
   - Example: {{title="API Key",type=secret,group="AWS",key="ACCESS_KEY"}}
   - In strings: {{title=\\"API Key\\",type=secret,group=\\"AWS\\",key=\\"ACCESS_KEY\\"}}

**Your Task:**
When the user asks you to make something dynamic or add a parameter:
1. Understand what they want to parameterize
2. Identify the correct file(s) to modify
3. Choose appropriate parameter type (text/dropdown/secret)
4. Use descriptive titles that explain what the parameter is for
5. Replace hardcoded values with parameter syntax
6. **Use proper escaping** if the parameter appears inside a quoted string
7. Provide sensible defaults when possible

**Important Rules:**
- Use straight quotes (") not smart/curly quotes ("")
- Use backslash escaping (\\ and \\") when inside quoted strings
- Parameter titles should be clear and descriptive
- For secrets, suggest appropriate group and key names
- When modifying files, preserve formatting and structure
- List files you modified and explain what was changed

**Available Tools:**
You have access to file operations for the template folder:
- list_files: See all files in the template
- read_file: Read a file's contents
- write_file: Write updated content to a file

Always confirm which files you're modifying and explain the changes.`;

interface TemplateEditorMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.ContentBlock[];
}

export class TemplateEditorService extends EventEmitter {
  private anthropic: Anthropic | null = null;
  private conversationHistory: Map<string, TemplateEditorMessage[]> = new Map();

  constructor() {
    super();
  }

  /**
   * Initialize the Anthropic client with API profile
   */
  initialize(profile: APIProfile): void {
    this.anthropic = new Anthropic({
      apiKey: profile.apiKey,
      baseURL: profile.baseUrl
    });
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.anthropic !== null;
  }

  /**
   * Clear conversation history for a template
   */
  clearHistory(templateId: string): void {
    this.conversationHistory.delete(templateId);
  }

  /**
   * List all files in a template folder
   */
  private listFiles(templatePath: string, relativePath = ''): string[] {
    const files: string[] = [];
    const currentPath = path.join(templatePath, relativePath);

    try {
      const entries = readdirSync(currentPath);

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry);
        const relativeEntryPath = path.join(relativePath, entry);
        const stat = statSync(entryPath);

        if (stat.isDirectory()) {
          // Skip common directories to avoid
          if ([
            'node_modules',
            '.git',
            '.next',
            'dist',
            'build',
            '.venv',
            '__pycache__',
            '.auto-claude'
          ].includes(entry)) {
            continue;
          }
          files.push(...this.listFiles(templatePath, relativeEntryPath));
        } else {
          files.push(relativeEntryPath);
        }
      }
    } catch (error) {
      console.error(`Error listing files in ${currentPath}:`, error);
    }

    return files;
  }

  /**
   * Read file content
   */
  private readFile(templatePath: string, relativeFilePath: string): string {
    const filePath = path.join(templatePath, relativeFilePath);
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read file ${relativeFilePath}: ${error}`);
    }
  }

  /**
   * Write file content
   */
  private writeFile(templatePath: string, relativeFilePath: string, content: string): void {
    const filePath = path.join(templatePath, relativeFilePath);
    try {
      console.log(`[TemplateEditor] Writing file: ${filePath}`);
      writeFileSync(filePath, content, 'utf-8');
      console.log(`[TemplateEditor] Successfully wrote file: ${filePath}`);
    } catch (error) {
      console.error(`[TemplateEditor] Failed to write file ${relativeFilePath}:`, error);
      throw new Error(`Failed to write file ${relativeFilePath}: ${error}`);
    }
  }

  /**
   * Send a message to Claude and get a streaming response with agentic loop
   */
  async sendMessage(
    templateId: string,
    templatePath: string,
    message: string
  ): Promise<void> {
    if (!this.anthropic) {
      throw new Error('TemplateEditorService not initialized with API key');
    }

    // Get or initialize conversation history
    const history = this.conversationHistory.get(templateId) || [];

    // Add user message to history
    history.push({ role: 'user', content: message });

    // Define tools for file operations
    const tools: Anthropic.Tool[] = [
      {
        name: 'list_files',
        description: 'List all files in the template folder (excluding common build/dependency directories)',
        input_schema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'read_file',
        description: 'Read the contents of a file in the template folder',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Relative path to the file within the template folder'
            }
          },
          required: ['file_path']
        }
      },
      {
        name: 'write_file',
        description: 'Write updated content to a file in the template folder',
        input_schema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Relative path to the file within the template folder'
            },
            content: {
              type: 'string',
              description: 'The complete updated file content'
            }
          },
          required: ['file_path', 'content']
        }
      }
    ];

    try {
      this.emit('status', templateId, 'thinking');

      // Agentic loop: continue until Claude doesn't use tools
      let continueLoop = true;
      const maxIterations = 10; // Prevent infinite loops
      let iteration = 0;

      while (continueLoop && iteration < maxIterations) {
        iteration++;

        let hasToolUse = false;
        const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

        // Create message with tool use
        const response = await this.anthropic.messages.create({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: history.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          tools
        });

        // Add assistant message to history
        history.push({
          role: 'assistant',
          content: response.content
        });

        // Process response content
        for (const block of response.content) {
          if (block.type === 'text') {
            this.emit('stream-chunk', templateId, { type: 'text', text: block.text });
          } else if (block.type === 'tool_use') {
            hasToolUse = true;

            // Execute tool and emit progress
            const result = await this.executeTool(
              templatePath,
              block.name,
              block.input
            );

            this.emit('stream-chunk', templateId, {
              type: 'tool_use',
              name: block.name,
              input: block.input,
              result
            });

            // Collect tool result for next iteration
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result
            });
          }
        }

        // If there were tool uses, add results and continue the loop
        if (hasToolUse) {
          history.push({
            role: 'user',
            content: toolResultBlocks
          });
          this.conversationHistory.set(templateId, history);
          // Continue loop to get Claude's response to the tool results
        } else {
          // No tool use, conversation is complete
          continueLoop = false;
        }
      }

      this.conversationHistory.set(templateId, history);
      this.emit('status', templateId, 'complete');
    } catch (error) {
      this.emit('error', templateId, error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Execute a tool call
   */
  private async executeTool(
    templatePath: string,
    toolName: string,
    input: any
  ): Promise<string> {
    console.log(`[TemplateEditor] Executing tool: ${toolName}`, input);
    try {
      switch (toolName) {
        case 'list_files': {
          const files = this.listFiles(templatePath);
          console.log(`[TemplateEditor] list_files found ${files.length} files`);
          return JSON.stringify({ files }, null, 2);
        }

        case 'read_file': {
          const content = this.readFile(templatePath, input.file_path);
          console.log(`[TemplateEditor] read_file: ${input.file_path} (${content.length} chars)`);
          return content;
        }

        case 'write_file': {
          this.writeFile(templatePath, input.file_path, input.content);
          console.log(`[TemplateEditor] write_file: ${input.file_path} (${input.content.length} chars)`);
          return `Successfully wrote ${input.file_path}`;
        }

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      console.error(`[TemplateEditor] Tool execution error:`, error);
      return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
}

// Export singleton instance
export const templateEditorService = new TemplateEditorService();
