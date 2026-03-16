// GRE Prep App Types

export interface UserProfile {
  name: string;
  targetScore: number;
  currentQuantScore: number;
  currentVerbalScore: number;
  studyStreak: number;
  totalXP: number;
  joinDate: string;
}

export interface Question {
  id: string;
  type: 'quant' | 'verbal' | 'aw';
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
  timeLimit?: number; // in seconds
}

export interface PracticeSession {
  id: string;
  date: string;
  questions: Question[];
  answers: (string | number)[];
  scores: number[];
  timeSpent: number;
}

export interface VocabularyWord {
  id: string;
  word: string;
  definition: string;
  synonyms: string[];
  usage: string;
  difficulty: 'easy' | 'medium' | 'hard';
  lastReviewed: string;
  nextReview: string;
  easeFactor: number;
  interval: number;
  repetitions: number;
}

export interface TestSection {
  name: string;
  questions: Question[];
  timeLimit: number; // in minutes
}

export interface SimulatedTest {
  id: string;
  sections: TestSection[];
  totalScore: number;
  quantScore: number;
  verbalScore: number;
  awScore: number;
  date: string;
}

export interface StudyTask {
  id: string;
  title: string;
  description: string;
  type: 'practice' | 'vocab' | 'test' | 'writing';
  completed: boolean;
  xpReward: number;
  dueDate: string;
}

export interface StudyPlan {
  id: string;
  name: string;
  tasks: StudyTask[];
  targetDate: string;
  progress: number;
}

export interface AnalyticsData {
  topicAccuracy: { [topic: string]: number };
  scoreProgress: { date: string; quant: number; verbal: number }[];
  weakAreas: string[];
  predictedScore: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  streak: number;
  badges: string[];
}

export type AppView = 'dashboard' | 'practice' | 'vocabulary' | 'test-simulator' | 'writing' | 'study-plan' | 'analytics' | 'leaderboard';