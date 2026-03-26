import { analyzeSpot, type PlayerSessionProfile } from './analysis';
import { buildActionOptions } from './engine';
import type { ActionOption, ActionType, BotDecisionPlan, HandState } from './types';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

export function buildPostflopBaselineDecisionPlan(
	state: HandState,
	profile?: PlayerSessionProfile
): BotDecisionPlan {
	const options = buildActionOptions(state, 'bot');
	const spot = analyzeSpot(state, 'bot');
	const aggressiveOption = findOption(options, 'raise') ?? findOption(options, 'bet');
	const passiveOption = findOption(options, 'call') ?? findOption(options, 'check');
	const foldOption = findOption(options, 'fold');
	const jamOption = findOption(options, 'all-in');
	const continueStrength =
		spot.equity * 0.54 +
		spot.strength * 0.18 +
		spot.drawStrength * 0.14 +
		Math.max(0, spot.rangeAdvantage) * 0.08 +
		Math.max(0, spot.nutAdvantage) * 0.06;
	const valuePressure =
		spot.equity * 1.65 +
		spot.strength * 0.7 +
		Math.max(0, spot.nutAdvantage) * 1.35 +
		(spot.overpair || spot.topPair ? 0.22 : 0);
	const bluffPressure =
		(spot.bluffable ? 0.82 : -0.36) +
		Math.max(0, spot.blockers.blockerScore) * 1.45 +
		Math.max(0, spot.rangeAdvantage) * 1.2 +
		spot.opponentBluffShare * 0.24 -
		spot.opponentValueShare * 0.48;
	const showdownValue =
		spot.strength * 0.84 +
		spot.equity * 0.62 +
		(spot.topPair || spot.overpair ? 0.16 : 0) -
		spot.drawStrength * 0.18;
	let aggressiveUtility =
		spot.toCall > 0
			? Math.max(valuePressure, bluffPressure) + (continueStrength - spot.potOdds) * 1.25
			: Math.max(valuePressure, bluffPressure) + spot.drawStrength * 0.45;
	let passiveUtility =
		spot.toCall > 0
			? continueStrength * 1.58 + showdownValue * 0.46 - spot.potOdds * 1.4
			: showdownValue * 1.18 - Math.max(0, valuePressure - 1.12) * 0.34;
	let foldUtility =
		(spot.potOdds - continueStrength) * 2.9 +
		spot.opponentValueShare * 0.8 -
		spot.opponentBluffShare * 0.42;
	let jamUtility =
		valuePressure +
		Math.max(0, spot.nutAdvantage) * 0.85 +
		(spot.spr < 1.5 ? 0.48 : -0.42) +
		(spot.equity > 0.78 ? 0.5 : 0);
	const profileAdjustments: string[] = [];
	if (profile?.overfolds) {
		aggressiveUtility += 0.24;
		profileAdjustments.push('The player has overfolded to pressure, so the baseline leaned further into betting and raising.');
	}
	if (profile?.callingStation) {
		aggressiveUtility += valuePressure > bluffPressure ? 0.18 : -0.26;
		passiveUtility += 0.12;
		profileAdjustments.push('The player has overcalled, so bluffs were discounted and value-heavy lines were preferred.');
	}
	if (profile?.underbluffsRiver && state.street === 'river') {
		passiveUtility += 0.08;
		foldUtility += 0.1;
		profileAdjustments.push('The player underbluffs river, so bluff-catching and disciplined folds were weighted up slightly.');
	}
	if (profile?.passive && spot.toCall <= 0) {
		aggressiveUtility += 0.12;
		profileAdjustments.push('The player has been passive, so checked-to pressure was increased.');
	}
	const sizeRatio =
		valuePressure >= bluffPressure
			? clamp(
				0.34 +
					(state.street === 'river' ? 0.18 : state.street === 'turn' ? 0.1 : 0) +
					Math.max(0, spot.nutAdvantage) * 0.55 +
					(spot.spr < 2 ? 0.14 : 0),
				0.18,
				1
			)
			: clamp(
				0.2 +
					(state.street === 'turn' ? 0.08 : state.street === 'river' ? 0.14 : 0) +
					Math.max(0, spot.blockers.blockerScore) * 0.26 +
					(profile?.overfolds ? 0.12 : 0),
				0.14,
				0.78
			);
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
			amount: amountFromOption(aggressiveOption, sizeRatio),
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
		layer: 'postflop-baseline',
		street: state.street,
		situation: `${state.street} baseline`,
		summary: `${state.street} baseline weighed pressure, range leverage, blocker quality, and price before selecting a mixed response.`,
		factors: [
			{
				title: 'Continue strength',
				detail: `Continuation score ${Math.round(continueStrength * 100)} against a ${Math.round(spot.potOdds * 100)} required equity threshold.`,
				value: continueStrength
			},
			{
				title: 'Value pressure',
				detail: `Value pressure ${Math.round(valuePressure * 100)} with ${Math.round(spot.equity * 100)} equity and ${Math.round(spot.nutAdvantage * 100)} nut advantage.`,
				value: valuePressure
			},
			{
				title: 'Bluff pressure',
				detail: `Bluff pressure ${Math.round(bluffPressure * 100)} from blocker leverage ${Math.round(spot.blockers.blockerScore * 100)} and range advantage ${Math.round(spot.rangeAdvantage * 100)}.`,
				value: bluffPressure
			},
			{
				title: 'Showdown value',
				detail: `Showdown value ${Math.round(showdownValue * 100)} with ${spot.madeCategory} on a ${spot.boardTexture} board.`,
				value: showdownValue
			},
			{
				title: 'SPR',
				detail: `SPR ${spot.spr.toFixed(2)} guides leverage and jam frequency.`,
				value: spot.spr
			}
		],
		profileAdjustments,
		options: planOptions
	};
}
