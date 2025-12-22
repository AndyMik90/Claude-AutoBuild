/**
 * Model Discovery Grid Component
 *
 * Sexy, interactive component for discovering and managing Ollama models
 * Features beautiful cards, search, filtering, and one-click downloads
 */

import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Brain,
  Zap,
  Package,
  CheckCircle2,
  XCircle,
  Loader2,
  Info,
  Star,
  Clock,
  HardDrive
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
  downloaded?: boolean;
  downloading?: boolean;
  progress?: number;
}

interface ModelDiscoveryGridProps {
  models: OllamaModel[];
  onDownloadModel: (modelName: string) => void;
  onSelectModel: (modelName: string, modelType: 'llm' | 'embedding') => void;
  selectedLLM?: string;
  selectedEmbedding?: string;
  isScanning?: boolean;
  scanError?: string;
  onScanModels?: () => void;
  showLLMSection?: boolean;
  showEmbeddingSection?: boolean;
  downloadProgress?: {
    [modelName: string]: {
      percentage: number;
      status: string;
      completed: number;
      total: number;
      speed?: string;
      timeRemaining?: string;
      error?: string;
    };
  };
}

export function ModelDiscoveryGrid({
  models,
  onDownloadModel,
  onSelectModel,
  selectedLLM,
  selectedEmbedding,
  isScanning = false,
  scanError,
  onScanModels,
  showLLMSection = true,
  showEmbeddingSection = true,
  downloadProgress = {}
}: ModelDiscoveryGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'recent'>('name');

  // Classify model types
  const classifyModel = (modelName: string): 'llm' | 'embedding' => {
    const lowerName = modelName.toLowerCase();
    // Common embedding model patterns
    if (lowerName.includes('embed') || lowerName.includes('nomic') || lowerName.includes('all-minilm')) {
      return 'embedding';
    }
    return 'llm';
  };



  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  // Get model popularity score (simulated based on name patterns)
  const getPopularity = (modelName: string): 'high' | 'medium' | 'low' => {
    const lowerName = modelName.toLowerCase();
    if (lowerName.includes('llama3') || lowerName.includes('mistral') || lowerName.includes('codellama')) {
      return 'high';
    }
    if (lowerName.includes('phi') || lowerName.includes('gemma')) {
      return 'medium';
    }
    return 'low';
  };

  // Separate models by type
  const llmModels = useMemo(() => {
    return models.filter(model => classifyModel(model.name) === 'llm');
  }, [models]);

  const embeddingModels = useMemo(() => {
    return models.filter(model => classifyModel(model.name) === 'embedding');
  }, [models]);

  return (
    <div className="space-y-8">
      {/* Header with scan button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Available Models</h3>
          <p className="text-sm text-muted-foreground">
            Discover and download Ollama models for your setup
          </p>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onScanModels}
                disabled={isScanning}
                variant="outline"
                className="flex items-center gap-2"
              >
                {isScanning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                {isScanning ? 'Scanning...' : 'Scan Models'}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Discover all available models on your Ollama server</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Search and Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="size">Size</SelectItem>
            <SelectItem value="recent">Recent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Scan Error */}
      {scanError && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{scanError}</p>
          </div>
        </div>
      )}

      {/* LLM Models Section */}
      {showLLMSection && (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">LLM Models</h3>
            <p className="text-xs text-muted-foreground">Large language models for intelligent responses</p>
          </div>
        </div>
        
        {llmModels.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {llmModels.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => {
              if (sortBy === 'name') return a.name.localeCompare(b.name);
              if (sortBy === 'size') return b.size - a.size;
              if (sortBy === 'recent') return new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime();
              return 0;
            }).map((model) => {
              const isSelected = selectedLLM === model.name;
              const popularity = getPopularity(model.name);

              return (
                <Card
                  key={model.name}
                  className={`flex flex-col transition-all duration-200 ${
                    isSelected 
                      ? 'ring-2 ring-blue-500 shadow-lg bg-blue-500/5' 
                      : 'hover:shadow-md hover:border-border'
                  }`}
                >
                  <CardContent className="p-4 flex-1 flex flex-col">
                    {/* Header: Icon + Model Name */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-blue-500 to-purple-600">
                        <Brain className="w-6 h-6 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-sm break-words">{model.name}</h4>
                        <div className="flex items-center gap-2 mt-1.5">
                          {popularity === 'high' && (
                            <Star className="w-3 h-3 text-yellow-500 fill-current flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Model Info */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3 flex-shrink-0" />
                        <span>{formatSize(model.size)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Download Progress */}
                    {model.downloading && model.progress !== undefined && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span>Downloading...</span>
                          <span>{Math.round(model.progress)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${model.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Actions - spacer for flex layout */}
                    <div className="flex-1" />

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {!model.downloaded && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={model.downloading}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDownloadModel(model.name);
                          }}
                        >
                          {model.downloading ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              Downloading
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className={`flex-1 text-sm font-medium ${
                          isSelected 
                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                            : 'bg-muted hover:bg-muted/80 text-foreground'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectModel(model.name, 'llm');
                        }}
                      >
                        {isSelected ? '✓ Selected' : 'Select'}
                      </Button>
                    </div>
                   </CardContent>
                 </Card>
               );
            })}
          </div>
        ) : (
          <div className="py-8">
            <p className="text-sm font-medium text-foreground mb-3 text-center">No LLM models downloaded yet</p>
            <p className="text-xs text-muted-foreground mb-4 text-center">
              Try downloading one of these popular models:
            </p>
            <div className="space-y-3 text-sm">
              {/* llama3.2 - ~4.1GB, 3.8B parameters */}
              <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 text-left">
                    <p className="font-mono text-sm font-semibold text-foreground mb-1">llama3.2</p>
                    <p className="text-xs text-muted-foreground mb-2">Fast, capable LLM (good for most tasks)</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              4.1 GB
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Model size on disk</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span>•</span>
                      <span>3.8B parameters</span>
                    </div>
                  </div>
                  {downloadProgress['llama3.2'] ? (
                    <div className="w-32">
                      <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full transition-all duration-300"
                          style={{ width: `${downloadProgress['llama3.2'].percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 text-center">
                        <p className="font-semibold">{downloadProgress['llama3.2'].percentage}%</p>
                        {downloadProgress['llama3.2'].speed && (
                          <p className="text-xs">{downloadProgress['llama3.2'].speed}</p>
                        )}
                        {downloadProgress['llama3.2'].timeRemaining && (
                          <p className="text-xs">{downloadProgress['llama3.2'].timeRemaining}</p>
                        )}
                        {downloadProgress['llama3.2'].error && (
                          <p className="text-xs text-red-500">{downloadProgress['llama3.2'].error}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => onDownloadModel('llama3.2')}
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              </div>

              {/* mistral - ~4.1GB, 7.3B parameters */}
              <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 text-left">
                    <p className="font-mono text-sm font-semibold text-foreground mb-1">mistral</p>
                    <p className="text-xs text-muted-foreground mb-2">Efficient and fast (great for code)</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              4.1 GB
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Model size on disk</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span>•</span>
                      <span>7.3B parameters</span>
                    </div>
                  </div>
                  {downloadProgress['mistral'] ? (
                    <div className="w-32">
                      <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full transition-all duration-300"
                          style={{ width: `${downloadProgress['mistral'].percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 text-center">
                        <p className="font-semibold">{downloadProgress['mistral'].percentage}%</p>
                        {downloadProgress['mistral'].speed && (
                          <p className="text-xs">{downloadProgress['mistral'].speed}</p>
                        )}
                        {downloadProgress['mistral'].timeRemaining && (
                          <p className="text-xs">{downloadProgress['mistral'].timeRemaining}</p>
                        )}
                        {downloadProgress['mistral'].error && (
                          <p className="text-xs text-red-500">{downloadProgress['mistral'].error}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => onDownloadModel('mistral')}
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              </div>

              {/* deepseek-r1:7b - ~3.6GB, 7.0B parameters */}
              <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 text-left">
                    <p className="font-mono text-sm font-semibold text-foreground mb-1">deepseek-r1:7b</p>
                    <p className="text-xs text-muted-foreground mb-2">Advanced reasoning (best quality)</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              3.6 GB
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Model size on disk</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span>•</span>
                      <span>7.0B parameters</span>
                    </div>
                  </div>
                  {downloadProgress['deepseek-r1:7b'] ? (
                    <div className="w-32">
                      <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full transition-all duration-300"
                          style={{ width: `${downloadProgress['deepseek-r1:7b'].percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 text-center">
                        <p className="font-semibold">{downloadProgress['deepseek-r1:7b'].percentage}%</p>
                        {downloadProgress['deepseek-r1:7b'].speed && (
                          <p className="text-xs">{downloadProgress['deepseek-r1:7b'].speed}</p>
                        )}
                        {downloadProgress['deepseek-r1:7b'].timeRemaining && (
                          <p className="text-xs">{downloadProgress['deepseek-r1:7b'].timeRemaining}</p>
                        )}
                        {downloadProgress['deepseek-r1:7b'].error && (
                          <p className="text-xs text-red-500">{downloadProgress['deepseek-r1:7b'].error}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => onDownloadModel('deepseek-r1:7b')}
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Click "Scan Models" above to see if you have any already downloaded
            </p>
          </div>
        )}
      </div>
      )}

      {/* Embedding Models Section */}
      {showEmbeddingSection && (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Embedding Models</h3>
            <p className="text-xs text-muted-foreground">Models for semantic search and vector embeddings</p>
          </div>
        </div>
        
        {embeddingModels.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {embeddingModels.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase())).sort((a, b) => {
              if (sortBy === 'name') return a.name.localeCompare(b.name);
              if (sortBy === 'size') return b.size - a.size;
              if (sortBy === 'recent') return new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime();
              return 0;
            }).map((model) => {
              const isSelected = selectedEmbedding === model.name;
              const popularity = getPopularity(model.name);

              return (
                <Card
                  key={model.name}
                  className={`flex flex-col transition-all duration-200 ${
                    isSelected 
                      ? 'ring-2 ring-green-500 shadow-lg bg-green-500/5' 
                      : 'hover:shadow-md hover:border-border'
                  }`}
                >
                  <CardContent className="p-4 flex-1 flex flex-col">
                    {/* Header: Icon + Model Name */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-green-500 to-teal-600">
                        <Zap className="w-6 h-6 text-white" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-sm break-words">{model.name}</h4>
                        <div className="flex items-center gap-2 mt-1.5">
                          {popularity === 'high' && (
                            <Star className="w-3 h-3 text-yellow-500 fill-current flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Model Info */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                      <div className="flex items-center gap-1">
                        <HardDrive className="w-3 h-3 flex-shrink-0" />
                        <span>{formatSize(model.size)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 flex-shrink-0" />
                        <span>{new Date(model.modified_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Download Progress */}
                    {model.downloading && model.progress !== undefined && (
                      <div className="mb-4">
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span>Downloading...</span>
                          <span>{Math.round(model.progress)}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${model.progress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Actions - spacer for flex layout */}
                    <div className="flex-1" />

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {!model.downloaded && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          disabled={model.downloading}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDownloadModel(model.name);
                          }}
                        >
                          {model.downloading ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin mr-1" />
                              Downloading
                            </>
                          ) : (
                            <>
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className={`flex-1 text-sm font-medium ${
                          isSelected 
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : 'bg-muted hover:bg-muted/80 text-foreground'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectModel(model.name, 'embedding');
                        }}
                      >
                        {isSelected ? '✓ Selected' : 'Select'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="py-8">
            <p className="text-sm font-medium text-foreground mb-3 text-center">No embedding models downloaded yet</p>
            <p className="text-xs text-muted-foreground mb-4 text-center">
              Try downloading one of these popular models:
            </p>
            <div className="space-y-3 text-sm">
              {/* nomic-embed-text - ~262MB, 384d */}
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 text-left">
                    <p className="font-mono text-sm font-semibold text-foreground mb-1">nomic-embed-text</p>
                    <p className="text-xs text-muted-foreground mb-2">Great for semantic search (recommended)</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              262 MB
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Model size on disk</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span>•</span>
                      <span>384-dim vectors</span>
                    </div>
                  </div>
                  {downloadProgress['nomic-embed-text'] ? (
                    <div className="w-32">
                      <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-green-500 h-full transition-all duration-300"
                          style={{ width: `${downloadProgress['nomic-embed-text'].percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 text-center">
                        <p className="font-semibold">{downloadProgress['nomic-embed-text'].percentage}%</p>
                        {downloadProgress['nomic-embed-text'].speed && (
                          <p className="text-xs">{downloadProgress['nomic-embed-text'].speed}</p>
                        )}
                        {downloadProgress['nomic-embed-text'].timeRemaining && (
                          <p className="text-xs">{downloadProgress['nomic-embed-text'].timeRemaining}</p>
                        )}
                        {downloadProgress['nomic-embed-text'].error && (
                          <p className="text-xs text-red-500">{downloadProgress['nomic-embed-text'].error}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => onDownloadModel('nomic-embed-text')}
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              </div>

              {/* mxbai-embed-large - ~638MB, 1024d */}
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 text-left">
                    <p className="font-mono text-sm font-semibold text-foreground mb-1">mxbai-embed-large</p>
                    <p className="text-xs text-muted-foreground mb-2">Larger, more accurate embeddings</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              638 MB
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Model size on disk</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span>•</span>
                      <span>1024-dim vectors</span>
                    </div>
                  </div>
                  {downloadProgress['mxbai-embed-large'] ? (
                    <div className="w-32">
                      <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-green-500 h-full transition-all duration-300"
                          style={{ width: `${downloadProgress['mxbai-embed-large'].percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 text-center">
                        <p className="font-semibold">{downloadProgress['mxbai-embed-large'].percentage}%</p>
                        {downloadProgress['mxbai-embed-large'].speed && (
                          <p className="text-xs">{downloadProgress['mxbai-embed-large'].speed}</p>
                        )}
                        {downloadProgress['mxbai-embed-large'].timeRemaining && (
                          <p className="text-xs">{downloadProgress['mxbai-embed-large'].timeRemaining}</p>
                        )}
                        {downloadProgress['mxbai-embed-large'].error && (
                          <p className="text-xs text-red-500">{downloadProgress['mxbai-embed-large'].error}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => onDownloadModel('mxbai-embed-large')}
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              </div>

              {/* all-minilm-l6-v2 - ~61MB, 384d */}
              <div className="rounded-md border border-green-500/30 bg-green-500/5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 text-left">
                    <p className="font-mono text-sm font-semibold text-foreground mb-1">all-minilm-l6-v2</p>
                    <p className="text-xs text-muted-foreground mb-2">Lightweight and fast</p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="flex items-center gap-1">
                              <HardDrive className="w-3 h-3" />
                              61 MB
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Model size on disk</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span>•</span>
                      <span>384-dim vectors</span>
                    </div>
                  </div>
                  {downloadProgress['all-minilm-l6-v2'] ? (
                    <div className="w-32">
                      <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-green-500 h-full transition-all duration-300"
                          style={{ width: `${downloadProgress['all-minilm-l6-v2'].percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 text-center">
                        <p className="font-semibold">{downloadProgress['all-minilm-l6-v2'].percentage}%</p>
                        {downloadProgress['all-minilm-l6-v2'].speed && (
                          <p className="text-xs">{downloadProgress['all-minilm-l6-v2'].speed}</p>
                        )}
                        {downloadProgress['all-minilm-l6-v2'].timeRemaining && (
                          <p className="text-xs">{downloadProgress['all-minilm-l6-v2'].timeRemaining}</p>
                        )}
                        {downloadProgress['all-minilm-l6-v2'].error && (
                          <p className="text-xs text-red-500">{downloadProgress['all-minilm-l6-v2'].error}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => onDownloadModel('all-minilm-l6-v2')}
                      size="sm"
                      variant="outline"
                      className="whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              Click "Scan Models" above to see if you have any already downloaded
            </p>
          </div>
        )}
      </div>
      )}

      {/* Loading State */}
      {isScanning && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Scanning for models...</h3>
            <p className="text-muted-foreground">This may take a moment</p>
          </div>
        </div>
      )}
    </div>
  );
}