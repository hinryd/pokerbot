import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { env } from '$env/dynamic/private';
import type { HandReviewDraft } from '$lib/poker/types';

const buildPrompt = (review: HandReviewDraft) => {
	const evidence = review.decisionReviews
		.map((decision) => {
			const details = decision.evidence.map((item) => `${item.title}: ${item.detail}`).join('\n');
			return `${decision.street.toUpperCase()}\nChosen: ${decision.chosenAction}\nRecommended: ${decision.recommendedAction}\nScore: ${decision.score}\nRationale: ${decision.rationale}\n${details}`;
		})
		.join('\n\n');

	return `You are a poker coach explaining a reviewed heads-up No-Limit Hold'em hand. Keep the tone precise, practical, and grounded in the supplied review evidence. Do not invent hidden cards, solver outputs, or math that is not provided.\n\nHand summary: ${review.summary}\nStrengths: ${review.strengths.join('; ')}\nMistakes: ${review.mistakes.join('; ')}\nRecommended line: ${review.recommendedLine.join(' -> ')}\nBase thought process: ${review.thoughtProcess}\n\nDecision evidence:\n${evidence}\n\nReturn a concise coaching explanation in 3 short paragraphs followed by a short bullet list titled Next adjustments.`;
};

export const generateHandCoaching = async (review: HandReviewDraft) => {
	if (!env.OPENROUTER_API_KEY) {
		return review.thoughtProcess;
	}

	const provider = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
	const model = env.OPENROUTER_MODEL || 'openrouter/auto';
	const result = await generateText({
		model: provider.chat(model),
		prompt: buildPrompt(review)
	});

	return result.text;
};
