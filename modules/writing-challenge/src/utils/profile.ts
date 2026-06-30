const PROFILES_KEY = 'stroke-practice-profiles';
const ACTIVE_KEY = 'stroke-practice-active-profile';

export interface ProfileData {
  name: string;
  createdAt: string;
  currentLevel: number;
  completedChars: string[];
  completedWords: string[];
  stats: {
    totalPracticed: number;
    totalQuizPassed: number;
    streakDays: number;
    lastPracticeDate: string;
  };
}

function createDefault(name: string): ProfileData {
  return {
    name,
    createdAt: new Date().toISOString(),
    currentLevel: 1,
    completedChars: [],
    completedWords: [],
    stats: {
      totalPracticed: 0,
      totalQuizPassed: 0,
      streakDays: 0,
      lastPracticeDate: '',
    },
  };
}

export function getAllProfiles(): Record<string, ProfileData> {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(profiles: Record<string, ProfileData>) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function getActiveProfileName(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProfileName(name: string) {
  localStorage.setItem(ACTIVE_KEY, name);
}

export function getProfile(name: string): ProfileData | null {
  return getAllProfiles()[name] || null;
}

export function createProfile(name: string): ProfileData {
  const profiles = getAllProfiles();
  const profile = createDefault(name);
  profiles[name] = profile;
  saveAll(profiles);
  setActiveProfileName(name);
  return profile;
}

export function updateProfile(name: string, updates: Partial<ProfileData>) {
  const profiles = getAllProfiles();
  if (!profiles[name]) return;
  profiles[name] = { ...profiles[name], ...updates };
  saveAll(profiles);
}

export function deleteProfile(name: string) {
  const profiles = getAllProfiles();
  delete profiles[name];
  saveAll(profiles);
  if (getActiveProfileName() === name) {
    const remaining = Object.keys(profiles);
    localStorage.setItem(ACTIVE_KEY, remaining[0] || '');
  }
}

export function recordPractice(name: string, char: string) {
  const profiles = getAllProfiles();
  const p = profiles[name];
  if (!p) return;
  p.stats.totalPracticed++;
  const today = new Date().toISOString().slice(0, 10);
  if (p.stats.lastPracticeDate === today) {
    // same day
  } else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    p.stats.streakDays = p.stats.lastPracticeDate === yesterday
      ? p.stats.streakDays + 1
      : 1;
    p.stats.lastPracticeDate = today;
  }
  if (!p.completedChars.includes(char)) {
    p.completedChars.push(char);
  }
  saveAll(profiles);
}

export function recordQuizPass(name: string, word: string) {
  const profiles = getAllProfiles();
  const p = profiles[name];
  if (!p) return;
  p.stats.totalQuizPassed++;
  if (!p.completedWords.includes(word)) {
    p.completedWords.push(word);
  }
  recordPractice(name, word);
  saveAll(profiles);
}
