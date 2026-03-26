export const cardRanks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const cardSuits = ['s', 'h', 'd', 'c'] as const;

export type CardRank = (typeof cardRanks)[number];
export type CardSuit = (typeof cardSuits)[number];
export type CardCode = `${CardRank}${CardSuit}`;
export type Seat = 'player' | 'bot';
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type Difficulty = 'fish' | 'rec' | 'amateur' | 'pro';
export type SessionStatus = 'ready' | 'active' | 'complete';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';
export type ReviewStatus = 'pending' | 'ready';
export type BotDecisionLayer = 'preflop-engine' | 'postflop-baseline';

export interface ActionOption {
	type: ActionType;
	label: string;
	amount?: number;
	minAmount?: number;
	maxAmount?: number;
}

export interface BotDecisionFactor {
	title: string;
	detail: string;
	value: number;
}

export interface BayesianPosterior {
	alpha: number;
	beta: number;
	mean: number;
	samples: number;
	confidence: number;
}

export interface OpponentModelSnapshot {
	version: string;
	observedHands: number;
	observedDecisions: number;
	proactiveAggression: BayesianPosterior;
	foldToPressure: BayesianPosterior;
	callVsPressure: BayesianPosterior;
	raiseVsPressure: BayesianPosterior;
	riverBluffing: BayesianPosterior;
	tags: string[];
	summary: string;
	profile: {
		preflopOpenRate: number;
		aggressionRate: number;
		foldToPressureRate: number;
		callVsPressureRate: number;
		raiseVsPressureRate: number;
		riverBluffRate: number;
		overfolds: boolean;
		callingStation: boolean;
		passive: boolean;
		underbluffsRiver: boolean;
	};
}

export interface BotExploitAdjustment {
	title: string;
	detail: string;
	targetAction: ActionType;
	delta: number;
	budgetShare: number;
}

export interface BotDecisionDebug {
	temperature: number;
	exploitBudget: number;
	exploitUsed: number;
	posteriorConfidence: number;
	baselineBestUtility: number;
	adjustedBestUtility: number;
}

export interface BotPolicyOptionDraft {
	type: ActionType;
	amount: number;
	label: string;
	baselineUtility: number;
	adjustedUtility: number;
}

export interface BotPolicyOption extends BotPolicyOptionDraft {
	probability: number;
}

export interface BotDecisionPlan {
	layer: BotDecisionLayer;
	street: Street;
	situation: string;
	summary: string;
	factors: BotDecisionFactor[];
	profileAdjustments: string[];
	opponentSnapshot?: OpponentModelSnapshot | null;
	exploitAdjustments?: BotExploitAdjustment[];
	debug?: Partial<BotDecisionDebug>;
	options: BotPolicyOptionDraft[];
}

export interface BotDecisionTrace {
	version: string;
	layer: BotDecisionLayer;
	street: Street;
	difficulty: Difficulty;
	situation: string;
	summary: string;
	factors: BotDecisionFactor[];
	profileAdjustments: string[];
	opponentSnapshot: OpponentModelSnapshot | null;
	exploitAdjustments: BotExploitAdjustment[];
	baselineAction: ActionType;
	chosenAction: ActionType;
	chosenAmount: number;
	confidence: number;
	debug: BotDecisionDebug;
	options: BotPolicyOption[];
}

export interface BotActionDecision {
	type: ActionType;
	amount: number;
	trace: BotDecisionTrace;
}

export interface HandAction {
	street: Street;
	actor: Seat;
	type: ActionType;
	amount: number;
	decisionTrace?: BotDecisionTrace;
}

export type HandOutcome = 'player_wins' | 'bot_wins' | 'split';

export interface HandState {
	handNumber: number;
	dealer: Seat;
	toAct: Seat;
	street: Street;
	playerCards: CardCode[];
	botCards: CardCode[];
	boardCards: CardCode[];
	allBoardCards: CardCode[];
	pot: number;
	playerStack: number;
	botStack: number;
	smallBlind: number;
	bigBlind: number;
	currentBet: number;
	lastFullRaiseSize: number;
	playerBetThisStreet: number;
	botBetThisStreet: number;
	actionsThisStreet: number;
	handActions: HandAction[];
	lastBotDecision: BotDecisionTrace | null;
	botDecisionHistory: BotDecisionTrace[];
	opponentModel: OpponentModelSnapshot | null;
	outcome: HandOutcome | null;
	actionOptions: ActionOption[];
}

export interface DecisionEvidence {
	title: string;
	detail: string;
}

export interface DecisionReviewDraft {
	actionIndex: number;
	street: Street;
	actor: Seat;
	chosenAction: ActionType;
	recommendedAction: ActionType;
	score: number;
	severity: 'info' | 'warning' | 'critical';
	rationale: string;
	evidence: DecisionEvidence[];
}

export interface BotReviewDraft {
	actionIndex: number;
	street: Street;
	chosenAction: ActionType;
	amount: number;
	trace: BotDecisionTrace;
}

export interface HandReviewDraft {
	grade: number;
	summary: string;
	strengths: string[];
	mistakes: string[];
	recommendedLine: string[];
	thoughtProcess: string;
	status: ReviewStatus;
	decisionReviews: DecisionReviewDraft[];
	botDecisions: BotReviewDraft[];
	opponentModel: OpponentModelSnapshot | null;
}

export interface SessionCreationInput {
	difficulty: Difficulty;
	startingStack: number;
	bigBlind: number;
}

export interface DifficultyOption {
	value: Difficulty;
	label: string;
	summary: string;
	adaptation: string;
}
