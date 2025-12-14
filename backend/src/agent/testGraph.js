import "dotenv/config";
import { repairGraph } from "./graph.js";

async function test() {
  const thread_id = "test_thread_1";

  const config = { configurable: { thread_id } };

  console.log("Starting stream for query: Tesla Model 3 door handle not working");

  try {
    for await (const chunk of repairGraph.stream(
      { userQuery: "Tesla Model 3 door handle not working" },
      { ...config, streamMode: "updates" }
    )) {
      console.log("Chunk:", JSON.stringify(chunk, null, 2));
    }
  } catch (err) {
    console.error("Stream error:", err.message);
  }

  const finalState = await repairGraph.getState(config);
  console.log("FINAL RESULT:");
  console.log(JSON.stringify(finalState.values.finalAnswer, null, 2));
}

test();