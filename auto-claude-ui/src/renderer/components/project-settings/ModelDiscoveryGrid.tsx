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
}

export function ModelDiscoveryGrid({
  models,
  onDownloadModel,
  onSelectModel,
  selectedLLM,
  selectedEmbedding,
  isScanning = false,
  scanError,
  onScanModels
}: ModelDiscoveryGridProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [modelType, setModelType] = useState<'all' | 'llm' | 'embedding'>('all');
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

  // Filter and sort models
  const filteredModels = useMemo(() => {
    let filtered = models;

    // Filter by type
    if (modelType !== 'all') {
      filtered = filtered.filter(model => classifyModel(model.name) === modelType);
    }

    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter(model =>
        model.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort
    return filtered.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'size') return b.size - a.size; // Largest first
      if (sortBy === 'recent') {
        return new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime();
      }
      return 0;
    });
  }, [models, modelType, searchQuery, sortBy]);

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

  return (
    <div className="space-y-6">
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

        <Select value={modelType} onValueChange={(value: any) => setModelType(value)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Models</SelectItem>
            <SelectItem value="llm">LLM Models</SelectItem>
            <SelectItem value="embedding">Embedding Models</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(value: any) => setSortBy(value)}>
          <SelectTrigger className="w-32">
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

       {/* Model Grid */}
       <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredModels.map((model) => {
          const modelType = classifyModel(model.name);
          const popularity = getPopularity(model.name);
          const isSelected = (modelType === 'llm' && selectedLLM === model.name) ||
                           (modelType === 'embedding' && selectedEmbedding === model.name);

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
                   <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
                     modelType === 'llm'
                       ? 'bg-gradient-to-br from-blue-500 to-purple-600'
                       : 'bg-gradient-to-br from-green-500 to-teal-600'
                   }`}>
                     {modelType === 'llm' ? (
                       <Brain className="w-6 h-6 text-white" />
                     ) : (
                       <Zap className="w-6 h-6 text-white" />
                     )}
                   </div>
                   <div className="min-w-0 flex-1">
                     <h4 className="font-semibold text-sm break-words">{model.name}</h4>
                     <div className="flex items-center gap-2 mt-1.5">
                       <Badge
                         variant={modelType === 'llm' ? 'default' : 'secondary'}
                         className="text-xs px-2 py-0.5 flex-shrink-0"
                       >
                         {modelType.toUpperCase()}
                       </Badge>
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
                     variant={isSelected ? "default" : "outline"}
                     size="sm"
                     className={`flex-1 text-sm font-medium ${isSelected ? 'ring-offset-2' : ''}`}
                     onClick={(e) => {
                       e.stopPropagation();
                       onSelectModel(model.name, modelType);
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

      {/* Empty State */}
      {filteredModels.length === 0 && !isScanning && (
        <div className="text-center py-12">
          <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No models found</h3>
          <p className="text-muted-foreground mb-4">
            {searchQuery || modelType !== 'all'
              ? 'Try adjusting your search or filters'
              : 'Scan for available models to get started'
            }
          </p>
          {!searchQuery && modelType === 'all' && onScanModels && (
            <Button onClick={onScanModels} variant="outline">
              <Search className="w-4 h-4 mr-2" />
              Scan for Models
            </Button>
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