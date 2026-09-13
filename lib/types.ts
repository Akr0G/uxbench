export type Category =
  "accessibility" | "performance" | "responsive" | "usability" | "technical";
export type Mode = "quick" | "standard" | "competition";
export type Severity = "Critical" | "High" | "Medium" | "Low" | "Informational";
export interface Finding {
  id: string;
  rule: string;
  title: string;
  category: Category;
  severity: Severity;
  confidence: "High" | "Medium" | "Low" | "Human review required";
  page: string;
  selector: string;
  html?: string;
  evidence: string;
  why: string;
  recommendation: string;
  standard: string;
  box?: { x: number; y: number; width: number; height: number };
  viewport?: number;
}
export interface Check {
  id: string;
  title: string;
  category: Category;
  weight: number;
  applicable: boolean;
  tested: number;
  passing: number;
  failing: number;
  status: "pass" | "partial" | "fail" | "not applicable" | "human review";
  evidence: string;
}
export interface Run {
  device: "mobile" | "desktop";
  index: number;
  version: string;
  browser: string;
  categories: Record<string, number | null>;
  metrics: Record<string, number | null>;
  settings: unknown;
  rawFile: string;
}
export interface Field {
  status: "available" | "unavailable" | "not-configured" | "error";
  message: string;
  record?: {
    key: unknown;
    collectionPeriod: unknown;
    metrics: Record<string, { percentiles: { p75: number } }>;
  };
}
export interface PageResult {
  rawFiles?: string[];
  url: string;
  finalUrl?: string;
  status?: number;
  role: string;
  error?: string;
  errors: string[];
  runs: Run[];
  checks: Check[];
  findings: Finding[];
  screenshots: { name: string; width: number; height: number }[];
  field: Record<string, Field>;
  navigation?: string[];
}
export interface Site {
  name: string;
  url: string;
  pages: string[];
  results: PageResult[];
  scores: Record<Category, number | null>;
  score: number | null;
}
export interface Job {
  id: string;
  kind: "audit" | "comparison";
  status: "queued" | "running" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  stage: string;
  completed: number;
  total: number;
  mode: Mode;
  sites: Site[];
  methodology: unknown;
  error?: string;
}
export interface Review {
  id: string;
  createdAt: string;
  site: string;
  page: string;
  evaluator: string;
  heuristic: number;
  description: string;
  area: string;
  recommendation: string;
  severity: number;
  notes: string;
  screenshot: string;
}
