import { analyzeSpot, type PlayerSessionProfile } from './analysis';
import { buildActionOptions } from './engine';
import { buildWeightedRange, type HoleCombo } from './ranges';
import type { ActionOption, ActionType, BotDecisionPlan, HandState } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const aggressiveActions = new Set<ActionType>(['bet', 'raise', 'all-in']);
const rangeCache = new Map<string, Set<string>>();

type PreflopContext =
	| 'button_open'
	| 'big_blind_vs_limp'
	| 'big_blind_vs_open'
	| 'button_vs_iso_raise'
	| 'button_vs_3bet'
	| 'big_blind_vs_4bet';

interface ContextConfig {
	label: string;
	aggressiveRange: string;
	passiveRange?: string;
	jamRange?: string;
	defaultAction: 'aggressive' | 'passive' | 'fold';
	aggressiveRatio: number;
}

const contextConfig: Record<PreflopContext, ContextConfig> = {
	button_open: {
		label: 'Button open',
		aggressiveRange:
			'22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,87s,76s,65s,54s,A2o+,K8o+,Q9o+,J9o+,T9o',
		passiveRange: '22-66,K7o-K2o,Q8o-Q2o,J8o-J2o,T8o-T6o,97o,86o,75o,64o,53o,43o',
		jamRange: 'AA,KK,QQ,AKs,AKo',
		defaultAction: 'fold',
		aggressiveRatio: 0.08
	},
	big_blind_vs_limp: {
		label: 'Big blind versus limp',
		aggressiveRange: '55+,A2s+,K6s+,Q8s+,J8s+,T8s+,98s,87s,76s,A8o+,KTo+,QTo+,JTo',
		passiveRange: '22-44,A2o-A7o,K2s-K5s,Q5s-Q7s,J6s-J7s,T7s,97s,86s,75s,64s',
		jamRange: 'AA,KK,QQ,AKs,AKo',
		defaultAction: 'passive',
		aggressiveRatio: 0.12
	},
	big_blind_vs_open: {
		label: 'Big blind versus open',
		aggressiveRange: '77+,A9s+,KTs+,QTs+,JTs,AQo+,KQo,A5s-A2s',
		passiveRange: '22-66,A2s-A8s,K7s-K9s,Q8s-Q9s,J8s-J9s,T8s+,98s-76s,A8o-AJo,K9o-KQo,QTo+,JTo',
		jamRange: 'QQ+,AKs,AKo',
		defaultAction: 'fold',
		aggressiveRatio: 0.18
	},
	button_vs_iso_raise: {
		label: 'Button facing iso raise',
		aggressiveRange: 'QQ+,AKs,AKo,A5s-A4s',
		passiveRange: '55+,A7s+,KTs+,QTs+,JTs,ATo+,KQo,A5s-A2s',
		jamRange: 'QQ+,AKs,AKo',
		defaultAction: 'fold',
		aggressiveRatio: 0.22
	},
	button_vs_3bet: {
		label: 'Button facing 3-bet',
		aggressiveRange: 'QQ+,AKs,AKo,A5s-A4s',
		passiveRange: '77-JJ,AQs-AJs,KQs,QJs,JTs,AQo',
		jamRange: 'KK+,AKs,AKo',
		defaultAction: 'fold',
		aggressiveRatio: 0.32
	},
	big_blind_vs_4bet: {
		label: 'Big blind facing 4-bet',
		aggressiveRange: 'KK+,AKs,AKo',
		passiveRange: 'JJ-QQ,AQs,AQo',
		jamRange: 'QQ+,AKs,AKo',
		defaultAction: 'fold',
		aggressiveRatio: 0.48
	}
};

function comboKey(cards: HoleCombo) {
	return [...cards].sort().join('');
}

function holeCards(state: HandState): HoleCombo {
	return [state.botCards[0]!, state.botCards[1]!];
}

function holeLabel(cards: HoleCombo) {
	return `${cards[0]} ${cards[1]}`;
}

function matchesRange(cards: HoleCombo, notation: string | undefined) {
	if (!notation) return false;
	let combos = rangeCache.get(notation);
	if (!combos) {
		combos = new Set(buildWeightedRange([{ notation, weight: 1 }]).map((entry) => comboKey(entry.cards)));
		rangeCache.set(notation, combos);
	}
	return combos.has(comboKey(cards));
}

function amountFromOption(option: ActionOption, ratio: number) {
	if (option.minAmount !== undefined && option.maxAmount !== undefined) {
		return clamp(
			Math.round(option.minAmount + (option.maxAmount - option.minAmount) * ratio),
			option.minAmount,
			option.maxAmount
		);
	}
	return option.amount ?? 0;
}

function findOption(options: ActionOption[], type: ActionType) {
	return options.find((option) => option.type === type) ?? null;
}

function detectContext(state: HandState): PreflopContext {
	const actions = state.handActions.filter((action) => action.street === 'preflop');
	const aggressiveCount = actions.filter((action) => aggressiveActions.has(action.type)).length;
	const lastAggressor = [...actions].reverse().find((action) => aggressiveActions.has(action.type))?.actor ?? null;
	const inPosition = state.dealer === 'bot';
	const toCall = Math.max(0, state.currentBet - state.botBetThisStreet);
	if (inPosition) {
		if (!actions.length) return 'button_open';
		if (toCall > 0 && aggressiveCount <= 1 && lastAggressor === 'player') return 'button_vs_iso_raise';
		if (toCall > 0 && lastAggressor === 'player') return 'button_vs_3bet';
		return 'button_open';
	}
	if (toCall <= 0 && aggressiveCount === 0) return 'big_blind_vs_limp';
	if (toCall > 0 && aggressiveCount <= 1 && lastAggressor === 'player') return 'big_blind_vs_open';
	return 'big_blind_vs_4bet';
}

export function buildPreflopDecisionPlan(
	state: HandState,
	profile?: PlayerSessionProfile
): BotDecisionPlan {
	const options = buildActionOptions(state, 'bot');
	const spot = analyzeSpot(state, 'bot');
	const cards = holeCards(state);
	const context = detectContext(state);
	const config = contextConfig[context];
	const aggressiveOption = findOption(options, 'raise') ?? findOption(options, 'bet');
	const passiveOption = findOption(options, 'call') ?? findOption(options, 'check');
	const foldOption = findOption(options, 'fold');
	const jamOption = findOption(options, 'all-in');
	const effectiveStackBb =
		Math.min(state.botStack + state.botBetThisStreet, state.playerStack + state.playerBetThisStreet) /
		state.bigBlind;
	const inAggressiveRange = matchesRange(cards, config.aggressiveRange);
	const inPassiveRange = matchesRange(cards, config.passiveRange);
	const inJamRange = matchesRange(cards, config.jamRange);
	let aggressiveUtility = config.defaultAction === 'aggressive' ? 0.78 : -0.24;
	let passiveUtility = config.defaultAction === 'passive' ? 0.72 : 0.04;
	let foldUtility = config.defaultAction === 'fold' ? 0.66 : -1.05;
	let jamUtility = effectiveStackBb <= 14 ? -0.12 : -1.18;
	if (inAggressiveRange) aggressiveUtility += 1.92;
	if (inPassiveRange) passiveUtility += 1.38;
	if (inJamRange) jamUtility += effectiveStackBb <= 18 ? 2.24 : 0.88;
	if (!inAggressiveRange && !inPassiveRange && config.defaultAction === 'fold') foldUtility += 1.32;
	const strengthPush = (spot.rangeEquity - 0.5) * 3.2 + Math.max(0, spot.blockers.blockerScore) * 0.9;
	aggressiveUtility += strengthPush;
	passiveUtility += spot.rangeEquity * 0.88 + (spot.toCall > 0 ? 0.12 : 0.04);
	foldUtility += (0.48 - spot.rangeEquity) * 2.1 - Math.max(0, spot.blockers.blockerScore) * 0.35;
	jamUtility +=
		spot.rangeEquity * 1.18 +
		Math.max(0, spot.nutAdvantage) * 0.8 +
		(effectiveStackBb <= 12 ? 0.46 : -0.18);
	const profileAdjustments: string[] = [];
	if (profile?.overfolds) {
		aggressiveUtility += 0.18;
		profileAdjustments.push('The player has been overfolding, so the aggressive bucket was weighted up.');
	}
	if (profile?.callingStation) {
		const valueHeavy = spot.rangeEquity > 0.56 || inJamRange;
		aggressiveUtility += valueHeavy ? 0.2 : -0.18;
		passiveUtility += valueHeavy ? 0.06 : 0.14;
		profileAdjustments.push('The player has been overcalling, so thin bluffs were discounted and stronger continues were favored.');
	}
	if (profile?.passive && spot.toCall <= 0) {
		aggressiveUtility += 0.08;
		profileAdjustments.push('The player has been passive, so unopened and checked-to pressure was increased.');
	}
	const planOptions: BotDecisionPlan['options'] = [];
	if (foldOption) {
		planOptions.push({
			type: 'fold',
			amount: 0,
			label: foldOption.label,
			baselineUtility: foldUtility,
			adjustedUtility: foldUtility
		});
	}
	if (passiveOption) {
		planOptions.push({
			type: passiveOption.type,
			amount: passiveOption.amount ?? 0,
			label: passiveOption.label,
			baselineUtility: passiveUtility,
			adjustedUtility: passiveUtility
		});
	}
	if (aggressiveOption) {
		planOptions.push({
			type: aggressiveOption.type,
			amount: amountFromOption(aggressiveOption, config.aggressiveRatio),
			label: aggressiveOption.label,
			baselineUtility: aggressiveUtility,
			adjustedUtility: aggressiveUtility
		});
	}
	if (jamOption) {
		planOptions.push({
			type: 'all-in',
			amount: jamOption.amount ?? 0,
			label: jamOption.label,
			baselineUtility: jamUtility,
			adjustedUtility: jamUtility
		});
	}
	if (!planOptions.length) {
		const fallback = options[0]!;
		planOptions.push({
			type: fallback.type,
			amount: fallback.amount ?? 0,
			label: fallback.label,
			baselineUtility: 0,
			adjustedUtility: 0
		});
	}
	return {
		layer: 'preflop-engine',
		street: state.street,
		situation: config.label,
		summary: `${config.label} policy bucketed ${holeLabel(cards)} using exact-combo range membership and current effective stack depth.`,
		factors: [
			{
				title: 'Combo',
				detail: `${holeLabel(cards)} in ${config.label.toLowerCase()} context.`,
				value: spot.rangeEquity
			},
			{
				title: 'Range equity',
				detail: `Estimated range equity ${Math.round(spot.rangeEquity * 100)}%.`,
				value: spot.rangeEquity
			},
			{
				title: 'Blockers',
				detail: `Blocker score ${Math.round(spot.blockers.blockerScore * 100)}.`,
				value: spot.blockers.blockerScore
			},
			{
				title: 'Stack depth',
				detail: `${effectiveStackBb.toFixed(1)} big blinds effective.`,
				value: effectiveStackBb
			},
			{
				title: 'Bucket match',
				detail: inAggressiveRange
					? 'This combo landed in the aggressive bucket.'
					: inPassiveRange
						? 'This combo landed in the passive continue bucket.'
						: 'This combo fell through to the folding bucket.',
				value: inAggressiveRange ? 1 : inPassiveRange ? 0.5 : 0
			}
		],
		profileAdjustments,
		options: planOptions
	};
}
