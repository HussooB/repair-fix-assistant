import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Menu,
  Plus,
  Send,
  LogOut,
  User,
  MessageSquare,
  Sparkles,
  StopCircle,
} from 'lucide-react';
import { useSSEChat, type SSEEvent } from '../utils/sseClient';

interface User {
  id: string;
  username: string;
  tokensUsed: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function Chat() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState('');
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load user data
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) {
      navigate('/auth');
      return;
    }

    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, [navigate]);

  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentMessage, scrollToBottom]);

  // Handle SSE events
  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.type === 'token' && event.content) {
      setCurrentMessage(prev => prev + event.content);
    } else if (event.type === 'end') {
      if (currentMessage) {
        setMessages(prev => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: currentMessage,
            timestamp: new Date(),
          },
        ]);
        setCurrentMessage('');
      }
    }
  }, [currentMessage]);

  const handleError = useCallback((err: Error) => {
    setError(err.message);
    setCurrentMessage('');
  }, []);

  const handleComplete = useCallback(() => {
    // Stream completed successfully
  }, []);

  const { isLoading, isStreaming, diagnosticMessage, startStream, stopStream } = useSSEChat({
    token: localStorage.getItem('token') || '',
    threadId,
    onMessage: handleSSEEvent,
    onError: handleError,
    onComplete: handleComplete,
  });

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const trimmedInput = inputValue.trim();
    if (!trimmedInput || isLoading || isStreaming) return;

    // Add user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmedInput,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setCurrentMessage('');
    setError(null);

    // Start streaming
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
    setMessages([]);
    setCurrentMessage('');
    setSidebarOpen(false);
  };

  const textareaAutoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  return (
    <div className="flex h-screen bg-slate-50">
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-slate-900">Repair-Fix</h1>
                <p className="text-xs text-slate-500">AI Assistant</p>
              </div>
            </div>

            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors shadow-lg shadow-primary-600/20"
            >
              <Plus className="w-5 h-5" />
              New Chat
            </button>
          </div>

          {/* User Info */}
          {user && (
            <div className="p-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                  <User className="w-5 h-5 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 truncate">{user.username}</p>
                  <p className="text-xs text-slate-500">
                    {user.tokensUsed.toLocaleString()} tokens used
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Chat History Placeholder */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
                <MessageSquare className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-slate-600">Current Conversation</span>
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <div className="p-4 border-t border-slate-200">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 text-slate-600 hover:text-red-600 hover:bg-red-50 font-medium rounded-xl transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="flex items-center gap-4 px-4 py-3 bg-white border-b border-slate-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <Menu className="w-6 h-6 text-slate-600" />
          </button>
          <h2 className="font-semibold text-slate-900">Chat</h2>
        </header>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {messages.length === 0 && !currentMessage && (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-10 h-10 text-primary-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  Welcome to Repair-Fix Assistant
                </h3>
                <p className="text-slate-600 max-w-md mx-auto">
                  Ask me anything about device repairs. I'll search official iFixit guides and provide step-by-step instructions.
                </p>
              </div>
            )}

            {/* Messages */}
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 ${
                    message.role === 'user'
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'
                  }`}
                >
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

            {/* Streaming Message */}
            {currentMessage && (
              <div className="flex justify-start">
                <div className="max-w-[85%] lg:max-w-[75%] rounded-2xl px-5 py-4 bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm">
                  <div className="markdown-content prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{currentMessage}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            {/* Loading/Diagnostic State */}
            {(isLoading || diagnosticMessage) && !currentMessage && (
              <div className="flex justify-start">
                <div className="flex items-center gap-3 px-5 py-4 bg-white border border-slate-200 rounded-2xl rounded-bl-md shadow-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary-600 rounded-full animate-pulse-slow" />
                    <div className="w-2 h-2 bg-primary-600 rounded-full animate-pulse-slow animation-delay-200" />
                    <div className="w-2 h-2 bg-primary-600 rounded-full animate-pulse-slow animation-delay-400" />
                  </div>
                  {diagnosticMessage && (
                    <span className="text-sm text-slate-600">{diagnosticMessage}</span>
                  )}
                </div>
              </div>
            )}

            {/* Error State */}
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

        {/* Input Area */}
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
                  <button
                    type="button"
                    onClick={stopStream}
                    className="flex-shrink-0 p-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl transition-colors shadow-lg shadow-red-600/20"
                  >
                    <StopCircle className="w-6 h-6" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!inputValue.trim() || isLoading}
                    className="flex-shrink-0 p-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl transition-colors shadow-lg shadow-primary-600/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    <Send className="w-6 h-6" />
                  </button>
                )}
              </div>
            </form>
            <p className="text-xs text-slate-500 text-center mt-3">
              Press Enter to send, Shift+Enter for new line
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
