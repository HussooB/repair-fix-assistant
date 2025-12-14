import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

/**
 * LangGraph State
 * JS version uses Annotation() directly
 */
export const AgentState = Annotation.Root({
  // Chat history
  messages: MessagesAnnotation,

  // User input
  userQuery: Annotation(),

  // Tool outputs
  ifixitResult: Annotation(),
  webResult: Annotation(),

  // Final response
  finalAnswer: Annotation(),

  // Which source was used
  source: Annotation(),
});
