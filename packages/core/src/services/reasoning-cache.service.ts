/**
 * ReasoningCacheService - Session storage for DeepSeek V4 Pro reasoning content
 *
 * DeepSeek V4 Pro requires reasoning_content from previous responses to be sent back
 * in subsequent requests. This service caches reasoning content per session.
 */

class ReasoningCacheService {
  private cache: Map<string, string> = new Map();

  /**
   * Store reasoning content for a session
   */
  set(sessionId: string, reasoningContent: string): void {
    this.cache.set(sessionId, reasoningContent);
  }

  /**
   * Get cached reasoning content for a session
   */
  get(sessionId: string): string | undefined {
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
