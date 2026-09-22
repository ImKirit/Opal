export type AnswerMode = 'choice' | 'typed' | 'mixed';
export type MatchKind = 'solo' | 'bot' | 'unranked' | 'ranked' | 'private';
export type BotDifficulty = 'leicht' | 'mittel' | 'schwer';
export type SoloMode = 'classic' | 'survival';
/** gemischt = keine Vorliebe, sonst werden Fragen dieser Stufe bevorzugt */
export type Difficulty = 'gemischt' | 'leicht' | 'mittel' | 'schwer';
export type OptionCount = 3 | 4;
export type TimeLimit = 'kurz' | 'normal' | 'lang';
export type ContinueMode = 'button' | 'auto';

export interface User {
  id: string;
  name: string;
  avatar: string | null;
  guest: boolean;
  rating: number;
  peakRating: number;
  rankedGames: number;
}

export interface Stats {
  duels: number;
  wins: number;
  draws: number;
  losses: number;
  rankedPlayed: number;
  rankedWins: number;
  trainingPlayed: number;
  correct: number;
  wrong: number;
  accuracy: number | null;
  avgMs: number | null;
  bestStreak: number;
  survivalBest: number;
}

export interface PackSection {
  id: string;
  key: string;
  name: string;
  count: number;
  typedCount: number;
}

export interface Pack {
  id: string;
  name: string;
  desc: string;
  icon: string;
  hue: number;
  sections: PackSection[];
}

export interface AppConfig {
  version: string;
  discordEnabled: boolean;
  allowGuests: boolean;
  rankedSections: string[];
}

export interface MatchPlayer {
  id: string;
  name: string;
  avatar: string | null;
  isBot: boolean;
  guest: boolean;
  rating: number | null;
  connected: boolean;
  left: boolean;
}

export interface ScoreEntry {
  score: number;
  correct: number;
  wrong: number;
  streak: number;
  lives: number | null;
}

export type Scores = Record<string, ScoreEntry>;

export interface MatchInfo {
  id: string;
  kind: MatchKind;
  variant: string | null;
  answerMode: AnswerMode;
  soloMode: SoloMode | null;
  difficulty?: Difficulty;
  optionCount?: OptionCount;
  timeLimit?: TimeLimit;
  continueMode?: ContinueMode;
  total: number | null;
  players: MatchPlayer[];
}

export interface QuestionPayload {
  index: number;
  number: number;
  total: number | null;
  suddenDeath: boolean;
  text: string;
  mode: 'choice' | 'typed';
  options: string[] | null;
  pack: string;
  section: string;
  hue: number;
  difficulty: number;
  duration: number;
  remainingMs: number;
  scores: Scores;
  resolved?: boolean;
  locked?: boolean;
  skipped?: boolean;
}

export interface RevealPayload {
  index: number;
  winnerId: string | null;
  ms: number | null;
  choice: number | null;
  text: string | null;
  answer: string;
  correctIndex: number;
  fact: string | null;
  /** IDs derer, die uebersprungen haben */
  skipped: string[];
  scores: Scores;
  /** Nach dieser Frage ist Schluss */
  last: boolean;
  continueMode: ContinueMode;
  /** Nur bei continueMode "auto" */
  nextInMs: number | null;
  /** Wer schon auf Weiter gedrueckt hat (Bots und Abwesende sofort) */
  ready: string[];
  /** Die erste Person hat gedrueckt: so lange warten die anderen noch */
  autoInMs: number | null;
}

export interface EndSummary {
  id: string;
  name: string;
  isBot: boolean;
  score: number;
  correct: number;
  wrong: number;
  avgMs: number | null;
  bestStreak: number;
  placement: number;
}

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
  games: number;
}

export interface MatchEnd {
  id: string;
  kind: MatchKind;
  reason: 'complete' | 'forfeit' | 'abandoned';
  winnerId: string | null;
  questionsPlayed: number;
  summary: EndSummary[];
  ratingChanges: Record<string, RatingChange>;
}

export interface LobbySettings {
  sections: string[];
  answerMode: AnswerMode;
  questionCount: number;
  difficulty: Difficulty;
  optionCount: OptionCount;
  timeLimit: TimeLimit;
  continueMode: ContinueMode;
  locked: boolean;
}

export interface LobbyState {
  code: string;
  hostId: string;
  max: number;
  playing: boolean;
  locked: boolean;
  settings: LobbySettings;
  members: { id: string; name: string; avatar: string | null; guest: boolean; connected: boolean }[];
  bots: { id: string; name: string; difficulty: BotDifficulty }[];
}

export interface QueueStatus {
  kind: 'ranked' | 'unranked';
  since: number;
  waiting: number;
  answerMode: AnswerMode;
  difficulty: Difficulty;
  optionCount: OptionCount;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  avatar: string | null;
  rating: number;
  peakRating: number;
  rankedGames: number;
  wins: number;
}

export interface RecentMatch {
  id: string;
  kind: MatchKind;
  variant: string | null;
  answerMode: AnswerMode;
  endedAt: number;
  result: 'win' | 'loss' | 'draw' | 'solo';
  reason: string;
  score: number;
  placement: number;
  ratingDelta: number | null;
  opponents: { id: string; name: string; isBot: boolean; score: number }[];
}

export interface Profile {
  user: User;
  stats: Stats;
  matches: RecentMatch[];
}

/** Was Freunde ueber jemanden sehen */
export type Presence = 'offline' | 'online' | 'queue' | 'lobby' | 'playing';
/** Beziehung aus meiner Sicht */
export type Relation = 'none' | 'friend' | 'outgoing' | 'incoming';

export interface FriendCard {
  id: string;
  name: string;
  avatar: string | null;
  guest: boolean;
  rating: number;
  rankedGames: number;
  /** Kurzes Kennzeichen aus der ID, fuer gleichnamige Leute */
  tag: string;
  presence?: Presence;
  relation?: Relation;
}

export interface FriendsList {
  friends: FriendCard[];
  incoming: FriendCard[];
  outgoing: FriendCard[];
}

export interface InvitePerson {
  id: string;
  name: string;
  avatar: string | null;
}

export interface Invite {
  id: string;
  from: InvitePerson;
  to: InvitePerson;
  /** true: die Anfrage holt einen in eine bestehende Lobby, sonst startet direkt ein Duell */
  intoLobby: boolean;
  expiresInMs: number;
}

export interface Ack {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}
