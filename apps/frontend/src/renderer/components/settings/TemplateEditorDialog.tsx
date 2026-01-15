import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Send, Trash2, AlertCircle, Loader2, FileEdit, Terminal } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import type { Template, TemplateEditorStatus, TemplateEditorStreamChunk } from '../../../shared/types';

interface TemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  toolUse?: {
    name: string;
    input: any;
    result?: string;
  }[];
}

export function TemplateEditorDialog({ open, onOpenChange, template }: TemplateEditorDialogProps) {
  const { t } = useTranslation('settings');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const [status, setStatus] = useState<TemplateEditorStatus | null>(null);
  const [currentStreamChunk, setCurrentStreamChunk] = useState<string>('');
  const [currentToolUse, setCurrentToolUse] = useState<{ name: string; input: any; result?: string }[]>([]);
  const [error, setError] = useState<string>('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStreamChunk]);

  // Check if API profile/key is available when dialog opens, reset when closed
  useEffect(() => {
    if (open && template && !isInitialized) {
      checkAvailability();
    } else if (!open) {
      // Reset state when dialog closes
      setIsInitialized(false);
      setMessages([]);
      setCurrentStreamChunk('');
      setCurrentToolUse([]);
      setError('');
      setStatus(null);
      setInput('');
    }
  }, [open, template]);

  // Set up event listeners
  useEffect(() => {
    if (!open || !template) return;

    const unsubscribeStatus = window.electronAPI.onTemplateEditorStatus((templateId, newStatus) => {
      if (templateId === template.id) {
        setStatus(newStatus);
        if (newStatus === 'complete') {
          // Finalize the current message
          if (currentStreamChunk || currentToolUse.length > 0) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: currentStreamChunk,
              timestamp: Date.now(),
              toolUse: currentToolUse.length > 0 ? [...currentToolUse] : undefined
            }]);
            setCurrentStreamChunk('');
            setCurrentToolUse([]);
          }
        }
      }
    });

    const unsubscribeChunk = window.electronAPI.onTemplateEditorStreamChunk((templateId, chunk) => {
      if (templateId === template.id) {
        if (chunk.type === 'text' && chunk.text) {
          setCurrentStreamChunk(prev => prev + chunk.text);
        } else if (chunk.type === 'tool_use') {
          const toolInfo = {
            name: chunk.name || 'unknown',
            input: chunk.input,
            result: chunk.result
          };
          setCurrentToolUse(prev => [...prev, toolInfo]);
        }
      }
    });

    const unsubscribeError = window.electronAPI.onTemplateEditorError((templateId, errorMsg) => {
      if (templateId === template.id) {
        setError(errorMsg);
        setStatus('error');
      }
    });

    return () => {
      unsubscribeStatus();
      unsubscribeChunk();
      unsubscribeError();
    };
  }, [open, template, currentStreamChunk, currentToolUse]);

  const checkAvailability = async () => {
    if (!template) return;

    try {
      const result = await window.electronAPI.checkTemplateEditorInitialized();
      if (result.success && result.data) {
        setIsInitialized(true);
        setError('');
      } else {
        setError('No API profile configured. Please set up an API profile or add your Anthropic API key in settings.');
        setIsInitialized(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check availability');
      setIsInitialized(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !template || !isInitialized || status === 'thinking') return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setError('');
    setCurrentStreamChunk('');
    setCurrentToolUse([]);

    try {
      const result = await window.electronAPI.sendTemplateEditorMessage(
        template.id,
        template.folderPath,
        userMessage.content
      );

      if (!result.success) {
        setError(result.error || 'Failed to send message');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    }
  };

  const handleClearHistory = async () => {
    if (!template || !window.confirm('Clear all conversation history? This cannot be undone.')) return;

    try {
      const result = await window.electronAPI.clearTemplateEditorHistory(template.id);
      if (result.success) {
        setMessages([]);
        setCurrentStreamChunk('');
        setCurrentToolUse([]);
        setError('');
      } else {
        setError(result.error || 'Failed to clear history');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear history');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Show configuration required message if no profile/API key is available
  if (!isInitialized && error && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Template Editor
            </DialogTitle>
            <DialogDescription>
              Configure an API profile or add your Anthropic API key to use the AI template editor
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-2">
              No API configuration found
            </p>
            <p className="text-xs text-muted-foreground">
              Go to Settings → API Profiles to configure a custom API endpoint,<br />
              or Settings → API Keys to add your Anthropic API key
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] h-[600px] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Template Editor
            {template && <span className="text-sm font-normal text-muted-foreground">- {template.name}</span>}
          </DialogTitle>
          <DialogDescription>
            Use natural language to inject dynamic parameters into your template files
          </DialogDescription>
        </DialogHeader>

        {/* Messages Area */}
        <ScrollArea ref={scrollAreaRef} className="flex-1 pr-4 -mr-4">
          <div className="space-y-4 py-4">
            {/* Welcome Message */}
            {messages.length === 0 && !currentStreamChunk && (
              <div className="text-center py-8">
                <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-medium mb-2">AI Template Assistant Ready</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Tell me what you'd like to make dynamic in your template
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Example: "Make the app title dynamic"</p>
                  <p>Example: "Add a dropdown for region selection"</p>
                  <p>Example: "Create a secret parameter for database password"</p>
                </div>
              </div>
            )}

            {/* Message History */}
            {messages.map((message, idx) => (
              <div
                key={idx}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                  {/* Tool Use Indicators */}
                  {message.toolUse && message.toolUse.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs opacity-75">
                      {message.toolUse.map((tool, toolIdx) => (
                        <div key={toolIdx} className="flex items-center gap-1">
                          {tool.name === 'read_file' && <FileEdit className="h-3 w-3" />}
                          {tool.name === 'write_file' && <FileEdit className="h-3 w-3" />}
                          {tool.name === 'list_files' && <Terminal className="h-3 w-3" />}
                          <span>{tool.name}</span>
                          {tool.input?.path && <span className="truncate">: {tool.input.path}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-xs opacity-50 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}

            {/* Current Streaming Message */}
            {(currentStreamChunk || currentToolUse.length > 0) && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                  {currentStreamChunk && (
                    <p className="text-sm whitespace-pre-wrap">{currentStreamChunk}</p>
                  )}

                  {currentToolUse.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs opacity-75">
                      {currentToolUse.map((tool, toolIdx) => (
                        <div key={toolIdx} className="flex items-center gap-1">
                          {tool.name === 'read_file' && <FileEdit className="h-3 w-3" />}
                          {tool.name === 'write_file' && <FileEdit className="h-3 w-3" />}
                          {tool.name === 'list_files' && <Terminal className="h-3 w-3" />}
                          <span>{tool.name}</span>
                          {tool.input?.path && <span className="truncate">: {tool.input.path}</span>}
                        </div>
                      ))}
                    </div>
                  )}

                  {status === 'thinking' && (
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Error Message */}
        {error && (
          <div className="flex-shrink-0 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Input Area */}
        <div className="flex-shrink-0 space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Ask AI to modify your template..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={!isInitialized || status === 'thinking'}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!input.trim() || !isInitialized || status === 'thinking'}
              size="icon"
            >
              {status === 'thinking' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>

          <div className="flex justify-between items-center">
            <p className="text-xs text-muted-foreground">
              Press Enter to send, Shift+Enter for new line
            </p>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearHistory}
                className="gap-1 h-7 text-xs"
              >
                <Trash2 className="h-3 w-3" />
                Clear History
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
