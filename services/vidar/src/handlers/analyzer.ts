/**
 * AI Analyzer interface for threat analysis.
 *
 * This is a placeholder — implement a concrete provider (e.g. Anthropic, OpenAI)
 * by implementing the Analyzer interface and registering it via setAnalyzer().
 */

export interface AnalysisResult {
	status: string
	message: string
	analysis?: Record<string, unknown>
}

export interface Analyzer {
	analyze(context: { ip?: string; recentEvents?: unknown[] }): Promise<AnalysisResult>
}

class StubAnalyzer implements Analyzer {
	async analyze(): Promise<AnalysisResult> {
		return {
			status: 'unavailable',
			message:
				'AI analysis is not configured. Set AI_ENABLED=true and provide an AI provider implementation.',
		}
	}
}

let currentAnalyzer: Analyzer = new StubAnalyzer()

export function setAnalyzer(analyzer: Analyzer): void {
	currentAnalyzer = analyzer
}

export function getAnalyzer(): Analyzer {
	return currentAnalyzer
}
