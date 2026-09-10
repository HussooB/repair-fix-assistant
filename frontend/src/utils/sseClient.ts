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

/**
 * Custom hook to handle Server-Sent Events streaming from the backend
 */
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
    // Abort any existing stream
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

        // Decode the chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages (separated by double newlines)
        const messages = buffer.split('\n\n');
        buffer = messages.pop() || ''; // Keep incomplete message in buffer

        for (const rawMessage of messages) {
          const lines = rawMessage.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6); // Remove 'data: ' prefix
              
              try {
                const event: SSEEvent = JSON.parse(dataStr);
                
                // Handle different event types
                switch (event.type) {
                  case 'diagnostic':
                    setDiagnosticMessage(event.message || null);
                    break;
                  case 'token':
                    // Clear diagnostic when we start receiving tokens
                    setDiagnosticMessage(null);
                    setIsLoading(false);
                    break;
                  case 'final':
                    // Optional: handle token usage
                    break;
                  case 'end':
                    // Stream completed
                    setIsStreaming(false);
                    setIsLoading(false);
                    setDiagnosticMessage(null);
                    onComplete();
                    break;
                }

                // Always call onMessage so the component can handle all events
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
        // Stream was intentionally aborted
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

/**
 * Alternative: Direct function-based SSE handler for non-hook usage
 */
export async function streamChat(
  message: string,
  threadId: string,
  token: string,
  callbacks: {
    onEvent: (event: SSEEvent) => void;
    onError: (error: Error) => void;
    onComplete: () => void;
  }
): Promise<() => void> {
  const abortController = new AbortController();

  const processStream = async () => {
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
                callbacks.onEvent(event);
                
                if (event.type === 'end') {
                  callbacks.onComplete();
                  return;
                }
              } catch (parseError) {
                console.error('Failed to parse SSE event:', parseError);
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      callbacks.onError(error instanceof Error ? error : new Error('Unknown error occurred'));
    }
  };

  processStream();

  // Return abort function
  return () => abortController.abort();
}

export default useSSEChat;
