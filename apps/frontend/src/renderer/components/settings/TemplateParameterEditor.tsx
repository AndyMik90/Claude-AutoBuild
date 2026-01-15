import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, FileEdit, AlertCircle, Trash2, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ScrollArea } from '../ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import type { Template } from '../../../shared/types';

interface TemplateParameterEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
  onSaved?: () => void;
}

interface EditableParameter {
  key: string;
  title: string;
  type: 'text' | 'dropdown' | 'secret';
  options?: string[];
  default?: string;
  group?: string;
  secretKey?: string;
  placeholder: string;
  filePath: string;
  position: number;
  // Track if this parameter was modified
  modified: boolean;
}

export function TemplateParameterEditor({ open, onOpenChange, template, onSaved }: TemplateParameterEditorProps) {
  const { t } = useTranslation('settings');
  const [parameters, setParameters] = useState<EditableParameter[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string>('');
  const [groupedByFile, setGroupedByFile] = useState<Map<string, EditableParameter[]>>(new Map());

  // Load parameters when dialog opens
  useEffect(() => {
    if (open && template) {
      loadParameters();
    }
  }, [open, template]);

  // Group parameters by file
  useEffect(() => {
    const grouped = new Map<string, EditableParameter[]>();
    parameters.forEach(param => {
      const existing = grouped.get(param.filePath) || [];
      existing.push(param);
      grouped.set(param.filePath, existing);
    });
    setGroupedByFile(grouped);
  }, [parameters]);

  const loadParameters = async () => {
    if (!template) return;

    setIsLoading(true);
    setError('');

    try {
      const result = await window.electronAPI.parseTemplateParameters(template.id);
      if (result.success && result.data) {
        const editableParams: EditableParameter[] = result.data.parameters.map(param => ({
          ...param,
          options: param.options || [],
          modified: false
        }));
        setParameters(editableParams);
      } else {
        setError(result.error || t('templates.parameterEditor.errors.loadFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('templates.parameterEditor.errors.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const updateParameter = (key: string, updates: Partial<EditableParameter>) => {
    setParameters(prev => prev.map(param =>
      param.key === key
        ? { ...param, ...updates, modified: true }
        : param
    ));
  };

  const generateParameterSyntax = (param: EditableParameter): string => {
    // Check if original placeholder used escaped quotes (was in a string)
    const usesEscapedQuotes = param.placeholder.includes('\\"');

    const parts: string[] = [];

    // Use escaped or regular quotes based on original context
    const quote = usesEscapedQuotes ? '\\"' : '"';

    parts.push(`title=${quote}${param.title}${quote}`);
    parts.push(`type=${param.type}`);

    if (param.default) {
      parts.push(`default=${quote}${param.default}${quote}`);
    }

    if (param.type === 'dropdown' && param.options && param.options.length > 0) {
      parts.push(`options=${quote}${param.options.join(',')}${quote}`);
    }

    if (param.type === 'secret') {
      if (param.group) parts.push(`group=${quote}${param.group}${quote}`);
      if (param.secretKey) parts.push(`key=${quote}${param.secretKey}${quote}`);
    }

    return `{{${parts.join(',')}}}`;
  };

  const handleSave = async () => {
    if (!template) return;

    setIsSaving(true);
    setError('');

    try {
      // Group updates by file
      const fileUpdates = new Map<string, { params: EditableParameter[], content: string }>();

      // First, read all files that need updating
      for (const param of parameters.filter(p => p.modified)) {
        if (!fileUpdates.has(param.filePath)) {
          // Read the file (we'll need a new IPC method for this)
          const readResult = await window.electronAPI.readFile(param.filePath);
          if (!readResult.success || !readResult.data) {
            throw new Error(`Failed to read ${param.filePath}`);
          }
          fileUpdates.set(param.filePath, {
            params: [],
            content: readResult.data
          });
        }
        fileUpdates.get(param.filePath)!.params.push(param);
      }

      // For each file, replace all modified parameters
      for (const [filePath, { params: fileParams, content }] of fileUpdates) {
        let newContent = content;

        // Sort by position (descending) to avoid offset issues when replacing
        const sortedParams = [...fileParams].sort((a, b) => b.position - a.position);

        for (const param of sortedParams) {
          const newSyntax = generateParameterSyntax(param);

          console.log('[ParameterEditor] Replacing:', {
            placeholder: param.placeholder,
            newSyntax: newSyntax,
            filePath
          });

          // Replace the old placeholder with the new syntax
          newContent = newContent.replace(param.placeholder, newSyntax);
        }

        console.log('[ParameterEditor] Writing updated content to:', filePath);

        // Write the updated file
        const writeResult = await window.electronAPI.writeFile(filePath, newContent);
        if (!writeResult.success) {
          throw new Error(`Failed to write ${filePath}: ${writeResult.error}`);
        }
      }

      // Success - close dialog and notify parent
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('templates.parameterEditor.errors.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddOption = (paramKey: string) => {
    setParameters(prev => prev.map(param => {
      if (param.key === paramKey && param.type === 'dropdown') {
        return {
          ...param,
          options: [...(param.options || []), ''],
          modified: true
        };
      }
      return param;
    }));
  };

  const handleUpdateOption = (paramKey: string, optionIndex: number, value: string) => {
    setParameters(prev => prev.map(param => {
      if (param.key === paramKey && param.options) {
        const newOptions = [...param.options];
        newOptions[optionIndex] = value;
        return {
          ...param,
          options: newOptions,
          modified: true
        };
      }
      return param;
    }));
  };

  const handleRemoveOption = (paramKey: string, optionIndex: number) => {
    setParameters(prev => prev.map(param => {
      if (param.key === paramKey && param.options) {
        return {
          ...param,
          options: param.options.filter((_, i) => i !== optionIndex),
          modified: true
        };
      }
      return param;
    }));
  };

  if (!template) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] h-[600px] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="h-5 w-5" />
            {t('templates.parameterEditor.title')}
            <span className="text-sm font-normal text-muted-foreground">- {template.name}</span>
          </DialogTitle>
          <DialogDescription>
            {t('templates.parameterEditor.description')}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">{t('templates.parameterEditor.loading')}</p>
          </div>
        ) : parameters.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">{t('templates.parameterEditor.noParameters')}</p>
          </div>
        ) : (
          <ScrollArea className="flex-1">
            <div className="space-y-6 py-4">
              {Array.from(groupedByFile.entries()).map(([filePath, fileParams]) => (
                <div key={filePath} className="space-y-4">
                  {/* File header */}
                  <div className="sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-3">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <FileEdit className="h-4 w-4" />
                      {filePath.split('/').pop()}
                      <Badge variant="secondary" className="text-xs">
                        {t('templates.parameterEditor.badges.paramCount', { count: fileParams.length })}
                      </Badge>
                    </h3>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{filePath}</p>
                  </div>

                  {/* Parameters in this file */}
                  {fileParams.map(param => (
                    <div key={param.key} className="border rounded-lg p-4 space-y-3">
                      {/* Title */}
                      <div className="space-y-1">
                        <Label htmlFor={`${param.key}-title`}>{t('templates.parameterEditor.fields.title')}</Label>
                        <Input
                          id={`${param.key}-title`}
                          value={param.title}
                          onChange={(e) => updateParameter(param.key, { title: e.target.value })}
                          placeholder={t('templates.parameterEditor.placeholders.title')}
                        />
                      </div>

                      {/* Type */}
                      <div className="space-y-1">
                        <Label htmlFor={`${param.key}-type`}>{t('templates.parameterEditor.fields.type')}</Label>
                        <Select
                          value={param.type}
                          onValueChange={(value: 'text' | 'dropdown' | 'secret') =>
                            updateParameter(param.key, { type: value })
                          }
                        >
                          <SelectTrigger id={`${param.key}-type`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">{t('templates.parameterEditor.types.text')}</SelectItem>
                            <SelectItem value="dropdown">{t('templates.parameterEditor.types.dropdown')}</SelectItem>
                            <SelectItem value="secret">{t('templates.parameterEditor.types.secret')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Default Value */}
                      {param.type !== 'secret' && (
                        <div className="space-y-1">
                          <Label htmlFor={`${param.key}-default`}>{t('templates.parameterEditor.fields.defaultValue')}</Label>
                          <Input
                            id={`${param.key}-default`}
                            value={param.default || ''}
                            onChange={(e) => updateParameter(param.key, { default: e.target.value })}
                            placeholder={t('templates.parameterEditor.placeholders.defaultValue')}
                          />
                        </div>
                      )}

                      {/* Dropdown Options */}
                      {param.type === 'dropdown' && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>{t('templates.parameterEditor.fields.options')}</Label>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAddOption(param.key)}
                              className="h-7 gap-1"
                            >
                              <Plus className="h-3 w-3" />
                              {t('templates.parameterEditor.fields.addOption')}
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {(param.options || []).map((option, index) => (
                              <div key={index} className="flex gap-2">
                                <Input
                                  value={option}
                                  onChange={(e) => handleUpdateOption(param.key, index, e.target.value)}
                                  placeholder={`Option ${index + 1}`}
                                  className="flex-1"
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveOption(param.key, index)}
                                  className="h-9 w-9 p-0"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Secret fields */}
                      {param.type === 'secret' && (
                        <>
                          <div className="space-y-1">
                            <Label htmlFor={`${param.key}-group`}>{t('templates.parameterEditor.fields.secretGroup')}</Label>
                            <Input
                              id={`${param.key}-group`}
                              value={param.group || ''}
                              onChange={(e) => updateParameter(param.key, { group: e.target.value })}
                              placeholder={t('templates.parameterEditor.placeholders.secretGroup')}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`${param.key}-secretKey`}>{t('templates.parameterEditor.fields.secretKey')}</Label>
                            <Input
                              id={`${param.key}-secretKey`}
                              value={param.secretKey || ''}
                              onChange={(e) => updateParameter(param.key, { secretKey: e.target.value })}
                              placeholder={t('templates.parameterEditor.placeholders.secretKey')}
                            />
                          </div>
                        </>
                      )}

                      {param.modified && (
                        <Badge variant="secondary" className="text-xs">
                          {t('templates.parameterEditor.badges.modified')}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Error Message */}
        {error && (
          <div className="flex-shrink-0 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            {t('templates.parameterEditor.actions.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !parameters.some(p => p.modified)}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? t('templates.parameterEditor.actions.saving') : t('templates.parameterEditor.actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
