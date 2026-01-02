export interface Guide {
  id: string;
  title: string;
  description: string;
  category: 'setup' | 'usage' | 'reference' | 'faq';
  icon: string;
  content: string;
}

export interface KnowledgeBaseState {
  guides: Guide[];
  selectedGuide: Guide | null;
  searchQuery: string;
  selectedCategory: string | null;
}
