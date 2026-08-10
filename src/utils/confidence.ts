/**
 * Confidence score display banding per MASTER_PRD.md §5.1 / §5.3.
 *
 * NOTE: This is a *display* concern, distinct from the backend's FAISS
 * classification thresholds (0.60 / 0.75) that decide PENDING REVIEW vs
 * CONFIRMED vs discarded (see CheckList.md §1.6). A match can be
 * status=CONFIRMED at 0.76 confidence and still render in amber here,
 * because the visual banding communicates "how sure was the model",
 * while match.status communicates "what did an operator/pipeline decide".
 *
 * --accent-alert (red) is reserved for "new unreviewed match" state only
 * (see §5.1 token comment) and must never be used to color a confidence
 * value directly.
 */

export type ConfidenceTier = 'high' | 'borderline' | 'low';

export function getConfidenceTier(confidence: number): ConfidenceTier {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.6) return 'borderline';
  return 'low';
}

export function getConfidenceColor(confidence: number): string {
  const tier = getConfidenceTier(confidence);
  if (tier === 'high') return 'var(--accent-signal)';
  if (tier === 'borderline') return 'var(--accent-amber)';
  return 'var(--text-secondary)'; // dimmed, per spec
}

export function getConfidenceLabel(confidence: number): string | null {
  return getConfidenceTier(confidence) === 'low' ? 'Low confidence' : null;
}