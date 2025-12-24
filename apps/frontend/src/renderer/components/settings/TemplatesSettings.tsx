import { useState, useEffect } from 'react';
import { Plus, Folder, Trash2, Pencil, Key, ArrowLeft, HelpCircle, Code2, Search } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { SettingsSection } from './SettingsSection';
import type { Template } from '../../../shared/types';
import { AddTemplateDialog } from './AddTemplateDialog';
import { SecretsManager } from './SecretsManager';

type View = 'templates' | 'secrets';

export function TemplatesSettings() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [view, setView] = useState<View>('templates');
  const [showGuide, setShowGuide] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.getTemplates();
      if (result.success && result.data) {
        setTemplates(result.data);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleAddTemplate = () => {
    setEditingTemplate(null);
    setIsAddDialogOpen(true);
  };

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setIsAddDialogOpen(true);
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) {
      return;
    }

    try {
      const result = await window.electronAPI.deleteTemplate(templateId);
      if (result.success) {
        await loadTemplates();
      }
    } catch (error) {
      console.error('Failed to delete template:', error);
    }
  };

  const handleTemplateSaved = () => {
    loadTemplates();
    setIsAddDialogOpen(false);
    setEditingTemplate(null);
  };

  // Filter templates based on search query
  const filteredTemplates = templates.filter(template => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      template.name.toLowerCase().includes(query) ||
      template.folderPath.toLowerCase().includes(query)
    );
  });

  if (isLoading) {
    return (
      <SettingsSection
        title="Templates"
        description="Manage your project templates"
      >
        <div className="text-sm text-muted-foreground">Loading templates...</div>
      </SettingsSection>
    );
  }

  // Render Secrets view
  if (view === 'secrets') {
    return (
      <div className="space-y-6">
        {/* Header with Back Button */}
        <div className="flex items-start justify-between">
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('templates')}
              className="gap-2 -ml-2 mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Templates
            </Button>
            <h2 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Key className="h-6 w-6" />
              Secrets Manager
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Securely manage encrypted credentials with group templates and account instances
            </p>
          </div>
        </div>

        {/* Secrets Manager Content */}
        <SecretsManager />
      </div>
    );
  }

  // Render Templates view
  return (
    <div className="space-y-6">
        {/* Header with Secrets Button */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Templates</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create and manage reusable project templates with dynamic parameters
            </p>
          </div>
          <Button onClick={() => setView('secrets')} variant="outline" className="gap-2">
            <Key className="h-4 w-4" />
            Secrets
          </Button>
        </div>

        {/* Description and Guide */}
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-medium text-sm mb-2">Dynamic Parameters</h3>
              <p className="text-sm text-muted-foreground">
                Templates support dynamic parameters for text inputs, dropdowns, and encrypted secrets.
                Add parameters to your template files, and they'll be automatically prompted when creating new projects.
                Secret parameters connect to your Secrets Manager for secure credential injection.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGuide(true)}
              className="gap-2 shrink-0"
            >
              <HelpCircle className="h-4 w-4" />
              View Guide
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Search and Add Template Button */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button onClick={handleAddTemplate} className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Add Template
            </Button>
          </div>

          {/* Templates Grid */}
          {templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Folder className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No templates yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first project template to get started
              </p>
              <Button onClick={handleAddTemplate} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Create Template
              </Button>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No templates found</h3>
              <p className="text-sm text-muted-foreground mb-4">
                No templates match your search "{searchQuery}"
              </p>
              <Button onClick={() => setSearchQuery('')} variant="outline">
                Clear Search
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <Card
                  key={template.id}
                  className="group relative overflow-hidden hover:border-accent transition-all"
                >
                  <CardContent className="p-4">
                    {/* Template Image/Icon */}
                    <div className="aspect-video rounded-md bg-muted mb-3 flex items-center justify-center overflow-hidden">
                      {template.imagePath ? (
                        <img
                          src={`file://${template.imagePath}`}
                          alt={template.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Folder className="h-12 w-12 text-muted-foreground" />
                      )}
                    </div>

                    {/* Template Name */}
                    <h3 className="font-medium text-sm mb-1 truncate">{template.name}</h3>

                    {/* Template Path */}
                    <p className="text-xs text-muted-foreground truncate mb-3">
                      {template.folderPath}
                    </p>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditTemplate(template)}
                        className="flex-1 gap-1"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="gap-1 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Add/Edit Template Dialog */}
        <AddTemplateDialog
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          template={editingTemplate}
          onSaved={handleTemplateSaved}
        />

        {/* Parameter Guide Dialog */}
        <Dialog open={showGuide} onOpenChange={setShowGuide}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Template Parameter Guide
              </DialogTitle>
              <DialogDescription>
                Learn how to add dynamic parameters to your project templates
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-6 py-4">
              {/* Introduction */}
              <div>
                <h3 className="font-semibold text-sm mb-2">What are Dynamic Parameters?</h3>
                <p className="text-sm text-muted-foreground">
                  Dynamic parameters allow you to create configurable templates. When creating a project from a template,
                  you'll be prompted to provide values for these parameters, which are then automatically injected into your files.
                </p>
              </div>

              {/* Syntax */}
              <div>
                <h3 className="font-semibold text-sm mb-2">Basic Syntax</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Add parameters to any file in your template using double curly braces:
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-xs">
                  {`{{title="Parameter Name",type=text}}`}
                </div>
              </div>

              {/* Parameter Types */}
              <div>
                <h3 className="font-semibold text-sm mb-3">Parameter Types</h3>

                {/* Text Type */}
                <div className="space-y-3 mb-4">
                  <div className="rounded-md border border-border p-3">
                    <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-mono">text</span>
                      Text Input
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Free-form text input for simple configurable values
                    </p>
                    <div className="rounded bg-muted p-2 font-mono text-xs space-y-1">
                      <div>{`{{title="Project Name",type=text}}`}</div>
                      <div>{`{{title="API Endpoint",type=text,default="https://api.example.com"}}`}</div>
                    </div>
                  </div>

                  {/* Dropdown Type */}
                  <div className="rounded-md border border-border p-3">
                    <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 text-xs font-mono">dropdown</span>
                      Dropdown Select
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Predefined options for users to choose from
                    </p>
                    <div className="rounded bg-muted p-2 font-mono text-xs space-y-1">
                      <div>{`{{title="Region",type=dropdown,options="US,EU,ASIA",default="US"}}`}</div>
                      <div>{`{{title="Environment",type=dropdown,options="dev,staging,prod"}}`}</div>
                    </div>
                  </div>

                  {/* Secret Type */}
                  <div className="rounded-md border border-border p-3">
                    <h4 className="font-medium text-sm mb-1 flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-400 text-xs font-mono">secret</span>
                      Secret Reference
                    </h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      Reference encrypted secrets from your Secrets Manager for secure credential injection
                    </p>
                    <div className="rounded bg-muted p-2 font-mono text-xs space-y-1">
                      <div>{`{{title="AWS Access Key",type=secret,group="AWS",key="ACCESS_KEY"}}`}</div>
                      <div>{`{{title="Database Password",type=secret,group="Database",key="PASSWORD"}}`}</div>
                    </div>
                    <div className="mt-3 rounded bg-amber-500/10 border border-amber-500/20 p-2">
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        <strong>Note:</strong> Secret parameters require:
                      </p>
                      <ul className="text-xs text-amber-700 dark:text-amber-400 ml-4 mt-1 space-y-0.5">
                        <li>• The secret group to exist in your Secrets Manager</li>
                        <li>• The group must have the specified key defined</li>
                        <li>• At least one account in the group with values</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* How It Works */}
              <div>
                <h3 className="font-semibold text-sm mb-2">How It Works</h3>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex gap-2">
                    <span className="shrink-0 font-semibold text-foreground">1.</span>
                    <span>Add parameters to any file in your template folder using the syntax above</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="shrink-0 font-semibold text-foreground">2.</span>
                    <span>When creating a project from the template, you'll see a form with all parameters</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="shrink-0 font-semibold text-foreground">3.</span>
                    <span>Secret parameters show a dropdown of accounts from the matching group</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="shrink-0 font-semibold text-foreground">4.</span>
                    <span>Your values are injected into the files, replacing the parameter placeholders</span>
                  </div>
                </div>
              </div>

              {/* Example */}
              <div>
                <h3 className="font-semibold text-sm mb-2">Example: .env Template File</h3>
                <div className="rounded-md bg-muted p-3 font-mono text-xs space-y-1">
                  <div className="text-muted-foreground"># Application Configuration</div>
                  <div>{`APP_NAME={{title="Application Name",type=text}}`}</div>
                  <div>{`API_URL={{title="API URL",type=text,default="https://api.example.com"}}`}</div>
                  <div>{`ENVIRONMENT={{title="Environment",type=dropdown,options="dev,staging,prod",default="dev"}}`}</div>
                  <div className="pt-2 text-muted-foreground"># AWS Credentials (from Secrets Manager)</div>
                  <div>{`AWS_ACCESS_KEY={{title="AWS Access Key",type=secret,group="AWS",key="ACCESS_KEY"}}`}</div>
                  <div>{`AWS_SECRET_KEY={{title="AWS Secret Key",type=secret,group="AWS",key="SECRET_KEY"}}`}</div>
                  <div>{`AWS_REGION={{title="AWS Region",type=dropdown,options="us-east-1,eu-west-1,ap-southeast-1"}}`}</div>
                </div>
              </div>

              {/* Tips */}
              <div>
                <h3 className="font-semibold text-sm mb-2">Best Practices</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>Use descriptive titles that clearly explain what each parameter is for</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>Provide sensible defaults to speed up project creation</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>Group related parameters together in the same file</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>Parameters with the same secret group are grouped in the UI - only one account selection needed per group</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>Set up your secret groups in the Secrets Manager before using secret parameters</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="shrink-0">•</span>
                    <span>Use straight quotes (") in your parameters, not smart/curly quotes ("")</span>
                  </li>
                </ul>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
  );
}
