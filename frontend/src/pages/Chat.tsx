import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Menu,
  Plus,
  Send,
  LogOut,
  User,
  MessageSquare,
  Sparkles,
  StopCircle,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Download,
} from 'lucide-react';
import { useSSEChat, type SSEEvent } from '../utils/sseClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000';

interface DbChat {
  id: string;
  threadId: string;
  title: string;
  messages: { id: string; role: string; content: string; createdAt: string }[];
}

export default function Chat() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [currentMessage, setCurrentMessage] = useState('');
  
  // Explicitly set <string> generic to prevent template literal type error
  const [threadId, setThreadId] = useState<string>(() => crypto.randomUUID());
  
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<DbChat[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const saveChatToBackend = async (newAssistantContent: string) => {
    const token = localStorage.getItem('token');
    if (!token || !activeThreadId) return;

    const activeConv = conversations.find(c => c.threadId === activeThreadId);
    if (!activeConv) return;

    const allMessages = [
      ...activeConv.messages,
      { role: 'assistant', content: newAssistantContent, createdAt: new Date().toISOString(), id: crypto.randomUUID() },
    ];

    try {
      await fetch(`${API_BASE_URL}/api/chat/history/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          threadId: activeThreadId,
          title: activeConv.title,
          messages: allMessages,
        }),
      });
      
      const res = await fetch(`${API_BASE_URL}/api/chat/history/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConversations(await res.json());
    } catch (err) {
      console.error("Failed to save chat", err);
    }
  };

  // Declare callbacks FIRST (before useSSEChat)
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.type === 'token' && event.content) {
      setCurrentMessage((prev) => prev + event.content);
    } else if (event.type === 'end') {
      if (currentMessage && activeThreadId) {
        const finalContent = currentMessage;
        
        // 1. Clear streaming state immediately
        setCurrentMessage('');
        
        // 2. Optimistically add to local state to prevent UI flash
        const newMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: finalContent,
          createdAt: new Date().toISOString(),
        };

        setConversations(prev => prev.map(conv => 
          conv.threadId === activeThreadId
            ? { ...conv, messages: [...conv.messages, newMessage] }
            : conv
        ));

        // 3. Save to backend silently in the background
        saveChatToBackend(finalContent);
      }
    }
  }, [currentMessage, activeThreadId]);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
  }, []);

  const handleComplete = useCallback(() => {}, []);

  // Call useSSEChat after callbacks are declared
  const { isLoading, isStreaming, diagnosticMessage, startStream, stopStream } = useSSEChat({
    token: localStorage.getItem('token') || '',
    threadId,
    onMessage: handleSSEEvent,
    onError: handleError,
    onComplete: handleComplete,
  });

  // Load chats from BACKEND
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/auth');
      return;
    }

    const fetchChats = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/chat/history/list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: DbChat[] = await res.json();
          setConversations(data);
          if (data.length > 0 && !activeThreadId) {
            setActiveThreadId(data[0].threadId);
          }
        }
      } catch (err) {
        console.error("Failed to fetch chats", err);
      }
    };
    fetchChats();
  }, [navigate]);

  const activeConversation = conversations.find((conv) => conv.threadId === activeThreadId);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages, currentMessage, scrollToBottom]);

  const generateTitle = (firstMessage: string) => {
    return firstMessage.length > 40 ? firstMessage.substring(0, 40) + '...' : firstMessage;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading || isStreaming) return;

    const newThreadId = activeThreadId || crypto.randomUUID();
    if (!activeThreadId) {
      setActiveThreadId(newThreadId);
      setThreadId(newThreadId);
    }

    const tempChat: DbChat = activeConversation || {
      id: crypto.randomUUID(),
      threadId: newThreadId,
      title: generateTitle(trimmedInput),
      messages: [],
    };
    
    const updatedMessages = [
      ...tempChat.messages, 
      { role: 'user', content: trimmedInput, createdAt: new Date().toISOString(), id: crypto.randomUUID() }
    ];
    
    setConversations(prev => {
      const others = prev.filter(c => c.threadId !== newThreadId);
      return [{ ...tempChat, messages: updatedMessages }, ...others];
    });

    setInputValue('');
    setCurrentMessage('');
    setError(null);
    startStream(trimmedInput);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/auth');
  };

  const handleNewChat = () => {
    setThreadId(crypto.randomUUID());
    setActiveThreadId(null);
    setCurrentMessage('');
    setError(null);
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const handleSelectConversation = (threadId: string) => {
    setActiveThreadId(threadId);
    setThreadId(crypto.randomUUID());
    setCurrentMessage('');
    if (window.innerWidth < 1024) setSidebarOpen(false);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    setConversations(prev => prev.filter((conv) => conv.threadId !== threadId));
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
    }
  };

  const toggleSidebar = () => {
    if (window.innerWidth < 1024) setSidebarOpen(!sidebarOpen);
    else setSidebarCollapsed(!sidebarCollapsed);
  };

  const exportToPDF = async () => {
    if (!chatContainerRef.current || !activeConversation) return;
    
    const originalOverflow = chatContainerRef.current.style.overflow;
    chatContainerRef.current.style.overflow = 'visible';
    
    const canvas = await html2canvas(chatContainerRef.current, { scale: 2, useCORS: true });
    chatContainerRef.current.style.overflow = originalOverflow;
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`repair-guide-${activeConversation.title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
  };

  const textareaAutoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const displayMessages = activeConversation?.messages || [];

  return (
    <div className="flex h-screen bg-slate-50">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 bg-white border-r border-slate-200 transform transition-all duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${sidebarCollapsed ? 'lg:w-16' : 'lg:w-72'}`}>
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              {!sidebarCollapsed && (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-slate-900">Repair-Fix</h1>
                    <p className="text-xs text-slate-500">AI Assistant</p>
                  </div>
                </div>
              )}
              <button onClick={toggleSidebar} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                {sidebarCollapsed ? <ChevronRight className="w-5 h-5 text-slate-600" /> : <ChevronLeft className="w-5 h-5 text-slate-600" />}
              </button>
            </div>
            {!sidebarCollapsed && (
              <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-primary-600/20">
                <Plus className="w-5 h-5" /> New Chat
              </button>
            )}
          </div>

          {!sidebarCollapsed && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <div key={conv.threadId} onClick={() => handleSelectConversation(conv.threadId)} className={`group flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${activeThreadId === conv.threadId ? 'bg-primary-50 border border-primary-200' : 'bg-slate-50 hover:bg-slate-100'}`}>
                    <MessageSquare className={`w-5 h-5 flex-shrink-0 ${activeThreadId === conv.threadId ? 'text-primary-600' : 'text-slate-400'}`} />
                    <span className="text-sm text-slate-600 truncate flex-1">{conv.title}</span>
                    <button onClick={(e) => handleDeleteConversation(e, conv.threadId)} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all">
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!sidebarCollapsed && (
            <div className="p-4 border-t border-slate-200">
              <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 py-3 px-4 text-slate-600 hover:text-red-600 hover:bg-red-50 font-medium rounded-xl transition-colors">
                <LogOut className="w-5 h-5" /> Sign Out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between gap-4 px-4 py-3 bg-white border-b border-slate-200">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <Menu className="w-6 h-6 text-slate-600" />
            </button>
            <h2 className="font-semibold text-slate-900 truncate">{activeConversation?.title || 'New Chat'}</h2>
          </div>
          {displayMessages.length > 0 && (
            <button onClick={exportToPDF} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors">
              <Download className="w-4 h-4" /> Export PDF
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div ref={chatContainerRef} className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {displayMessages.length === 0 && !currentMessage && (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-10 h-10 text-primary-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Welcome to Repair-Fix Assistant</h3>
                <p className="text-slate-600 max-w-md mx-auto">Ask me anything about device repairs. I'll search official iFixit guides and provide step-by-step instructions.</p>
              </div>
            )}

            {displayMessages.map((message, idx) => (
              <div key={idx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 ${message.role === 'user' ? 'bg-primary-600 text-white rounded-br-md' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'}`}>
                  {message.role === 'assistant' ? (
                    <div className="markdown-content prose prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              </div>
            ))}

            {(isLoading || diagnosticMessage) && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 px-5 py-3 bg-indigo-50 border border-indigo-200 rounded-2xl rounded-bl-md shadow-sm mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse animation-delay-200" />
                    <div className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse animation-delay-400" />
                  </div>
                  {diagnosticMessage && <span className="text-sm font-medium text-indigo-700">{diagnosticMessage}</span>}
                </div>
              </div>
            )}

            {currentMessage && (
              <div className="flex justify-start">
                <div className="max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm">
                  <div className="markdown-content prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentMessage}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="px-5 py-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl">
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-slate-200 bg-white p-4">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={handleSubmit} className="relative">
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={textareaAutoResize}
                    onKeyDown={handleKeyDown}
                    disabled={isLoading || isStreaming}
                    placeholder="Describe your repair issue..."
                    rows={1}
                    className="w-full resize-none py-4 pl-5 pr-14 bg-slate-100 border-0 rounded-2xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed scrollbar-thin"
                    style={{ minHeight: '52px', maxHeight: '200px' }}
                  />
                </div>
                {isStreaming ? (
                  <button type="button" onClick={stopStream} className="flex-shrink-0 p-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl transition-colors shadow-lg shadow-red-600/20">
                    <StopCircle className="w-6 h-6" />
                  </button>
                ) : (
                  <button type="submit" disabled={!inputValue.trim() || isLoading} className="flex-shrink-0 p-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none">
                    <Send className="w-6 h-6" />
                  </button>
                )}
              </div>
            </form>
            <p className="text-xs text-slate-500 text-center mt-3">Press Enter to send, Shift+Enter for new line</p>
          </div>
        </div>
      </main>
    </div>
  );
}