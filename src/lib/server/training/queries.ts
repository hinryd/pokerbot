import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { decisionReview, handReview, trainingHand, trainingSession } from '$lib/server/db/schema';
import type { DecisionEvidence, HandReviewDraft, HandState } from '$lib/poker/types';

const parseList = (value: string) => JSON.parse(value) as string[];
const parseEvidence = (value: string) => JSON.parse(value) as DecisionEvidence[];

export const getRecentSessions = async (userId: string) =>
	db
		.select({
			id: trainingSession.id,
			difficulty: trainingSession.difficulty,
			focus: trainingSession.focus,
			status: trainingSession.status,
			overallGrade: trainingSession.overallGrade,
			progressLabel: trainingSession.progressLabel,
			createdAt: trainingSession.createdAt
		})
		.from(trainingSession)
		.where(eq(trainingSession.userId, userId))
		.orderBy(desc(trainingSession.createdAt))
		.limit(6);

export const getSessionById = async (sessionId: string, userId: string) => {
	const [session] = await db
		.select()
		.from(trainingSession)
		.where(and(eq(trainingSession.id, sessionId), eq(trainingSession.userId, userId)))
		.limit(1);

	return session ?? null;
};

export const getCurrentHandForSession = async (sessionId: string, currentHandNumber: number) => {
	const [hand] = await db
		.select()
		.from(trainingHand)
		.where(
			and(eq(trainingHand.sessionId, sessionId), eq(trainingHand.handNumber, currentHandNumber))
		)
		.limit(1);

	if (!hand) return null;
	return { ...hand, state: JSON.parse(hand.stateJson) as HandState };
};

export const getReviewBySession = async (sessionId: string) => {
	const reviews = await db
		.select()
		.from(handReview)
		.where(eq(handReview.sessionId, sessionId))
		.orderBy(asc(handReview.handNumber));

	if (!reviews.length) {
		return [];
	}

	const reviewIds = reviews.map((review) => review.id);

	const decisionRows = await db
		.select()
		.from(decisionReview)
		.where(inArray(decisionReview.handReviewId, reviewIds))
		.orderBy(asc(decisionReview.actionIndex));

	const decisionsByReviewId = new Map<string, HandReviewDraft['decisionReviews']>();
	for (const row of decisionRows) {
		const existing = decisionsByReviewId.get(row.handReviewId) ?? [];
		existing.push({
			actionIndex: row.actionIndex,
			street: row.street as HandReviewDraft['decisionReviews'][number]['street'],
			actor: row.actor as HandReviewDraft['decisionReviews'][number]['actor'],
			chosenAction: row.chosenAction as HandReviewDraft['decisionReviews'][number]['chosenAction'],
			recommendedAction: row.recommendedAction as HandReviewDraft['decisionReviews'][number]['recommendedAction'],
			score: row.score,
			severity: row.severity as HandReviewDraft['decisionReviews'][number]['severity'],
			rationale: row.rationale,
			evidence: parseEvidence(row.evidenceJson)
		});
		decisionsByReviewId.set(row.handReviewId, existing);
	}

	return reviews.map((review) => ({
		id: review.id,
		handNumber: review.handNumber,
		grade: review.grade,
		summary: review.summary,
		strengths: parseList(review.strengthsJson),
		mistakes: parseList(review.mistakesJson),
		recommendedLine: parseList(review.recommendedLineJson),
		thoughtProcess: review.thoughtProcess,
		status: review.status,
		decisionReviews: decisionsByReviewId.get(review.id) ?? []
	}));
};
