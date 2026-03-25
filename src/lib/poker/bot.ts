import { analyzeSpot, type PlayerSessionProfile } from './analysis';
import { buildActionOptions } from './engine';
import type { ActionType, Difficulty, HandState } from './types';

const CONFIG: Record<Difficulty, { aggression: number; pressure: number; trapThreshold: number }> = {
	apprentice: { aggression: 0.5, pressure: 0.45, trapThreshold: 0.9 },
	contender: { aggression: 0.68, pressure: 0.62, trapThreshold: 0.86 },
	shark: { aggression: 0.82, pressure: 0.8, trapThreshold: 0.8 }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function pickSizedAmount(minAmount: number, maxAmount: number, ratio: number) {
	return clamp(Math.round(minAmount + (maxAmount - minAmount) * ratio), minAmount, maxAmount);
}

function pickAggressiveAction(
	state: HandState,
	ratio: number,
	preferAllIn: boolean
): { type: ActionType; amount: number } | null {
	const opts = buildActionOptions(state, 'bot');
	const allIn = opts.find((option) => option.type === 'all-in');
	const raise = opts.find((option) => option.type === 'raise');
	const bet = opts.find((option) => option.type === 'bet');
	if (preferAllIn && allIn?.amount) {
		return { type: 'all-in', amount: allIn.amount };
	}
	if (raise?.minAmount !== undefined && raise?.maxAmount !== undefined) {
		return {
			type: 'raise',
			amount: pickSizedAmount(raise.minAmount, raise.maxAmount, ratio)
		};
	}
	if (bet?.minAmount !== undefined && bet?.maxAmount !== undefined) {
		return {
			type: 'bet',
			amount: pickSizedAmount(bet.minAmount, bet.maxAmount, ratio)
		};
	}
	if (allIn?.amount) {
		return { type: 'all-in', amount: allIn.amount };
	}
	return null;
}

export function botDecide(
	state: HandState,
	difficulty: Difficulty,
	profile?: PlayerSessionProfile
): { type: ActionType; amount: number } {
	const cfg = CONFIG[difficulty];
	const spot = analyzeSpot(state, 'bot');
	const toCall = spot.toCall;
	const rand = Math.random();
	const opts = buildActionOptions(state, 'bot');
	const passiveTarget = profile?.passive ?? false;
	const overfoldTarget = profile?.overfolds ?? false;
	const callingStationTarget = profile?.callingStation ?? false;
	const underbluffTarget = profile?.underbluffsRiver ?? false;
	const exploitBoost = overfoldTarget ? 0.08 : 0;
	const valueBoost = callingStationTarget ? 0.06 : 0;
	const bluffPenalty = underbluffTarget && state.street === 'river' ? 0.06 : 0;
	const aggression = clamp(cfg.aggression + exploitBoost + valueBoost - bluffPenalty, 0.2, 0.95);
	const continueStrength =
		spot.equity * 0.58 +
		spot.strength * 0.2 +
		spot.drawStrength * 0.14 +
		Math.max(0, spot.rangeAdvantage) * 0.08;
	const preferJam =
		spot.equity > cfg.trapThreshold - 0.08 ||
		(spot.equity > 0.76 && spot.spr < 1.35) ||
		(spot.nutAdvantage > 0.12 && spot.spr < 1.9);

	if (toCall <= 0) {
		const wantsValue =
			spot.equity >= 0.57 ||
			spot.nutAdvantage > 0.08 ||
			(spot.strength >= 0.58 && spot.opponentValueShare < 0.68);
		const wantsBluff =
			spot.bluffable &&
			spot.blockers.blockerScore > -0.04 &&
			aggression - rand + Math.max(0, spot.rangeAdvantage) > 0.18;
		if (wantsValue || wantsBluff) {
			const ratio = wantsValue
				? clamp(
					0.38 +
						(spot.equity - 0.5) * 1.15 +
						Math.max(0, spot.nutAdvantage) * 0.8 +
						(callingStationTarget ? 0.18 : 0),
					0.22,
					1
				)
				: clamp(
					0.2 +
						cfg.pressure * 0.38 +
						(overfoldTarget ? 0.16 : 0) +
						Math.max(0, spot.blockers.blockerScore) * 0.28,
					0.16,
					0.78
				);
			const aggressive = pickAggressiveAction(state, ratio, preferJam);
			if (aggressive) return aggressive;
		}
		return { type: 'check', amount: 0 };
	}

	const callCost = Math.min(toCall, state.botStack);
	const foldThreshold = clamp(
		0.31 -
			cfg.pressure * 0.07 +
			(passiveTarget ? 0.03 : 0) +
			(spot.boardTexture === 'wet' ? 0.02 : 0) -
			Math.max(0, spot.blockers.blockerScore) * 0.05,
		0.16,
		0.42
	);
	const raisePressure = clamp(
		aggression +
			(spot.inPosition ? 0.03 : 0) +
			(overfoldTarget ? 0.1 : 0) -
			(callingStationTarget ? 0.05 : 0) +
			Math.max(0, spot.rangeAdvantage) * 0.16,
		0.2,
		0.98
	);
	const allIn = opts.find((option) => option.type === 'all-in');
	const raise = opts.find((option) => option.type === 'raise');

	if (callCost >= state.botStack) {
		if (continueStrength < spot.potOdds + 0.03 && spot.blockers.blockerScore < 0.08) {
			return { type: 'fold', amount: 0 };
		}
		return { type: 'all-in', amount: callCost };
	}

	if (continueStrength + rand * 0.08 < spot.potOdds + foldThreshold) {
		return { type: 'fold', amount: 0 };
	}

	if (
		((spot.equity > 0.64 || spot.nutAdvantage > 0.08) ||
			(spot.bluffable &&
				spot.blockers.blockerScore > 0.05 &&
				(overfoldTarget || spot.opponentValueShare < 0.5) &&
				rand < cfg.pressure * 0.7)) &&
		(raise?.minAmount !== undefined || allIn?.amount)
	) {
		const ratio = spot.equity > 0.78 || spot.nutAdvantage > 0.12
			? clamp(0.68 + (spot.spr < 2 ? 0.18 : 0) + Math.max(0, spot.nutAdvantage) * 0.5, 0.56, 1)
			: clamp(
				0.28 + raisePressure * 0.3 + Math.max(0, spot.blockers.blockerScore) * 0.16,
				0.22,
				0.82
			);
		const aggressive = pickAggressiveAction(state, ratio, preferJam || rand < 0.14);
		if (aggressive) return aggressive;
	}

	if (spot.equity > 0.84 && allIn?.amount && (spot.spr < 1.5 || callingStationTarget)) {
		return { type: 'all-in', amount: allIn.amount };
	}

	return { type: 'call', amount: callCost };
}
