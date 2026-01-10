import { useState, useEffect } from 'react';
import {
    Bot,
    Search,
    ChevronRight,
    Loader2,
    AlertCircle,
    Plus,
    Trash2
} from 'lucide-react';
import { ScrollArea } from './ui/scroll-area';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import type { CustomAgent } from '../../preload/api/agent-api';
import ReactMarkdown from 'react-markdown';

export function CustomAgents() {
    const [agents, setAgents] = useState<CustomAgent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedAgent, setSelectedAgent] = useState<CustomAgent | null>(null);
    const [agentDetails, setAgentDetails] = useState<string | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Create Agent State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        model: 'sonnet',
        color: 'blue',
        content: ''
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadAgents();
    }, []);

    const loadAgents = async () => {
        setLoading(true);
        try {
            const result = await window.electronAPI.getCustomAgents();
            if (result.success && result.data) {
                setAgents(result.data);
            } else {
                setError(result.error || 'Failed to load agents');
            }
        } catch (err) {
            setError('An unexpected error occurred');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadAgentDetails = async (agent: CustomAgent) => {
        setSelectedAgent(agent);
        setLoadingDetails(true);
        try {
            const result = await window.electronAPI.getCustomAgentDetails(agent.path);
            if (result.success && result.data) {
                setAgentDetails(result.data);
            } else {
                setAgentDetails('Failed to load agent details');
            }
        } catch (err) {
            setAgentDetails('An error occurred while loading details');
            console.error(err);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleCreateAgent = async () => {
        setIsSaving(true);
        try {
            // Construct markdown with frontmatter
            const fullContent = `---
name: ${formData.name}
description:
  ${formData.description.replace(/\n/g, '\n  ')}
model: ${formData.model}
color: ${formData.color}
---

${formData.content}
`;

            // Use name (dasherized) as ID/Filename
            const id = formData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

            const result = await window.electronAPI.saveCustomAgent(id, fullContent);
            if (result.success) {
                setIsCreateOpen(false);
                setFormData({
                    name: '',
                    description: '',
                    model: 'sonnet',
                    color: 'blue',
                    content: ''
                });
                loadAgents(); // Refresh list
            } else {
                alert('Failed to save agent: ' + result.error);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to save agent');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAgent = async (agent: CustomAgent) => {
        if (!confirm(`Are you sure you want to delete ${agent.name}?`)) return;

        try {
            const result = await window.electronAPI.deleteCustomAgent(agent.id);
            if (result.success) {
                setSelectedAgent(null);
                loadAgents();
            } else {
                alert('Failed to delete agent: ' + result.error);
            }
        } catch (err) {
            console.error(err);
            alert('Failed to delete agent');
        }
    };

    const filteredAgents = agents.filter(agent =>
        agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        agent.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
                <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                        <Bot className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Custom Agents</h1>
                        <p className="text-sm text-muted-foreground">
                            Manage and view specialized agents
                        </p>
                    </div>
                </div>
                <Button onClick={() => setIsCreateOpen(true)} size="sm" className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Agent
                </Button>
            </div>

            {/* Search Bar */}
            <div className="px-6 py-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search agents..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                </div>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1 px-6">
                {loading ? (
                    <div className="flex items-center justify-center p-12 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        Loading agents...
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center p-12 text-destructive">
                        <AlertCircle className="h-8 w-8 mb-2" />
                        <p>{error}</p>
                    </div>
                ) : filteredAgents.length === 0 ? (
                    <div className="text-center p-12 text-muted-foreground">
                        No agents found. Create one to get started!
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
                        {filteredAgents.map((agent) => (
                            <button
                                key={agent.id}
                                onClick={() => loadAgentDetails(agent)}
                                className="flex flex-col text-left p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-all group relative"
                            >
                                <div className="flex items-start justify-between w-full mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full bg-${agent.color}-500`} />
                                        <h3 className="font-medium">{agent.name}</h3>
                                    </div>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">
                                    {agent.description}
                                </p>
                                <div className="flex items-center gap-2 mt-auto">
                                    <span className="text-[10px] font-mono bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">
                                        {agent.model}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </ScrollArea>

            {/* Agent Details Dialog */}
            <Dialog open={!!selectedAgent} onOpenChange={(open) => !open && setSelectedAgent(null)}>
                <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <DialogTitle className="flex items-center gap-2">
                                <Bot className="h-5 w-5" />
                                {selectedAgent?.name}
                            </DialogTitle>
                            {selectedAgent && (
                                <Button
                                    variant="destructive"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => handleDeleteAgent(selectedAgent)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                        <DialogDescription>
                            {selectedAgent?.description}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto min-h-[300px] border rounded-md p-4 bg-muted/30">
                        {loadingDetails ? (
                            <div className="flex items-center justify-center h-full">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown>{agentDetails || ''}</ReactMarkdown>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create Agent Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Create Custom Agent</DialogTitle>
                        <DialogDescription>
                            Define a new agent with specific capabilities and context.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Agent Name (ID)</Label>
                                <Input
                                    id="name"
                                    placeholder="e.g. backend-optimizer"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="model">Model</Label>
                                <Select
                                    value={formData.model}
                                    onValueChange={(val) => setFormData({ ...formData, model: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select model" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="sonnet">Claude 3.5 Sonnet</SelectItem>
                                        <SelectItem value="opus">Claude 3 Opus</SelectItem>
                                        <SelectItem value="haiku">Claude 3 Haiku</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="color">Color</Label>
                                <Select
                                    value={formData.color}
                                    onValueChange={(val) => setFormData({ ...formData, color: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select color" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="blue">Blue</SelectItem>
                                        <SelectItem value="green">Green</SelectItem>
                                        <SelectItem value="orange">Orange</SelectItem>
                                        <SelectItem value="purple">Purple</SelectItem>
                                        <SelectItem value="red">Red</SelectItem>
                                        <SelectItem value="yellow">Yellow</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Brief description of what this agent does..."
                                className="resize-none"
                                rows={3}
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="content">Prompt / Capabilities</Label>
                            <Textarea
                                id="content"
                                placeholder="Detailed instructions, capabilities, and context for this agent..."
                                className="font-mono text-sm"
                                rows={10}
                                value={formData.content}
                                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateAgent} disabled={isSaving || !formData.name}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Create Agent
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
