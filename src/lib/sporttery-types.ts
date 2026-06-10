export type SportteryOutcomeKey = "h" | "d" | "a";

export interface SportteryOutcome {
  key: SportteryOutcomeKey;
  label: "胜" | "平" | "负";
  odd: number | null;
  probability: number | null;
}

export interface SportteryOddsRow {
  poolCode: "HAD" | "HHAD";
  poolName: "胜平负" | "让球胜平负";
  handicapLabel: string;
  updateAt: string | null;
  outcomes: SportteryOutcome[];
}

export interface SportteryMatch {
  matchId: number;
  matchNum: string;
  matchNumDate: string;
  taxDateNo: string;
  league: string;
  matchDate: string;
  matchTime: string;
  kickoffText: string;
  home: string;
  away: string;
  status: string;
  rows: SportteryOddsRow[];
}

export interface SportteryMatchDay {
  businessDate: string;
  matches: SportteryMatch[];
}

export interface SportteryOddsPayload {
  source: string;
  sourceUrl: string;
  lastUpdated: string | null;
  days: SportteryMatchDay[];
  error?: string;
}
