import { Annotation, MessagesAnnotation } from "@langchain/langgraph";

export const AgentState = Annotation.Root({
  // Chat history
  messages: MessagesAnnotation,

  // Raw user input
  userQuery: Annotation(),

  // Parsed intent (REQUIRED)
  intent: Annotation(),

  // Tool outputs
  ifixitResult: Annotation(),
  webResult: Annotation(),

  // Final response
  finalAnswer: Annotation(),

  // Which source was used
  source: Annotation(),
});
