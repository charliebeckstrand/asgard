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

const currentAnalyzer: Analyzer = new StubAnalyzer()

export function getAnalyzer(): Analyzer {
	return currentAnalyzer
}
