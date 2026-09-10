import { useState, useCallback, useRef } from 'react';

export type SSEEventType = 'diagnostic' | 'token' | 'final' | 'end';

export interface SSEEvent {
  type: SSEEventType;
  message?: string;
  content?: string;
  tokensUsed?: number;
}

export interface UseSSEChatOptions {
  token: string;
  threadId: string;
  onMessage: (event: SSEEvent) => void;
  onError: (error: Error) => void;
  onComplete: () => void;
}

export interface UseSSEChatReturn {
  isLoading: boolean;
  isStreaming: boolean;
  diagnosticMessage: string | null;
  startStream: (message: string) => void;
  stopStream: () => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:10000';

export function useSSEChat(options: UseSSEChatOptions): UseSSEChatReturn {
  const { token, threadId, onMessage, onError, onComplete } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [diagnosticMessage, setDiagnosticMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
    setDiagnosticMessage(null);
  }, []);

  const startStream = useCallback(async (message: string) => {
    stopStream();
    setIsLoading(true);
    setIsStreaming(true);
    setDiagnosticMessage(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          thread_id: threadId,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || '';

        for (const rawMessage of messages) {
          const lines = rawMessage.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              try {
                const event: SSEEvent = JSON.parse(dataStr);

                switch (event.type) {
                  case 'diagnostic':
                    setDiagnosticMessage(event.message || null);
                    break;
                  case 'token':
                    // FIX: Do NOT clear diagnostic here! Let it stay visible while streaming.
                    setIsLoading(false);
                    break;
                  case 'final':
                    break;
                  case 'end':
                    setIsStreaming(false);
                    setIsLoading(false);
                    setDiagnosticMessage(null); // Clear ONLY when stream ends
                    onComplete();
                    break;
                }
                onMessage(event);
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError, 'Raw data:', dataStr);
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      console.error('SSE streaming error:', error);
      setIsLoading(false);
      setIsStreaming(false);
      setDiagnosticMessage(null);
      onError(error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  }, [token, threadId, onMessage, onError, onComplete, stopStream]);

  return {
    isLoading,
    isStreaming,
    diagnosticMessage,
    startStream,
    stopStream,
  };
}