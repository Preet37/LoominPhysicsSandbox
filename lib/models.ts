/**
 * Single source of truth for NVIDIA NIM model identifiers.
 *
 * These names were previously copy-pasted across half a dozen routes, and when
 * `meta/llama-3.1-405b-instruct` stopped being served every one of those routes
 * broke in the quietest possible way: the request burned its full timeout, threw,
 * and silently demoted to a weaker Groq fallback. Output got worse with no error
 * anywhere. Centralising them means a dead model is one edit, and the test suite
 * can live-probe every identifier the app actually uses.
 */

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

/**
 * Heavy generation cascade, strongest first. Callers should race these rather
 * than trying them serially — a stalled leader otherwise wastes its whole
 * timeout before the next candidate starts.
 */
export const NVIDIA_CODE_CHAIN = [
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3-nano-30b-a3b",
] as const;

/** Best available model for long-form reasoning (wiki articles, notes, design). */
export const NVIDIA_THINKING = NVIDIA_CODE_CHAIN[0];

/** Small, cheap, quick — classification, short answers, extraction. */
export const NVIDIA_FAST = "nvidia/llama-3.1-nemotron-nano-8b-v1";

/**
 * Known-dead identifiers, kept so config drift fails loudly instead of silently.
 * - meta/llama-3.1-405b-instruct: 404, never served on this endpoint.
 * - nvidia/llama-3.1-nemotron-ultra-253b-v1: appears in /v1/models but its
 *   backing function is undeployed, so real calls 404. Presence in the model
 *   listing is therefore not sufficient evidence that a model works.
 * - nvidia/nemotron-3-ultra-550b-a55b: same trap, worse failure. Still listed in
 *   /v1/models, but real calls never respond at all — no status, no error, the
 *   socket just hangs until the caller's timeout fires. As the leader of
 *   NVIDIA_CODE_CHAIN it made every High Quality request burn its full 90s and
 *   then 500, which is what broke notes generation in production.
 */
export const RETIRED_NVIDIA_MODELS: readonly string[] = [
  "meta/llama-3.1-405b-instruct",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
  "nvidia/nemotron-3-ultra-550b-a55b",
];

/**
 * Nemotron reasoning traces are billed against max_tokens but arrive on
 * `reasoning_content`, which every SSE collector here discards — so leaving
 * thinking enabled truncates real output while making requests ~8x slower.
 *
 * This has to be spread into the request body, NOT passed as
 * `chat_template_kwargs`. The nemotron-3 family rejects
 * `chat_template_kwargs: { thinking: false }` by emitting an endless run of
 * <unk> tokens instead of text — a silent corruption, since the response is
 * still 200 and still streams. Verified against the live endpoint:
 *   reasoning_effort:"none" → clean content, no reasoning_content
 *   reasoning_effort:"low"  → content plus a discarded reasoning_content
 *   chat_template_kwargs    → <unk> garbage
 */
export const NVIDIA_NO_THINKING = { reasoning_effort: "none" } as const;

export function assertLiveModels(scope: string, models: readonly string[]): void {
  const dead = models.filter((m) => RETIRED_NVIDIA_MODELS.includes(m));
  if (dead.length > 0) {
    console.error(
      `[${scope}] FATAL CONFIG: retired NVIDIA model(s) in use: ${dead.join(", ")}. ` +
      `These 404 and will silently demote this route to its weaker fallback.`,
    );
  }
}
