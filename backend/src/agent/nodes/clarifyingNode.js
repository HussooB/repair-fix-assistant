export async function clarifyingNode(state) {
  return {
    ...state,
    finalAnswer: "I'm not sure I understood your device/problem. Could you clarify?",
    source: "agent",
  };
}