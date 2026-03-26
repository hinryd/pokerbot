import { and, asc, desc, eq, inArray, lte, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { decisionReview, handReview, trainingHand, trainingSession } from '$lib/server/db/schema';
import { deriveLastFullRaiseSize } from '$lib/poker/engine';
import type { DecisionEvidence, HandReviewDraft, HandState } from '$lib/poker/types';

const parseList = (value: string) => JSON.parse(value) as string[];
const parseEvidence = (value: string) => JSON.parse(value) as DecisionEvidence[];
const parseListSafe = (value: string) => {
	try {
		return JSON.parse(value) as string[];
	} catch {
		return [];
	}
};
const parseHandState = (value: string) => {
	const state = JSON.parse(value) as HandState;
	return {
		...state,
		lastBotDecision: state.lastBotDecision ?? null,
		botDecisionHistory: state.botDecisionHistory ?? [],
		opponentModel: state.opponentModel ?? null,
		lastFullRaiseSize: state.lastFullRaiseSize ?? deriveLastFullRaiseSize(state)
	} satisfies HandState;
};

type PokerProfileSnapshot = {
	totalSessions: number;
	completedSessions: number;
	reviewedHands: number;
	averageGrade: number | null;
	strengths: string[];
	weaknesses: string[];
	tendencies: string[];
	tags: string[];
};

const PROFILE_CACHE_TTL_MS = 60_000;
const pokerProfileCache = new Map<string, { expiresAt: number; snapshot: PokerProfileSnapshot }>();

const topRepeatedLine = (items: string[]) => {
	if (!items.length) return null;
	const countByLine = new Map<string, { text: string; count: number }>();
	for (const item of items) {
		const text = item.trim();
		if (!text) continue;
		const key = text.toLowerCase();
		const existing = countByLine.get(key);
		if (existing) {
			existing.count += 1;
			continue;
		}
		countByLine.set(key, { text, count: 1 });
	}
	let top: { text: string; count: number } | null = null;
	for (const entry of countByLine.values()) {
		if (!top || entry.count > top.count) {
			top = entry;
		}
	}
	return top?.text ?? null;
};

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
	return { ...hand, state: parseHandState(hand.stateJson) };
};

export const getHandStatesForSession = async (sessionId: string, upToHandNumber?: number) => {
	const rows = await db
		.select({ handNumber: trainingHand.handNumber, stateJson: trainingHand.stateJson })
		.from(trainingHand)
		.where(
			upToHandNumber === undefined
				? eq(trainingHand.sessionId, sessionId)
				: and(eq(trainingHand.sessionId, sessionId), lte(trainingHand.handNumber, upToHandNumber))
		)
		.orderBy(asc(trainingHand.handNumber));

	return rows.map((row) => ({ handNumber: row.handNumber, state: parseHandState(row.stateJson) }));
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
	const handRows = await db
		.select({ handNumber: trainingHand.handNumber, stateJson: trainingHand.stateJson })
		.from(trainingHand)
		.where(eq(trainingHand.sessionId, sessionId))
		.orderBy(asc(trainingHand.handNumber));

	const decisionsByReviewId = new Map<string, HandReviewDraft['decisionReviews']>();
	const handStateByHandNumber = new Map(
		handRows.map((row) => [row.handNumber, parseHandState(row.stateJson)])
	);
	for (const row of decisionRows) {
		const existing = decisionsByReviewId.get(row.handReviewId) ?? [];
		existing.push({
			actionIndex: row.actionIndex,
			street: row.street as HandReviewDraft['decisionReviews'][number]['street'],
			actor: row.actor as HandReviewDraft['decisionReviews'][number]['actor'],
			chosenAction: row.chosenAction as HandReviewDraft['decisionReviews'][number]['chosenAction'],
			recommendedAction:
				row.recommendedAction as HandReviewDraft['decisionReviews'][number]['recommendedAction'],
			score: row.score,
			severity: row.severity as HandReviewDraft['decisionReviews'][number]['severity'],
			rationale: row.rationale,
			evidence: parseEvidence(row.evidenceJson)
		});
		decisionsByReviewId.set(row.handReviewId, existing);
	}

	return reviews.map((review) => {
		const state = handStateByHandNumber.get(review.handNumber) ?? null;
		return {
			id: review.id,
			handNumber: review.handNumber,
			grade: review.grade,
			summary: review.summary,
			strengths: parseList(review.strengthsJson),
			mistakes: parseList(review.mistakesJson),
			recommendedLine: parseList(review.recommendedLineJson),
			thoughtProcess: review.thoughtProcess,
			status: review.status,
			handContext: state
				? {
						playerCards: state.playerCards,
						botCards: state.botCards,
						boardCards: state.boardCards,
						street: state.street,
						outcome: state.outcome
					}
				: null,
			decisionReviews: decisionsByReviewId.get(review.id) ?? [],
			botDecisions:
				state?.handActions
					.map((action, actionIndex) => ({ action, actionIndex }))
					.filter(({ action }) => action.actor === 'bot' && action.decisionTrace)
					.map(({ action, actionIndex }) => ({
						actionIndex,
						street: action.street,
						chosenAction: action.type,
						amount: action.amount,
						trace: action.decisionTrace!
					})) ?? [],
			opponentModel: state?.opponentModel ?? null
		};
	});
};

export const getPokerProfileSnapshot = async (userId: string) => {
	const cached = pokerProfileCache.get(userId);
	if (cached && cached.expiresAt > Date.now()) {
		return cached.snapshot;
	}

	const [sessions, reviewRows, reviewStatsRows] = await Promise.all([
		db
			.select({ id: trainingSession.id, status: trainingSession.status })
			.from(trainingSession)
			.where(eq(trainingSession.userId, userId)),
		db
			.select({
				id: handReview.id,
				strengthsJson: handReview.strengthsJson,
				mistakesJson: handReview.mistakesJson
			})
			.from(handReview)
			.innerJoin(trainingSession, eq(trainingSession.id, handReview.sessionId))
			.where(eq(trainingSession.userId, userId))
			.orderBy(desc(handReview.createdAt))
			.limit(400),
		db
			.select({
				reviewedHands: sql<number>`count(*)`,
				averageGrade: sql<number | null>`round(avg(${handReview.grade}))`
			})
			.from(handReview)
			.innerJoin(trainingSession, eq(trainingSession.id, handReview.sessionId))
			.where(eq(trainingSession.userId, userId))
	]);

	if (!sessions.length) {
		const empty: PokerProfileSnapshot = {
			totalSessions: 0,
			completedSessions: 0,
			reviewedHands: 0,
			averageGrade: null,
			strengths: ['Play a few sessions to generate a personalized profile.'],
			weaknesses: ['Not enough hands yet for reliable leak detection.'],
			tendencies: ['No tendency signals yet.'],
			tags: []
		};
		pokerProfileCache.set(userId, {
			expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
			snapshot: empty
		});
		return empty;
	}

	const reviewStats = reviewStatsRows[0] ?? { reviewedHands: 0, averageGrade: null };
	const reviewedHands = reviewStats.reviewedHands ?? 0;
	const averageGrade = reviewStats.averageGrade ?? null;

	if (reviewedHands === 0) {
		const minimal: PokerProfileSnapshot = {
			totalSessions: sessions.length,
			completedSessions: sessions.filter((session) => session.status === 'complete').length,
			reviewedHands: 0,
			averageGrade: null,
			strengths: ['Play a few sessions to generate a personalized profile.'],
			weaknesses: ['Not enough reviewed hands yet for reliable leak detection.'],
			tendencies: ['No tendency signals yet.'],
			tags: []
		};
		pokerProfileCache.set(userId, {
			expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
			snapshot: minimal
		});
		return minimal;
	}

	const reviewIds = reviewRows.map((row) => row.id);
	const decisionRows = reviewIds.length
		? await db
				.select({
					street: decisionReview.street,
					chosenAction: decisionReview.chosenAction,
					severity: decisionReview.severity
				})
				.from(decisionReview)
				.where(inArray(decisionReview.handReviewId, reviewIds))
		: [];

	const isAggressive = (action: string) =>
		action === 'bet' || action === 'raise' || action === 'all-in';
	const totalDecisions = decisionRows.length;
	const aggressiveCount = decisionRows.filter((row) => isAggressive(row.chosenAction)).length;
	const foldCount = decisionRows.filter((row) => row.chosenAction === 'fold').length;
	const callCount = decisionRows.filter((row) => row.chosenAction === 'call').length;
	const raiseCount = decisionRows.filter((row) => row.chosenAction === 'raise').length;
	const criticalCount = decisionRows.filter((row) => row.severity === 'critical').length;
	const warningCount = decisionRows.filter((row) => row.severity === 'warning').length;

	const aggressionRate = totalDecisions ? aggressiveCount / totalDecisions : 0;
	const foldRate = totalDecisions ? foldCount / totalDecisions : 0;
	const callRate = totalDecisions ? callCount / totalDecisions : 0;
	const raiseRate = totalDecisions ? raiseCount / totalDecisions : 0;
	const criticalRate = totalDecisions ? criticalCount / totalDecisions : 0;
	const warningRate = totalDecisions ? warningCount / totalDecisions : 0;

	const streets: Array<'flop' | 'turn' | 'river'> = ['flop', 'turn', 'river'];
	const streetAggression = streets
		.map((street) => {
			const rows = decisionRows.filter((row) => row.street === street);
			if (!rows.length) return null;
			const streetAgg = rows.filter((row) => isAggressive(row.chosenAction)).length;
			return `${street}: ${Math.round((streetAgg / rows.length) * 100)}%`;
		})
		.filter((line): line is string => line !== null);

	const tags: string[] = [];
	if (aggressionRate < 0.24 && totalDecisions >= 8) tags.push('passive');
	if (foldRate > 0.42 && totalDecisions >= 8) tags.push('overfolding');
	if (callRate > 0.52 && aggressionRate < 0.3 && totalDecisions >= 8) tags.push('calling-station');
	if (aggressionRate > 0.5 && totalDecisions >= 8) tags.push('high-pressure');

	const strengths: string[] = [];
	if (averageGrade !== null && averageGrade >= 75) {
		strengths.push(`Average decision grade is ${averageGrade}, showing strong baseline execution.`);
	}
	if (criticalRate <= 0.14 && totalDecisions >= 8) {
		strengths.push('Critical mistakes are infrequent, indicating stable decision discipline.');
	}
	if (aggressionRate >= 0.28 && aggressionRate <= 0.48 && totalDecisions >= 8) {
		strengths.push('Aggression mix is balanced enough to apply pressure without over-forcing.');
	}
	if (raiseRate >= 0.12 && totalDecisions >= 8) {
		strengths.push('Raise frequency is active enough to include credible pressure lines.');
	}

	const weaknesses: string[] = [];
	if (criticalRate > 0.24 && totalDecisions >= 8) {
		weaknesses.push('Critical mistakes are frequent enough to materially lower your long-run EV.');
	}
	if (aggressionRate < 0.2 && totalDecisions >= 8) {
		weaknesses.push('Overall aggression is low, which lets opponents realize equity too cheaply.');
	}
	if (foldRate > 0.45 && totalDecisions >= 8) {
		weaknesses.push('Fold frequency is high, suggesting overfolding in too many defended nodes.');
	}
	if (callRate > 0.6 && aggressionRate < 0.3 && totalDecisions >= 8) {
		weaknesses.push(
			'Call-heavy responses with low aggression can make your range easier to pressure.'
		);
	}
	if (warningRate > 0.35 && totalDecisions >= 8) {
		weaknesses.push('Warning-level mistakes are common and point to recurring tactical leaks.');
	}
	if (averageGrade !== null && averageGrade < 65) {
		weaknesses.push(
			`Average decision grade is ${averageGrade}, indicating recurring strategic leaks.`
		);
	}

	const tendencyStrengths = reviewRows.flatMap((row) => parseListSafe(row.strengthsJson));
	const tendencyMistakes = reviewRows.flatMap((row) => parseListSafe(row.mistakesJson));
	const topStrength = topRepeatedLine(tendencyStrengths);
	const topMistake = topRepeatedLine(tendencyMistakes);

	const tendencies = [
		`Action mix: fold ${Math.round(foldRate * 100)}% / call ${Math.round(callRate * 100)}% / raise ${Math.round(raiseRate * 100)}% / total aggression ${Math.round(aggressionRate * 100)}%`,
		`Review severity: critical ${Math.round(criticalRate * 100)}% · warning ${Math.round(warningRate * 100)}%`
	];
	if (streetAggression.length) {
		tendencies.push(`Street aggression: ${streetAggression.join(' · ')}`);
	}

	if (tags.length) {
		tendencies.push(`Profile tags: ${tags.join(', ')}`);
	}
	if (topMistake) {
		tendencies.push(`Most repeated leak note: ${topMistake}`);
	}
	if (topStrength) {
		tendencies.push(`Most repeated strength note: ${topStrength}`);
	}

	const snapshot: PokerProfileSnapshot = {
		totalSessions: sessions.length,
		completedSessions: sessions.filter((session) => session.status === 'complete').length,
		reviewedHands,
		averageGrade,
		strengths: strengths.length
			? strengths
			: ['No clear strength signal yet — collect a few more reviewed hands.'],
		weaknesses: weaknesses.length
			? weaknesses
			: ['No major recurring leak detected yet from the sampled hands.'],
		tendencies,
		tags
	};

	pokerProfileCache.set(userId, {
		expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
		snapshot
	});

	return snapshot;
};
