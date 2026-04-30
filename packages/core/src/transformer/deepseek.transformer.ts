import { UnifiedChatRequest } from "../types/llm";
import { Transformer } from "../types/transformer";
import { reasoningCacheService } from "../services/reasoning-cache.service";

export class DeepseekTransformer implements Transformer {
  name = "deepseek";

  // Store current request context for response processing
  private currentSessionId: string | undefined;
  private currentIsV4Pro: boolean = false;

  /**
   * Extract session ID from request metadata
   * Uses the same pattern as token-speed plugin: /_session_([a-f0-9-]+)/i
   */
  private extractSessionId(request: UnifiedChatRequest): string | undefined {
    try {
      const userId = (request as any)?.metadata?.user_id;
      if (userId && typeof userId === 'string') {
        const match = userId.match(/_session_([a-f0-9-]+)/i);
        return match ? match[1] : undefined;
      }
    } catch (error) {
      // Ignore extraction errors
    }
    return undefined;
  }

  /**
   * Check if the model is deepseek-v4-pro
   */
  private isV4ProModel(request: UnifiedChatRequest): boolean {
    const model = (request as any).model;
    return typeof model === 'string' && model.includes('deepseek-v4-pro');
  }

  async transformRequestIn(request: UnifiedChatRequest): Promise<UnifiedChatRequest> {
    // Enforce max_tokens limit for DeepSeek
    if (request.max_tokens && request.max_tokens > 8192) {
      request.max_tokens = 8192; // DeepSeek has a max token limit of 8192
    }

    // Store context for response processing
    this.currentSessionId = this.extractSessionId(request);
    this.currentIsV4Pro = this.isV4ProModel(request);

    // DeepSeek V4 Pro: Convert thinking blocks to reasoning_content for multi-turn conversations.
    // AnthropicTransformer puts thinking content into msg.thinking.content (unified format).
    // DeepSeek requires this as reasoning_content on the same message object.
    if (this.currentIsV4Pro && Array.isArray(request.messages)) {
      for (const msg of request.messages as any[]) {
        if (msg.role === 'assistant' && msg.thinking?.content) {
          msg.reasoning_content = msg.thinking.content;
          delete msg.thinking;
        }
      }
    }

    // Fallback: inject from session cache for any assistant message still missing reasoning_content
    if (this.currentSessionId && this.currentIsV4Pro) {
      const cachedReasoning = reasoningCacheService.get(this.currentSessionId);
      if (cachedReasoning && Array.isArray(request.messages)) {
        for (let i = request.messages.length - 1; i >= 0; i--) {
          const msg = request.messages[i] as any;
          if (msg.role === 'assistant' && !msg.reasoning_content) {
            msg.reasoning_content = cachedReasoning;
            break;
          }
        }
      }
    }

    return request;
  }

  async transformResponseOut(response: Response): Promise<Response> {
    // Use session ID and model info from request processing
    const sessionId = this.currentSessionId;
    const isV4ProRequest = this.currentIsV4Pro;

    // Clear context for next request
    this.currentSessionId = undefined;
    this.currentIsV4Pro = false;

    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const jsonResponse = await response.json();
      // Handle non-streaming response: cache reasoning_content and track tool_calls
      if (sessionId && isV4ProRequest && jsonResponse.choices?.[0]?.message?.reasoning_content) {
        const message = jsonResponse.choices[0].message;
        const hasToolCalls = Boolean(message.tool_calls && message.tool_calls.length > 0);
        reasoningCacheService.set(sessionId, message.reasoning_content, hasToolCalls);
      }
      // Handle non-streaming response if needed
      return new Response(JSON.stringify(jsonResponse), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } else if (response.headers.get("Content-Type")?.includes("stream")) {
      if (!response.body) {
        return response;
      }

      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let reasoningContent = "";
      let isReasoningComplete = false;
      let currentResponseHasToolCalls = false; // Track if CURRENT response has tool calls
      let buffer = ""; // 用于缓冲不完整的数据

      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body!.getReader();
          const processBuffer = (
            buffer: string,
            controller: ReadableStreamDefaultController,
            encoder: TextEncoder
          ) => {
            const lines = buffer.split("\n");
            for (const line of lines) {
              if (line.trim()) {
                controller.enqueue(encoder.encode(line + "\n"));
              }
            }
          };

          const processLine = (
            line: string,
            context: {
              controller: ReadableStreamDefaultController;
              encoder: TextEncoder;
              reasoningContent: () => string;
              appendReasoningContent: (content: string) => void;
              isReasoningComplete: () => boolean;
              setReasoningComplete: (val: boolean) => void;
            }
          ) => {
            const { controller, encoder } = context;

            if (
              line.startsWith("data: ") &&
              line.trim() !== "data: [DONE]"
            ) {
              try {
                const data = JSON.parse(line.slice(6));

                // Detect tool calls in the response
                if (data.choices?.[0]?.delta?.tool_calls) {
                  currentResponseHasToolCalls = true;
                }

                // Extract reasoning_content from delta
                if (data.choices?.[0]?.delta?.reasoning_content) {
                  context.appendReasoningContent(
                    data.choices[0].delta.reasoning_content
                  );
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          ...data.choices[0].delta,
                          thinking: {
                            content: data.choices[0].delta.reasoning_content,
                          },
                        },
                      },
                    ],
                  };
                  delete thinkingChunk.choices[0].delta.reasoning_content;
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk
                  )}\n\n`;
                  controller.enqueue(encoder.encode(thinkingLine));
                  return;
                }

                // Reasoning is complete when content OR tool_calls arrive (no more reasoning_content)
                // Must also handle tool_calls case: DeepSeek may skip text content entirely
                if (
                  (data.choices?.[0]?.delta?.content || data.choices?.[0]?.delta?.tool_calls) &&
                  context.reasoningContent() &&
                  !context.isReasoningComplete()
                ) {
                  context.setReasoningComplete(true);
                  const signature = Date.now().toString();

                  // Emit a minimal thinking+signature chunk (no tool_calls/content here).
                  // tool_calls or content will be forwarded in the original data chunk below.
                  const thinkingChunk = {
                    ...data,
                    choices: [
                      {
                        ...data.choices[0],
                        delta: {
                          content: null,
                          thinking: {
                            content: context.reasoningContent(),
                            signature: signature,
                          },
                        },
                      },
                    ],
                  };
                  const thinkingLine = `data: ${JSON.stringify(
                    thinkingChunk
                  )}\n\n`;
                  controller.enqueue(encoder.encode(thinkingLine));
                }

                if (data.choices[0]?.delta?.reasoning_content) {
                  delete data.choices[0].delta.reasoning_content;
                }

                // Send the modified chunk
                if (
                  data.choices?.[0]?.delta &&
                  Object.keys(data.choices[0].delta).length > 0
                ) {
                  if (context.isReasoningComplete()) {
                    data.choices[0].index++;
                  }
                  const modifiedLine = `data: ${JSON.stringify(data)}\n\n`;
                  controller.enqueue(encoder.encode(modifiedLine));
                }
              } catch (e) {
                // If JSON parsing fails, pass through the original line
                controller.enqueue(encoder.encode(line + "\n"));
              }
            } else {
              // Pass through non-data lines (like [DONE])
              controller.enqueue(encoder.encode(line + "\n"));
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // 处理缓冲区中剩余的数据
                if (buffer.trim()) {
                  processBuffer(buffer, controller, encoder);
                }
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;

              // 处理缓冲区中完整的数据行
              const lines = buffer.split("\n");
              buffer = lines.pop() || ""; // 最后一行可能不完整，保留在缓冲区

              for (const line of lines) {
                if (!line.trim()) continue;

                try {
                  processLine(line, {
                    controller,
                    encoder,
                    reasoningContent: () => reasoningContent,
                    appendReasoningContent: (content) =>
                      (reasoningContent += content),
                    isReasoningComplete: () => isReasoningComplete,
                    setReasoningComplete: (val) => (isReasoningComplete = val),
                  });
                } catch (error) {
                  console.error("Error processing line:", line, error);
                  // 如果解析失败，直接传递原始行
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              }
            }

            // Cache reasoning_content and update tool_calls flag when stream ends
            if (sessionId && isV4ProRequest && reasoningContent) {
              reasoningCacheService.set(sessionId, reasoningContent, currentResponseHasToolCalls);
            }
          } catch (error) {
            console.error("Stream error:", error);
            controller.error(error);
          } finally {
            try {
              reader.releaseLock();
            } catch (e) {
              console.error("Error releasing reader lock:", e);
            }
            controller.close();
          }
        },
      });

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "text/plain",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return response;
  }
}
