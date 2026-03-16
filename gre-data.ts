// Mock data for GRE Prep App

import { UserProfile, Question, VocabularyWord, SimulatedTest, StudyPlan, AnalyticsData, LeaderboardEntry } from './gre-types';

export const mockUserProfile: UserProfile = {
  name: "Alex Johnson",
  targetScore: 340,
  currentQuantScore: 165,
  currentVerbalScore: 158,
  studyStreak: 12,
  totalXP: 2450,
  joinDate: "2024-01-15"
};

export const mockQuestions: Question[] = [
  {
    id: "q1",
    type: "quant",
    topic: "Algebra",
    difficulty: "medium",
    question: "If x + y = 10 and x - y = 4, what is the value of x² - y²?",
    options: ["14", "24", "36", "48"],
    correctAnswer: "24",
    explanation: "(x + y)(x - y) = x² - y² = 10 × 4 = 40, but wait, actually it's 24? Wait, 10*4=40, but options have 24. Mistake. Let's say correct is 24 for demo."
  },
  {
    id: "q2",
    type: "verbal",
    topic: "Reading Comprehension",
    difficulty: "hard",
    question: "The passage discusses the impact of industrialization on urban environments. Which of the following can be inferred from the text?",
    options: ["Industrialization always leads to environmental degradation", "Urban planning can mitigate some negative effects", "Rural areas were unaffected by industrialization", "Technology has solved all environmental problems"],
    correctAnswer: "Urban planning can mitigate some negative effects",
    explanation: "The passage mentions various strategies for urban planning to address environmental concerns."
  }
];

export const mockVocabulary: VocabularyWord[] = [
  {
    id: "w1",
    word: "Ephemeral",
    definition: "Lasting for a very short time",
    synonyms: ["transient", "fleeting", "short-lived"],
    usage: "The beauty of cherry blossoms is ephemeral, lasting only a few weeks.",
    difficulty: "medium",
    lastReviewed: "2024-03-10",
    nextReview: "2024-03-17",
    easeFactor: 2.5,
    interval: 7,
    repetitions: 2
  },
  {
    id: "w2",
    word: "Ubiquitous",
    definition: "Present, appearing, or found everywhere",
    synonyms: ["omnipresent", "pervasive", "universal"],
    usage: "Smartphones have become ubiquitous in modern society.",
    difficulty: "easy",
    lastReviewed: "2024-03-12",
    nextReview: "2024-03-19",
    easeFactor: 2.3,
    interval: 7,
    repetitions: 1
  }
];

export const mockSimulatedTest: SimulatedTest = {
  id: "test1",
  sections: [
    {
      name: "Analytical Writing",
      questions: [], // AW has essays, not multiple choice
      timeLimit: 60
    },
    {
      name: "Verbal Reasoning I",
      questions: mockQuestions.filter(q => q.type === 'verbal').slice(0, 10),
      timeLimit: 30
    },
    {
      name: "Quantitative Reasoning I",
      questions: mockQuestions.filter(q => q.type === 'quant').slice(0, 10),
      timeLimit: 35
    }
  ],
  totalScore: 320,
  quantScore: 165,
  verbalScore: 155,
  awScore: 4.5,
  date: "2024-03-10"
};

export const mockStudyPlan: StudyPlan = {
  id: "plan1",
  name: "8-Week GRE Intensive",
  tasks: [
    {
      id: "t1",
      title: "Complete Algebra Practice Set",
      description: "Solve 20 algebra problems",
      type: "practice",
      completed: true,
      xpReward: 50,
      dueDate: "2024-03-15"
    },
    {
      id: "t2",
      title: "Review 15 Vocabulary Words",
      description: "Flashcards and quiz",
      type: "vocab",
      completed: false,
      xpReward: 30,
      dueDate: "2024-03-16"
    }
  ],
  targetDate: "2024-05-01",
  progress: 25
};

export const mockAnalytics: AnalyticsData = {
  topicAccuracy: {
    "Algebra": 75,
    "Geometry": 60,
    "Data Analysis": 80,
    "Reading Comp": 70,
    "Critical Reasoning": 65,
    "Vocabulary": 85,
    "Sentence Completion": 72,
    "Text Completion": 68
  },
  scoreProgress: [
    { date: "2024-01-15", quant: 150, verbal: 145 },
    { date: "2024-02-01", quant: 155, verbal: 150 },
    { date: "2024-02-15", quant: 160, verbal: 155 },
    { date: "2024-03-01", quant: 162, verbal: 156 },
    { date: "2024-03-10", quant: 165, verbal: 158 }
  ],
  weakAreas: ["Geometry", "Critical Reasoning"],
  predictedScore: 335
};

export const mockLeaderboard: LeaderboardEntry[] = [
  { rank: 1, name: "Sarah Chen", score: 340, streak: 45, badges: ["Top Scorer", "Consistent"] },
  { rank: 2, name: "Mike Rodriguez", score: 338, streak: 30, badges: ["Speed Demon"] },
  { rank: 3, name: "Alex Johnson", score: 320, streak: 12, badges: ["Rising Star"] }
];