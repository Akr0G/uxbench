export const METHODOLOGY = {
  version: "UXBench Methodology 1.0",
  rulesVersion: "1.0",
  weights: {
    accessibility: 0.25,
    performance: 0.25,
    responsive: 0.2,
    usability: 0.2,
    technical: 0.1,
  },
  devices: {
    mobile: { width: 390, height: 844, weight: 0.6 },
    desktop: { width: 1440, height: 900, weight: 0.4 },
  },
  runs: { quick: 1, standard: 3, competition: 5 },
  widths: [320, 360, 390, 768, 1024, 1440],
  maxPages: 5,
  maxSites: 5,
  timeout: 45000,
  cacheHours: 6,
  throttling: {
    mobile: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
      requestLatencyMs: 562.5,
      downloadThroughputKbps: 1474.56,
      uploadThroughputKbps: 675,
    },
    desktop: {
      rttMs: 40,
      throughputKbps: 10240,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0,
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    },
  },
} as const;
export const CATEGORY_NAMES = {
  accessibility: "Accessibility",
  performance: "Performance",
  responsive: "Responsive & interaction",
  usability: "Usability signals",
  technical: "Technical quality & discovery",
};
export const HEURISTICS = [
  "Visibility of system status",
  "Match between system and the real world",
  "User control and freedom",
  "Consistency and standards",
  "Error prevention",
  "Recognition rather than recall",
  "Flexibility and efficiency of use",
  "Aesthetic and minimalist design",
  "Help users recognize, diagnose, and recover from errors",
  "Help and documentation",
];
export const SEVERITIES = [
  "Not a usability problem",
  "Cosmetic",
  "Minor",
  "Major",
  "Usability catastrophe",
];
