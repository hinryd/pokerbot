import { analyzePlayerSessionProfile, analyzeSpot, buildHandTimeline } from './analysis';
import type { ActionType, BayesianPosterior, HandState, OpponentModelSnapshot } from './types';

const aggressiveActions = new Set<ActionType>(['bet', 'raise', 'all-in']);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function createPosterior(successes: number, trials: number, alpha = 2, beta = 2): BayesianPosterior {
	const posteriorAlpha = alpha + successes;
	const posteriorBeta = beta + Math.max(0, trials - successes);
	const samples = Math.max(0, trials);
	return {
		alpha: posteriorAlpha,
		beta: posteriorBeta,
		mean: posteriorAlpha / (posteriorAlpha + posteriorBeta),
		samples,
		confidence: clamp(samples / (samples + 6), 0, 1)
	};
}

function buildTags(snapshot: Omit<OpponentModelSnapshot, 'tags' | 'summary'>) {
	const tags: string[] = [];
	if (snapshot.foldToPressure.mean > 0.56 && snapshot.foldToPressure.confidence > 0.35) tags.push('overfolds');
	if (
		snapshot.callVsPressure.mean > 0.5 &&
		snapshot.foldToPressure.mean < 0.34 &&
		snapshot.callVsPressure.confidence > 0.35
	) {
		tags.push('calling-station');
	}
	if (
		snapshot.proactiveAggression.mean < 0.34 &&
		snapshot.proactiveAggression.confidence > 0.35
	) {
		tags.push('passive');
	}
	if (snapshot.riverBluffing.mean < 0.3 && snapshot.riverBluffing.confidence > 0.3) {
		tags.push('underbluffs-river');
	}
	if (snapshot.raiseVsPressure.mean > 0.28 && snapshot.raiseVsPressure.confidence > 0.35) {
		tags.push('fights-back');
	}
	return tags;
}

function buildSummary(tags: string[], snapshot: Omit<OpponentModelSnapshot, 'tags' | 'summary'>) {
	if (!snapshot.observedDecisions) return 'Posterior is still near the prior because the player has shown very few decisions.';
	if (!tags.length) return 'Posterior is currently balanced, so the exploit layer should stay close to baseline strategy.';
	return `Posterior flags ${tags.join(', ')} from ${snapshot.observedDecisions} observed player decisions across ${snapshot.observedHands} hands.`;
}

export function analyzeOpponentModel(states: HandState[]): OpponentModelSnapshot {
	const relevantStates = states.filter((state) => state.handActions.length > 0 || state.outcome !== null);
	const profile = analyzePlayerSessionProfile(relevantStates);
	let observedDecisions = 0;
	let proactiveOpportunities = 0;
	let proactiveAggression = 0;
	let pressureOpportunities = 0;
	let foldsToPressure = 0;
	let callsVsPressure = 0;
	let raisesVsPressure = 0;
	let riverBluffOpportunities = 0;
	let riverBluffs = 0;
	for (const state of relevantStates) {
		for (const entry of buildHandTimeline(state)) {
			if (entry.action.actor !== 'player') continue;
			observedDecisions += 1;
			const spot = analyzeSpot(entry.before, 'player');
			const aggressive = aggressiveActions.has(entry.action.type);
			if (entry.before.street !== 'showdown' && spot.toCall <= 0) {
				proactiveOpportunities += 1;
				if (aggressive) proactiveAggression += 1;
			}
			if (spot.toCall > 0) {
				pressureOpportunities += 1;
				if (entry.action.type === 'fold') foldsToPressure += 1;
				if (entry.action.type === 'call') callsVsPressure += 1;
				if (aggressive) raisesVsPressure += 1;
			}
			if (entry.before.street === 'river' && spot.toCall <= 0 && spot.bluffable) {
				riverBluffOpportunities += 1;
				if (aggressive) riverBluffs += 1;
			}
		}
	}
	const snapshotBase = {
		version: 'posterior-v1',
		observedHands: relevantStates.length,
		observedDecisions,
		proactiveAggression: createPosterior(proactiveAggression, proactiveOpportunities),
		foldToPressure: createPosterior(foldsToPressure, pressureOpportunities),
		callVsPressure: createPosterior(callsVsPressure, pressureOpportunities),
		raiseVsPressure: createPosterior(raisesVsPressure, pressureOpportunities),
		riverBluffing: createPosterior(riverBluffs, riverBluffOpportunities),
		profile: {
			preflopOpenRate: profile.preflopOpenRate,
			aggressionRate: profile.aggressionRate,
			foldToPressureRate: profile.foldToPressureRate,
			callVsPressureRate: profile.callVsPressureRate,
			raiseVsPressureRate: profile.raiseVsPressureRate,
			riverBluffRate: profile.riverBluffRate,
			overfolds: profile.overfolds,
			callingStation: profile.callingStation,
			passive: profile.passive,
			underbluffsRiver: profile.underbluffsRiver
		}
	} satisfies Omit<OpponentModelSnapshot, 'tags' | 'summary'>;
	const tags = buildTags(snapshotBase);
	return {
		...snapshotBase,
		tags,
		summary: buildSummary(tags, snapshotBase)
	};
}
