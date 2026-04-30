/**
 * Tests for DeepSeek V4 Pro thinking mode / reasoning_content pipeline
 *
 * The pipeline is:
 *   Anthropic request  →  AnthropicTransformer.transformRequestOut  →  UnifiedChatRequest
 *   UnifiedChatRequest →  DeepseekTransformer.transformRequestIn    →  request sent to DeepSeek
 *
 * These tests verify that assistant messages with thinking blocks get
 * reasoning_content injected before reaching the DeepSeek API.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { DeepseekTransformer } from "../deepseek.transformer";
import { AnthropicTransformer } from "../anthropic.transformer";
import type { UnifiedChatRequest } from "../../types/llm";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal Anthropic-format request body (what Claude Code sends) */
function buildAnthropicRequest(messages: any[], model = "deepseek-v4-pro") {
  return {
    model,
    max_tokens: 4096,
    stream: true,
    thinking: { type: "enabled", budget_tokens: 4096 },
    messages,
  };
}

/** Build a unified request directly (skip AnthropicTransformer) */
function buildUnifiedRequest(messages: any[], model = "deepseek-v4-pro"): UnifiedChatRequest {
  return { messages, model, max_tokens: 4096, stream: true };
}

// ─── AnthropicTransformer: extracting thinking blocks ────────────────────────

describe("AnthropicTransformer.transformRequestOut", () => {
  let anthropicTransformer: AnthropicTransformer;

  beforeEach(() => {
    anthropicTransformer = new AnthropicTransformer();
    // AnthropicTransformer needs a logger; inject a no-op one
    (anthropicTransformer as any).logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  });

  test("extracts thinking block from assistant message into msg.thinking", async () => {
    const rawRequest = buildAnthropicRequest([
      { role: "user", content: "design something" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "I need to think carefully...", signature: "sig_abc123" },
          { type: "text", text: "Here is my answer" },
        ],
      },
      { role: "user", content: "implement it" },
    ]);

    const unified = await anthropicTransformer.transformRequestOut(rawRequest);

    const assistantMsg = unified.messages.find((m) => m.role === "assistant") as any;
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.thinking).toBeDefined();
    expect(assistantMsg.thinking.content).toBe("I need to think carefully...");
    expect(assistantMsg.thinking.signature).toBe("sig_abc123");
  });

  test("ignores thinking block without signature", async () => {
    const rawRequest = buildAnthropicRequest([
      { role: "user", content: "question" },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "thinking without sig" }, // no signature
          { type: "text", text: "answer" },
        ],
      },
    ]);

    const unified = await anthropicTransformer.transformRequestOut(rawRequest);
    const assistantMsg = unified.messages.find((m) => m.role === "assistant") as any;
    expect(assistantMsg.thinking).toBeUndefined();
  });

  test("preserves text content alongside thinking", async () => {
    const rawRequest = buildAnthropicRequest([
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "reasoning here", signature: "sig_xyz" },
          { type: "text", text: "response text" },
        ],
      },
    ]);

    const unified = await anthropicTransformer.transformRequestOut(rawRequest);
    const assistantMsg = unified.messages.find((m) => m.role === "assistant") as any;
    expect(assistantMsg.content).toBe("response text");
    expect(assistantMsg.thinking.content).toBe("reasoning here");
  });
});

// ─── DeepseekTransformer: injecting reasoning_content ────────────────────────

describe("DeepseekTransformer.transformRequestIn", () => {
  let deepseekTransformer: DeepseekTransformer;

  beforeEach(() => {
    deepseekTransformer = new DeepseekTransformer();
  });

  test("converts msg.thinking.content to reasoning_content for deepseek-v4-pro", async () => {
    const unified = buildUnifiedRequest([
      { role: "user", content: "question" },
      {
        role: "assistant",
        content: "Here is the answer",
        thinking: { content: "My reasoning process", signature: "sig_123" },
      } as any,
      { role: "user", content: "follow up" },
    ]);

    const result = await deepseekTransformer.transformRequestIn(unified);

    const assistantMsg = result.messages.find((m) => m.role === "assistant") as any;
    expect(assistantMsg.reasoning_content).toBe("My reasoning process");
    expect(assistantMsg.thinking).toBeUndefined(); // should be cleaned up
  });

  test("does NOT inject reasoning_content for non-v4-pro models", async () => {
    const unified = buildUnifiedRequest(
      [
        {
          role: "assistant",
          content: "answer",
          thinking: { content: "reasoning", signature: "sig" },
        } as any,
      ],
      "deepseek-chat" // NOT v4-pro
    );

    const result = await deepseekTransformer.transformRequestIn(unified);
    const assistantMsg = result.messages.find((m) => m.role === "assistant") as any;
    expect(assistantMsg.reasoning_content).toBeUndefined();
  });

  test("handles multiple assistant messages in history", async () => {
    const unified = buildUnifiedRequest([
      { role: "user", content: "q1" },
      {
        role: "assistant",
        content: "a1",
        thinking: { content: "reasoning for a1", signature: "sig_1" },
      } as any,
      { role: "user", content: "q2" },
      {
        role: "assistant",
        content: "a2",
        thinking: { content: "reasoning for a2", signature: "sig_2" },
      } as any,
      { role: "user", content: "q3" },
    ]);

    const result = await deepseekTransformer.transformRequestIn(unified);
    const assistantMsgs = result.messages.filter((m) => m.role === "assistant") as any[];

    expect(assistantMsgs[0].reasoning_content).toBe("reasoning for a1");
    expect(assistantMsgs[1].reasoning_content).toBe("reasoning for a2");
  });

  test("skips assistant messages without thinking block", async () => {
    const unified = buildUnifiedRequest([
      { role: "assistant", content: "normal answer without thinking" },
    ]);

    const result = await deepseekTransformer.transformRequestIn(unified);
    const assistantMsg = result.messages.find((m) => m.role === "assistant") as any;
    expect(assistantMsg.reasoning_content).toBeUndefined();
  });

  test("caps max_tokens at 8192", async () => {
    const unified = buildUnifiedRequest([], "deepseek-v4-pro");
    unified.max_tokens = 16000;

    const result = await deepseekTransformer.transformRequestIn(unified);
    expect(result.max_tokens).toBe(8192);
  });
});

// ─── Full pipeline: Anthropic format → reasoning_content ─────────────────────

describe("Full pipeline: AnthropicRequest → reasoning_content in DeepSeek request", () => {
  let anthropicTransformer: AnthropicTransformer;
  let deepseekTransformer: DeepseekTransformer;

  beforeEach(() => {
    anthropicTransformer = new AnthropicTransformer();
    (anthropicTransformer as any).logger = {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    deepseekTransformer = new DeepseekTransformer();
  });

  test("multi-turn: previous assistant thinking block becomes reasoning_content", async () => {
    // This is what Claude Code sends on a second turn (after DeepSeek's thinking response)
    const anthropicRequest = buildAnthropicRequest([
      { role: "user", content: "Please design a system" },
      {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "Let me think about the architecture...",
            signature: "ts_1234567890",
          },
          {
            type: "text",
            text: "Here is the design",
          },
        ],
      },
      { role: "user", content: "Now implement it" },
    ]);

    // Step 1: AnthropicTransformer converts to unified
    const unified = await anthropicTransformer.transformRequestOut(anthropicRequest);

    // Verify thinking was extracted
    const assistantInUnified = unified.messages.find((m) => m.role === "assistant") as any;
    expect(assistantInUnified?.thinking?.content).toBe("Let me think about the architecture...");

    // Step 2: DeepseekTransformer injects reasoning_content
    const deepseekRequest = await deepseekTransformer.transformRequestIn(unified);

    const assistantInDeepSeek = deepseekRequest.messages.find((m) => m.role === "assistant") as any;
    expect(assistantInDeepSeek.reasoning_content).toBe("Let me think about the architecture...");
    expect(assistantInDeepSeek.thinking).toBeUndefined();
    expect(assistantInDeepSeek.content).toBe("Here is the design");
  });

  test("multi-turn with tool_use: both thinking and tool_calls preserved", async () => {
    const anthropicRequest = buildAnthropicRequest([
      { role: "user", content: "search and analyze" },
      {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "I should use the search tool",
            signature: "ts_999",
          },
          {
            type: "tool_use",
            id: "tool_1",
            name: "search",
            input: { query: "test" },
          },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool_1", content: "results" }],
      },
    ]);

    const unified = await anthropicTransformer.transformRequestOut(anthropicRequest);
    const deepseekRequest = await deepseekTransformer.transformRequestIn(unified);

    const assistantMsg = deepseekRequest.messages.find((m) => m.role === "assistant") as any;
    expect(assistantMsg.reasoning_content).toBe("I should use the search tool");
    expect(assistantMsg.tool_calls).toBeDefined();
    expect(assistantMsg.tool_calls[0].function.name).toBe("search");
  });
});

// ─── transformResponseOut: signature emitted for tool_calls responses ─────────

describe("DeepseekTransformer.transformResponseOut streaming", () => {
  let deepseekTransformer: DeepseekTransformer;

  beforeEach(() => {
    deepseekTransformer = new DeepseekTransformer();
  });

  /** Build a fake SSE streaming Response from an array of delta objects */
  function makeStreamResponse(deltas: object[]): Response {
    const lines = deltas.map((d) => `data: ${JSON.stringify(d)}\n\n`).join("");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  /** Collect all SSE events from a Response stream */
  async function collectSSEEvents(response: Response): Promise<any[]> {
    const text = await response.text();
    const events: any[] = [];
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ") && line.trim() !== "data: [DONE]") {
        try { events.push(JSON.parse(line.slice(6))); } catch { /* skip */ }
      }
    }
    return events;
  }

  test("emits thinking+signature chunk when reasoning ends with tool_calls (no content)", async () => {
    const fakeResponse = makeStreamResponse([
      { choices: [{ delta: { reasoning_content: "I will search for files" }, finish_reason: null }] },
      { choices: [{ delta: { reasoning_content: " using the tool" }, finish_reason: null }] },
      // No content chunk — tool_calls arrive directly after reasoning
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "bash", arguments: '{"cmd":"ls"}' } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ]);

    const transformed = await deepseekTransformer.transformResponseOut(fakeResponse);
    const events = await collectSSEEvents(transformed);

    // Must have a thinking chunk with both content and signature
    const thinkingEvent = events.find(
      (e) => e.choices?.[0]?.delta?.thinking?.signature
    );
    expect(thinkingEvent).toBeDefined();
    expect(thinkingEvent.choices[0].delta.thinking.content).toBe(
      "I will search for files using the tool"
    );
    expect(thinkingEvent.choices[0].delta.thinking.signature).toBeTruthy();

    // tool_calls must still be forwarded
    const toolCallEvent = events.find((e) => e.choices?.[0]?.delta?.tool_calls);
    expect(toolCallEvent).toBeDefined();
  });

  test("emits thinking+signature chunk when reasoning ends with content (original behavior)", async () => {
    const fakeResponse = makeStreamResponse([
      { choices: [{ delta: { reasoning_content: "My reasoning" }, finish_reason: null }] },
      { choices: [{ delta: { content: "My answer" }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]);

    const transformed = await deepseekTransformer.transformResponseOut(fakeResponse);
    const events = await collectSSEEvents(transformed);

    const thinkingEvent = events.find(
      (e) => e.choices?.[0]?.delta?.thinking?.signature
    );
    expect(thinkingEvent).toBeDefined();
    expect(thinkingEvent.choices[0].delta.thinking.content).toBe("My reasoning");

    // Content chunk must also be forwarded
    const contentEvent = events.find((e) => e.choices?.[0]?.delta?.content === "My answer");
    expect(contentEvent).toBeDefined();
  });

  test("emits thinking+signature chunk when stream ends with only reasoning (no content/tool_calls)", async () => {
    const fakeResponse = makeStreamResponse([
      { choices: [{ delta: { reasoning_content: "Only reasoning" }, finish_reason: null }] },
      { choices: [{ delta: { reasoning_content: " no conclusion" }, finish_reason: null }] },
      // Stream ends directly after reasoning without content or tool_calls
      { choices: [{ delta: {}, finish_reason: "stop" }] },
    ]);

    const transformed = await deepseekTransformer.transformResponseOut(fakeResponse);
    const events = await collectSSEEvents(transformed);

    // Must have a thinking chunk with both content and signature
    const thinkingEvent = events.find(
      (e) => e.choices?.[0]?.delta?.thinking?.signature
    );
    expect(thinkingEvent).toBeDefined();
    expect(thinkingEvent.choices[0].delta.thinking.content).toBe(
      "Only reasoning no conclusion"
    );
    expect(thinkingEvent.choices[0].delta.thinking.signature).toBeTruthy();
  });
});
