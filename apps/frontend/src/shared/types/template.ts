/**
 * Template types for project templates
 */

export interface Template {
  id: string;
  name: string;
  folderPath: string;
  imagePath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateStore {
  templates: Template[];
}

export interface TemplateParameter {
  key: string;
  title: string;
  type: 'text' | 'dropdown' | 'secret';
  options?: string[];
  default?: string;
  group?: string;
  secretKey?: string;
  placeholder?: string;
  filePath: string;
  position: number;
}

export interface ParsedTemplate {
  parameters: TemplateParameter[];
  totalFiles: number;
  filesWithParameters: number;
}
