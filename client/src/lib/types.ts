export type AnswerMode = 'choice' | 'typed' | 'mixed';
export type MatchKind = 'solo' | 'bot' | 'unranked' | 'ranked' | 'private';
export type BotDifficulty = 'leicht' | 'mittel' | 'schwer';
export type SoloMode = 'classic' | 'survival';

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
  scores: Scores;
  nextInMs: number;
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
}

export interface LobbyState {
  code: string;
  hostId: string;
  max: number;
  playing: boolean;
  settings: LobbySettings;
  members: { id: string; name: string; avatar: string | null; guest: boolean; connected: boolean }[];
  bots: { id: string; name: string; difficulty: BotDifficulty }[];
}

export interface QueueStatus {
  kind: 'ranked' | 'unranked';
  since: number;
  waiting: number;
  answerMode: AnswerMode;
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

export interface Ack {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}
