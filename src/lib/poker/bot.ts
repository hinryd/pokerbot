import type { PlayerSessionProfile } from './analysis';
import { applyConstrainedExploit } from './exploit-layer';
import { buildPostflopBaselineDecisionPlan } from './postflop-policy';
import { buildPreflopDecisionPlan } from './preflop-policy';
import type {
	ActionType,
	BotActionDecision,
	BotDecisionPlan,
	BotDecisionTrace,
	Difficulty,
	HandState,
	OpponentModelSnapshot
} from './types';

const RUNTIME: Record<
	Difficulty,
	{
		temperature: number;
		aggressiveBias: number;
		passiveBias: number;
		allInDiscipline: number;
	}
> = {
	fish: { temperature: 1.3, aggressiveBias: -0.08, passiveBias: 0.14, allInDiscipline: -0.1 },
	rec: { temperature: 1.08, aggressiveBias: 0.03, passiveBias: 0.05, allInDiscipline: -0.02 },
	amateur: { temperature: 0.9, aggressiveBias: 0.06, passiveBias: -0.02, allInDiscipline: 0.04 },
	pro: { temperature: 0.74, aggressiveBias: 0.12, passiveBias: -0.06, allInDiscipline: 0.1 }
};

const aggressiveActions = new Set<ActionType>(['bet', 'raise']);
const passiveActions = new Set<ActionType>(['check', 'call']);

function softmax(values: number[], temperature: number) {
	const scaled = values.map((value) => value / temperature);
	const maxValue = Math.max(...scaled);
	const exponents = scaled.map((value) => Math.exp(value - maxValue));
	const total = exponents.reduce((sum, value) => sum + value, 0);
	return exponents.map((value) => (total > 0 ? value / total : 1 / exponents.length));
}

function chooseIndex(probabilities: number[]) {
	let target = Math.random();
	for (let index = 0; index < probabilities.length; index += 1) {
		target -= probabilities[index]!;
		if (target <= 0) return index;
	}
	return Math.max(0, probabilities.length - 1);
}

function applyProfileStyle(plan: BotDecisionPlan, difficulty: Difficulty): BotDecisionPlan {
	const cfg = RUNTIME[difficulty] ?? RUNTIME.amateur;
	const options = plan.options.map((option) => {
		let delta = 0;
		if (aggressiveActions.has(option.type)) {
			delta += cfg.aggressiveBias;
		}
		if (passiveActions.has(option.type)) {
			delta += cfg.passiveBias;
		}
		if (option.type === 'all-in') {
			delta += cfg.allInDiscipline;
		}
		if (plan.street === 'preflop' && option.type === 'raise') {
			delta += cfg.aggressiveBias * 0.55;
		}
		if (plan.street === 'river' && option.type === 'call') {
			delta += cfg.passiveBias * 0.4;
		}
		return {
			...option,
			adjustedUtility: option.adjustedUtility + delta
		};
	});
	return {
		...plan,
		options,
		profileAdjustments: [
			...plan.profileAdjustments,
			`style:${difficulty} temp=${cfg.temperature.toFixed(2)} agg=${cfg.aggressiveBias.toFixed(2)} passive=${cfg.passiveBias.toFixed(2)}`
		]
	};
}

function buildTrace(
	plan: BotDecisionPlan,
	difficulty: Difficulty,
	temperature: number,
	baselineAction: BotDecisionTrace['baselineAction'],
	chosenAction: BotDecisionTrace['chosenAction'],
	chosenAmount: number,
	confidence: number,
	options: BotDecisionTrace['options']
): BotDecisionTrace {
	return {
		version: 'policy-v2',
		layer: plan.layer,
		street: plan.street,
		difficulty,
		situation: plan.situation,
		summary: plan.summary,
		factors: plan.factors,
		profileAdjustments: plan.profileAdjustments,
		opponentSnapshot: plan.opponentSnapshot ?? null,
		exploitAdjustments: plan.exploitAdjustments ?? [],
		baselineAction,
		chosenAction,
		chosenAmount,
		confidence,
		debug: {
			temperature,
			exploitBudget: plan.debug?.exploitBudget ?? 0,
			exploitUsed: plan.debug?.exploitUsed ?? 0,
			posteriorConfidence: plan.debug?.posteriorConfidence ?? 0,
			baselineBestUtility: plan.debug?.baselineBestUtility ?? Math.max(...options.map((option) => option.baselineUtility)),
			adjustedBestUtility: plan.debug?.adjustedBestUtility ?? Math.max(...options.map((option) => option.adjustedUtility))
		},
		options
	};
}

function finalizeDecision(plan: BotDecisionPlan, difficulty: Difficulty): BotActionDecision {
	const temperature = (RUNTIME[difficulty] ?? RUNTIME.amateur).temperature;
	const probabilities = softmax(
		plan.options.map((option) => option.adjustedUtility),
		temperature
	);
	const options = plan.options.map((option, index) => ({
		...option,
		probability: probabilities[index] ?? 0
	}));
	const baselineOption =
		options.reduce((best, option) =>
			option.adjustedUtility > best.adjustedUtility ? option : best
		) ?? options[0]!;
	const chosenOption = options[chooseIndex(probabilities)] ?? baselineOption;
	return {
		type: chosenOption.type,
		amount: chosenOption.amount,
		trace: buildTrace(
			plan,
			difficulty,
			temperature,
			baselineOption.type,
			chosenOption.type,
			chosenOption.amount,
			Math.max(...probabilities),
			options
		)
	};
}

export function botDecide(
	state: HandState,
	difficulty: Difficulty,
	profile?: PlayerSessionProfile,
	opponentSnapshot?: OpponentModelSnapshot | null
): BotActionDecision {
	const baselinePlan =
		state.street === 'preflop'
			? buildPreflopDecisionPlan(state, profile)
			: buildPostflopBaselineDecisionPlan(state, profile);
	const stylePlan = applyProfileStyle(baselinePlan, difficulty);
	const exploitPlan = applyConstrainedExploit(stylePlan, state, difficulty, opponentSnapshot ?? null);
	return finalizeDecision(exploitPlan, difficulty);
}
