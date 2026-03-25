export const cardRanks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const cardSuits = ['s', 'h', 'd', 'c'] as const;

export type CardRank = (typeof cardRanks)[number];
export type CardSuit = (typeof cardSuits)[number];
export type CardCode = `${CardRank}${CardSuit}`;
export type Seat = 'player' | 'bot';
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type Difficulty = 'apprentice' | 'contender' | 'shark';
export type SessionStatus = 'ready' | 'active' | 'complete';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';
export type ReviewStatus = 'pending' | 'ready';

export interface ActionOption {
	type: ActionType;
	label: string;
	amount?: number;
	minAmount?: number;
	maxAmount?: number;
}

export interface HandAction {
	street: Street;
	actor: Seat;
	type: ActionType;
	amount: number;
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
	playerBetThisStreet: number;
	botBetThisStreet: number;
	actionsThisStreet: number;
	handActions: HandAction[];
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

export interface HandReviewDraft {
	grade: number;
	summary: string;
	strengths: string[];
	mistakes: string[];
	recommendedLine: string[];
	thoughtProcess: string;
	status: ReviewStatus;
	decisionReviews: DecisionReviewDraft[];
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
