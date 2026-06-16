export interface SportteryOutcome {
  key: string;
  label: string;
  odd: number | null;
  probability: number | null;
}

export interface SportteryOddsRow {
  poolCode: string;
  poolName: string;
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
  homeScore?: number | null;
  awayScore?: number | null;
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
