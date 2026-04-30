/**
 * ReasoningCacheService - Session storage for DeepSeek V4 Pro reasoning content
 *
 * DeepSeek V4 Pro requires reasoning_content from previous responses to be sent back
 * in subsequent requests when tool calls are involved. This service caches reasoning
 * content per session along with tool call information.
 */

interface CachedReasoningData {
  content: string;
  hasToolCalls: boolean;
  sessionHadToolCalls: boolean; // Track if session EVER had tool calls
}

class ReasoningCacheService {
  private cache: Map<string, CachedReasoningData> = new Map();

  /**
   * Store reasoning content for a session with tool call information
   */
  set(sessionId: string, reasoningContent: string, hasToolCalls: boolean = false): void {
    const existing = this.cache.get(sessionId);
    const sessionHadToolCalls = existing?.sessionHadToolCalls || hasToolCalls;

    this.cache.set(sessionId, {
      content: reasoningContent,
      hasToolCalls,
      sessionHadToolCalls
    });
  }

  /**
   * Get cached reasoning content for a session
   */
  get(sessionId: string): string | undefined {
    const data = this.cache.get(sessionId);
    return data?.content;
  }

  /**
   * Check if the session ever had tool calls
   */
  sessionHasToolCalls(sessionId: string): boolean {
    const data = this.cache.get(sessionId);
    return data?.sessionHadToolCalls ?? false;
  }

  /**
   * Check if the previous response had tool calls
   */
  hasToolCalls(sessionId: string): boolean {
    const data = this.cache.get(sessionId);
    return data?.hasToolCalls ?? false;
  }

  /**
   * Get full cached data including tool call information
   */
  getData(sessionId: string): CachedReasoningData | undefined {
    return this.cache.get(sessionId);
  }

  /**
   * Clear cached reasoning content for a session
   */
  clear(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  /**
   * Check if session has cached reasoning content
   */
  has(sessionId: string): boolean {
    return this.cache.has(sessionId);
  }

  /**
   * Clear all cached reasoning content
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Get number of cached sessions
   */
  get size(): number {
    return this.cache.size;
  }
}

// Export singleton instance
export const reasoningCacheService = new ReasoningCacheService();
