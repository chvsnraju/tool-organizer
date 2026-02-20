import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../hooks/useToast';
import { Sparkles, Send, Loader2, Trash2, Wrench, CheckCircle2, ShoppingCart, ClipboardList, ChevronDown, ChevronUp, Plus } from 'lucide-react';
import { generateWithConfiguredProvider } from '../lib/aiClient';
import { getActiveAIProvider, getCurrentProviderApiKey, getProviderLabel } from '../lib/aiConfig';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ProjectAnalysis {
  projectSummary: string;
  toolsRequired: { name: string; reason: string; category: string }[];
  toolsOwned: { name: string; inventoryMatch: string }[];
  toolsToProcure: { name: string; estimatedPrice: string; priority: 'essential' | 'recommended' | 'nice-to-have'; reason: string }[];
  tips: string[];
}

export const WorkAssistantPage: React.FC = () => {
  const { addToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<string[]>([]);
  const [inventorySummary, setInventorySummary] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState<'project' | 'chat'>('project');
  const [showOwnedDetails, setShowOwnedDetails] = useState(false);
  const [addingToShoppingList, setAddingToShoppingList] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadInventoryContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadInventoryContext = async () => {
    try {
      const MAX_ITEMS_FOR_CONTEXT = 500;
      const { data: items, error: itemsError } = await supabase
        .from('items')
        .select('name, description, category, tags, specs')
        .limit(MAX_ITEMS_FOR_CONTEXT);
      const { data: locations, error: locError } = await supabase.from('locations').select('name, description');
      const { data: containers, error: contError } = await supabase.from('containers').select('name, description, location_id');

      if (itemsError) throw itemsError;
      if (locError) throw locError;
      if (contError) throw contError;

      const itemNames = (items || []).map(i => i.name);
      setInventoryItems(itemNames);

      // Build summary with truncated specs to stay within AI token limits
      const itemLines = (items || []).map(i => {
        let specsStr = 'none';
        if (i.specs && typeof i.specs === 'object') {
          const entries = Object.entries(i.specs);
          const topEntries = entries.slice(0, 5);
          specsStr = topEntries.map(([k, v]) => `${k}: ${v}`).join(', ');
          if (entries.length > 5) specsStr += ` (+${entries.length - 5} more)`;
        }
        return `- ${i.name}: ${i.description || 'no desc'} [${i.category || 'uncategorized'}] tags: ${i.tags?.join(', ') || 'none'} specs: ${specsStr}`;
      });

      const summary = [
        `INVENTORY (${items?.length || 0} items${(items?.length || 0) >= MAX_ITEMS_FOR_CONTEXT ? `, showing first ${MAX_ITEMS_FOR_CONTEXT}` : ''}):`,
        ...itemLines,
        '',
        `LOCATIONS (${locations?.length || 0}):`,
        ...(locations || []).map(l => `- ${l.name}: ${l.description || ''}`),
        '',
        `CONTAINERS (${containers?.length || 0}):`,
        ...(containers || []).map(c => `- ${c.name}: ${c.description || ''}`),
      ].join('\n');

      setInventorySummary(summary);
    } catch (e) {
      addToast('Failed to load inventory context: ' + (e as Error).message, 'error');
    }
  };

  const analyzeProject = async () => {
    if (!projectDescription.trim() || analyzing) return;

    const provider = getActiveAIProvider();
    const apiKey = getCurrentProviderApiKey();
    if (!apiKey) {
      setAnalysis(null);
      setMessages([{ role: 'assistant', content: `⚠️ No API key found for **${getProviderLabel(provider)}**. Please go to **Settings** and add one.`, timestamp: new Date() }]);
      setActiveTab('chat');
      return;
    }

    setAnalyzing(true);
    setAnalysis(null);

    try {
      const prompt = `You are a tool/hardware expert assistant. The user wants to start a project and needs to know what tools are required.

PROJECT DESCRIPTION:
${projectDescription}

USER'S CURRENT TOOL INVENTORY:
${inventorySummary || 'No items in inventory yet.'}

TASK:
1. Analyze the project and identify ALL tools and materials needed.
2. Cross-reference with the user's inventory to find which tools they ALREADY OWN.
3. Identify which tools they NEED TO PROCURE (buy/rent).
4. Provide practical tips for the project.

Return your response as a JSON object in this EXACT format:
{
  "projectSummary": "Brief 1-2 sentence summary of the project and its scope",
  "toolsRequired": [
    { "name": "Tool Name", "reason": "Why this tool is needed", "category": "Hand Tools|Power Tools|Safety|Materials|Fasteners|Measuring|Other" }
  ],
  "toolsOwned": [
    { "name": "Tool Name from required list", "inventoryMatch": "Matching item name from user's inventory" }
  ],
  "toolsToProcure": [
    { "name": "Tool Name", "estimatedPrice": "$XX-$XX", "priority": "essential|recommended|nice-to-have", "reason": "Brief reason" }
  ],
  "tips": ["Practical tip 1", "Practical tip 2"]
}

Return ONLY raw JSON, no markdown formatting.`;

      const result = await generateWithConfiguredProvider({ prompt });
      const cleaned = result.text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
      let parsed: ProjectAnalysis;
      try {
        parsed = JSON.parse(cleaned) as ProjectAnalysis;
      } catch {
        const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]) as ProjectAnalysis;
        } else {
          throw new Error('AI returned an unexpected response format.');
        }
      }
      setAnalysis(parsed);
    } catch (error) {
      const errMsg = (error as Error).message || 'Unknown error';
      let displayMsg = `❌ Analysis failed: ${errMsg}`;
      if (errMsg.includes('429') || errMsg.includes('quota')) {
        displayMsg = '⚠️ **AI provider capacity/quota reached.** The app auto-falls back across your configured models. Please retry, or review billing/limits for the selected provider.';
      }
      setMessages(prev => [...prev, { role: 'assistant', content: displayMsg, timestamp: new Date() }]);
      setActiveTab('chat');
    } finally {
      setAnalyzing(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const provider = getActiveAIProvider();
    const apiKey = getCurrentProviderApiKey();
    if (!apiKey) {
      setMessages(prev => [...prev,
        { role: 'user', content: text, timestamp: new Date() },
        { role: 'assistant', content: `⚠️ No API key found for **${getProviderLabel(provider)}**. Please go to **Settings** and add one.`, timestamp: new Date() }
      ]);
      setInput('');
      return;
    }

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const contextBlock = analysis
        ? `\n\nCURRENT PROJECT ANALYSIS:\n${JSON.stringify(analysis, null, 2)}`
        : '';

      const systemPrompt = `You are ToolShed AI Assistant — a helpful expert for tool and hardware project planning.
You help users plan projects, identify required tools, and manage their tool inventory.
Be concise, friendly, and practical. Use markdown formatting.

${inventorySummary ? `USER'S INVENTORY:\n${inventorySummary}` : 'No inventory loaded.'}${contextBlock}`;

      const history = messages.map(m => ({
        role: m.role,
        text: m.content,
      }));

      const conversation = history.map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.text}`).join('\n');
      const prompt = `${systemPrompt}\n\nConversation:\n${conversation}\nUser: ${text}\nAssistant:`;

      const result = await generateWithConfiguredProvider({ prompt });
      setMessages(prev => [...prev, { role: 'assistant', content: result.text, timestamp: new Date() }]);
    } catch (error) {
      const errMsg = (error as Error).message || 'Unknown error';
      let displayMsg = `❌ Error: ${errMsg}`;
      if (errMsg.includes('429') || errMsg.includes('quota')) {
        displayMsg = '⚠️ **AI provider capacity/quota reached.** The app auto-falls back across your configured models. Please retry, or review billing/limits for the selected provider.';
      }
      setMessages(prev => [...prev, { role: 'assistant', content: displayMsg, timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  const clearAll = () => {
    setMessages([]);
    setAnalysis(null);
    setProjectDescription('');
  };

  const addAllToShoppingList = async () => {
    if (!analysis || analysis.toolsToProcure.length === 0 || addingToShoppingList) return;
    setAddingToShoppingList(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const items = analysis.toolsToProcure.map(t => ({
        tool_name: t.name,
        estimated_price: t.estimatedPrice || null,
        notes: `${t.priority} - ${t.reason}`,
        user_id: user.id,
      }));

      const { error } = await supabase.from('shopping_list').insert(items);
      if (error) throw error;

      addToast(`Added ${items.length} items to shopping list!`, 'success');
    } catch (e) {
      addToast('Error adding to shopping list: ' + (e as Error).message, 'error');
    } finally {
      setAddingToShoppingList(false);
    }
  };

  const priorityColors = {
    essential: 'bg-red-500/10 text-red-500 border-red-500/20',
    recommended: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    'nice-to-have': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  };

  const exampleProjects = [
    "Build a wooden bookshelf (6ft tall, 3 shelves)",
    "Install a ceiling fan in the living room",
    "Build a raised garden bed (4x8 ft)",
    "Fix a leaking kitchen faucet",
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-56px-88px)]">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2 bg-background">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-base">AI Assistant</h2>
              <p className="text-[10px] text-muted-foreground">
                {inventoryItems.length} tools in inventory
              </p>
            </div>
          </div>
          {(analysis || messages.length > 0) && (
            <button onClick={clearAll} className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-muted/50">
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab('project')}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
              activeTab === 'project' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" /> Project Planner
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-all flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 ${
              activeTab === 'chat' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
            }`}
          >
            <Send className="w-3.5 h-3.5" /> Chat
            {messages.length > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">{messages.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'project' ? (
          <div className="p-4 space-y-4">
            {/* Project Input */}
            {!analysis && (
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Describe your project</label>
                <textarea
                  value={projectDescription}
                  onChange={e => setProjectDescription(e.target.value)}
                  placeholder="E.g., Build a wooden deck in my backyard, approximately 12x16 feet, with stairs and railing..."
                  className="w-full bg-muted/20 border border-border focus:border-primary rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/40 min-h-[120px] resize-none"
                  disabled={analyzing}
                />

                {!projectDescription && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Try an example:</p>
                    <div className="flex flex-wrap gap-2">
                      {exampleProjects.map(p => (
                        <button
                          key={p}
                          onClick={() => setProjectDescription(p)}
                          className="text-[11px] px-3 py-1.5 rounded-full border border-border/50 hover:bg-muted/50 hover:border-primary/30 transition-all text-muted-foreground"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={analyzeProject}
                  disabled={analyzing || !projectDescription.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-600 text-white font-semibold text-sm transition-all disabled:opacity-40 shadow-lg shadow-violet-500/25 flex items-center justify-center gap-2 hover:shadow-xl active:scale-[0.98]"
                >
                  {analyzing ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing project...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Analyze Project &amp; Find Tools</>
                  )}
                </button>
              </div>
            )}

            {/* Analysis Results */}
            {analysis && (
              <div className="space-y-4 pb-20 animate-in fade-in slide-in-from-bottom-4">
                {/* Project Summary */}
                <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-xl p-4">
                  <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-violet-500" /> Project Summary
                  </h3>
                  <p className="text-sm text-foreground/80">{analysis.projectSummary}</p>
                </div>

                {/* Stats Bar */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-muted/30 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-foreground">{analysis.toolsRequired.length}</p>
                    <p className="text-[10px] text-muted-foreground">Tools Needed</p>
                  </div>
                  <div className="bg-emerald-500/10 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-emerald-500">{analysis.toolsOwned.length}</p>
                    <p className="text-[10px] text-muted-foreground">You Own</p>
                  </div>
                  <div className="bg-red-500/10 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-red-500">{analysis.toolsToProcure.length}</p>
                    <p className="text-[10px] text-muted-foreground">To Buy</p>
                  </div>
                </div>

                {/* Tools You Own */}
                {analysis.toolsOwned.length > 0 && (
                  <div className="border border-emerald-500/20 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setShowOwnedDetails(!showOwnedDetails)}
                      className="w-full flex items-center justify-between p-3 bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors"
                    >
                      <h3 className="text-sm font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4" /> Tools You Already Have ({analysis.toolsOwned.length})
                      </h3>
                      {showOwnedDetails ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    {showOwnedDetails && (
                      <div className="divide-y divide-border/30">
                        {analysis.toolsOwned.map((t, i) => (
                          <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                            <div>
                              <p className="font-medium">{t.name}</p>
                              <p className="text-[11px] text-muted-foreground">Matches: {t.inventoryMatch}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tools to Procure */}
                {analysis.toolsToProcure.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-bold flex items-center gap-2 px-1">
                      <ShoppingCart className="w-4 h-4 text-red-500" /> Tools to Procure
                    </h3>
                    <div className="space-y-2">
                      {analysis.toolsToProcure.map((t, i) => (
                        <div key={i} className="bg-card border border-border/50 rounded-xl p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-sm">{t.name}</p>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium uppercase ${priorityColors[t.priority]}`}>
                                  {t.priority}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground">{t.reason}</p>
                            </div>
                            <span className="text-xs font-semibold text-foreground/70 shrink-0 bg-muted/50 px-2 py-1 rounded-lg">
                              {t.estimatedPrice}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add to Shopping List Button */}
                {analysis.toolsToProcure.length > 0 && (
                  <button
                    onClick={addAllToShoppingList}
                    disabled={addingToShoppingList}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-semibold text-sm transition-all disabled:opacity-50 shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 hover:shadow-xl active:scale-[0.98]"
                  >
                    {addingToShoppingList ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</>
                    ) : (
                      <><ShoppingCart className="w-4 h-4" /> Add All {analysis.toolsToProcure.length} to Shopping List</>
                    )}
                  </button>
                )}

                {/* Tips */}
                {analysis.tips && analysis.tips.length > 0 && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 space-y-2">
                    <h3 className="text-sm font-bold flex items-center gap-2 text-amber-600 dark:text-amber-400">
                      💡 Pro Tips
                    </h3>
                    <ul className="space-y-1.5">
                      {analysis.tips.map((tip, i) => (
                        <li key={i} className="text-xs text-foreground/80 flex gap-2">
                          <span className="text-amber-500 shrink-0">•</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setActiveTab('chat'); setInput('Tell me more about the essential tools I need to procure.'); }}
                    className="flex-1 py-2.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Ask Follow-up
                  </button>
                  <button
                    onClick={() => { setAnalysis(null); setProjectDescription(''); }}
                    className="flex-1 py-2.5 rounded-xl border border-border text-xs font-medium hover:bg-muted/50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" /> New Project
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Chat Tab
          <div className="px-4 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center mb-4">
                  <Wrench className="w-7 h-7 text-violet-500" />
                </div>
                <h3 className="text-base font-bold mb-1">Ask me anything</h3>
                <p className="text-xs text-muted-foreground mb-4 max-w-xs">
                  Chat about your tools, projects, or follow up on an analysis.
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-md'
                      : 'bg-muted/50 border border-border/30 text-foreground rounded-bl-md'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="space-y-1">
                        {msg.content.split('\n').map((line, li) => {
                          if (line.startsWith('**') && line.endsWith('**')) {
                            return <p key={li} className="font-bold">{line.replace(/\*\*/g, '')}</p>;
                          }
                          if (line.startsWith('- ') || line.startsWith('* ')) {
                            return <p key={li} className="pl-3">• {line.substring(2)}</p>;
                          }
                          if (line.trim() === '') return <br key={li} />;
                          return <p key={li}>{line.replace(/\*\*(.*?)\*\*/g, '$1')}</p>;
                        })}
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted/50 border border-border/30 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar (Chat tab only) */}
      {activeTab === 'chat' && (
        <div className="shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-xl p-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }}}
              placeholder="Ask about your tools or project..."
              className="flex-1 bg-muted/30 border border-border focus:border-primary rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/50"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="p-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-all shadow-lg shadow-primary/25 disabled:shadow-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
