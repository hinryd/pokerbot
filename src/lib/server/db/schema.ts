import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const trainingSession = sqliteTable('training_session', {
	id: text('id').primaryKey(),
	userId: text('user_id').notNull(),
	totalHands: integer('total_hands').notNull(),
	difficulty: text('difficulty').notNull(),
	focus: text('focus').notNull(),
	startingStack: integer('starting_stack').notNull(),
	bigBlind: integer('big_blind').notNull(),
	status: text('status').notNull(),
	currentHandNumber: integer('current_hand_number').notNull().default(1),
	overallGrade: integer('overall_grade'),
	progressLabel: text('progress_label').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const trainingHand = sqliteTable('training_hand', {
	id: text('id').primaryKey(),
	sessionId: text('session_id').notNull(),
	handNumber: integer('hand_number').notNull(),
	status: text('status').notNull(),
	stateJson: text('state_json').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const handReview = sqliteTable('hand_review', {
	id: text('id').primaryKey(),
	sessionId: text('session_id').notNull(),
	handNumber: integer('hand_number').notNull(),
	grade: integer('grade').notNull(),
	summary: text('summary').notNull(),
	strengthsJson: text('strengths_json').notNull(),
	mistakesJson: text('mistakes_json').notNull(),
	recommendedLineJson: text('recommended_line_json').notNull(),
	thoughtProcess: text('thought_process').notNull(),
	status: text('status').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const decisionReview = sqliteTable('decision_review', {
	id: text('id').primaryKey(),
	handReviewId: text('hand_review_id').notNull(),
	actionIndex: integer('action_index').notNull(),
	street: text('street').notNull(),
	actor: text('actor').notNull(),
	chosenAction: text('chosen_action').notNull(),
	recommendedAction: text('recommended_action').notNull(),
	score: integer('score').notNull(),
	severity: text('severity').notNull(),
	rationale: text('rationale').notNull(),
	evidenceJson: text('evidence_json').notNull()
});

export * from './auth.schema';
