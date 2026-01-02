import { useState, useMemo } from 'react';
import { Search, BookOpen } from 'lucide-react';
import { Input } from '../ui/input';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import { GUIDES, GUIDE_CATEGORIES } from './guides-data';
import { GuideCard } from './GuideCard';
import { GuideViewer } from './GuideViewer';
import type { Guide } from './types';

export function KnowledgeBase() {
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const filteredGuides = useMemo(() => {
    return GUIDES.filter((guide) => {
      // Filter by category
      if (selectedCategory !== 'all' && guide.category !== selectedCategory) {
        return false;
      }

      // Filter by search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          guide.title.toLowerCase().includes(query) ||
          guide.description.toLowerCase().includes(query) ||
          guide.content.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [searchQuery, selectedCategory]);

  if (selectedGuide) {
    return <GuideViewer guide={selectedGuide} onBack={() => setSelectedGuide(null)} />;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 bg-card/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Knowledge Base</h1>
            <p className="text-sm text-muted-foreground">
              Guides and documentation to help you get the most out of Auto Claude
            </p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search guides..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex gap-2">
            {GUIDE_CATEGORIES.map((category) => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  selectedCategory === category.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
                )}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Guide Grid */}
      <ScrollArea className="flex-1">
        <div className="p-6">
          {filteredGuides.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground">No guides found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search or filter criteria
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGuides.map((guide) => (
                <GuideCard
                  key={guide.id}
                  guide={guide}
                  onClick={() => setSelectedGuide(guide)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
