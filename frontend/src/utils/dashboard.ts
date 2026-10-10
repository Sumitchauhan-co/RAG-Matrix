import type { PipelineResult } from '@/types/evaluation';

/**
 * Calculates the top-performing configuration based on metric scores:
 * 1. Average of context_recall, faithfulness, and context_precision.
 * 2. Tiebreaker 1: Faithfulness score.
 * 3. Tiebreaker 2: Lowest latency (latency_ms).
 */
export const getTopConfig = (data: PipelineResult[]): PipelineResult | null => {
	if (!Array.isArray(data) || data.length === 0) return null;

	return (
		[...data].sort((a, b) => {
			// Primary Score: Triad of RAG Context Quality
			const scoreA =
				((a?.metrics?.context_recall ?? 0) +
					(a?.metrics?.faithfulness ?? 0) +
					(a?.metrics?.context_precision ?? 0)) /
				3;

			const scoreB =
				((b?.metrics?.context_recall ?? 0) +
					(b?.metrics?.faithfulness ?? 0) +
					(b?.metrics?.context_precision ?? 0)) /
				3;

			if (scoreB !== scoreA) {
				return scoreB - scoreA;
			}

			// Tiebreaker 1: Faithfulness (Groundedness)
			const faithA = a?.metrics?.faithfulness ?? 0;
			const faithB = b?.metrics?.faithfulness ?? 0;

			if (faithB !== faithA) {
				return faithB - faithA;
			}

			// Tiebreaker 2: Answer Relevancy
			const relA = a?.metrics?.answer_relevancy ?? 0;
			const relB = b?.metrics?.answer_relevancy ?? 0;

			if (relB !== relA) {
				return relB - relA;
			}

			// Tiebreaker 3: Lowest Latency
			const latencyA = a?.latency_ms ?? Infinity;
			const latencyB = b?.latency_ms ?? Infinity;

			return latencyA - latencyB;
		})[0] ?? null
	);
};
