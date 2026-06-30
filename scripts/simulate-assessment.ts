/**
 * Simulate an assessment for a test user.
 *
 * - Creates a platform user "TestBot"
 * - Starts assessment (5 sentences)
 * - For each sentence, 70% of chars are correct (round down)
 * - Of the correct chars, half (round down) are perfect
 * - Remaining chars are incorrect
 *
 * Usage: npx tsx scripts/simulate-assessment.ts
 * (server must be running on localhost:3000)
 */

const BASE = 'http://localhost:3000';

interface Sentence {
  trad: string;
  english: string;
}

interface CharResult {
  char: string;
  result: 'perfect' | 'correct' | 'incorrect';
  failedStrokes: number;
  hintUsed: boolean;
  durationMs: number;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function extractChars(trad: string): string[] {
  return [...trad].filter(c => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function simulateResults(chars: string[]): CharResult[] {
  const total = chars.length;
  const correctCount = Math.floor(total * 0.7);
  const perfectCount = Math.floor(correctCount / 2);
  const justCorrectCount = correctCount - perfectCount;
  const incorrectCount = total - correctCount;

  // Shuffle indices to randomize which chars get which result
  const indices = shuffle([...Array(total).keys()]);

  const results: CharResult[] = new Array(total);
  let idx = 0;

  // Perfect
  for (let i = 0; i < perfectCount; i++) {
    const ci = indices[idx++];
    results[ci] = {
      char: chars[ci],
      result: 'perfect',
      failedStrokes: 0,
      hintUsed: false,
      durationMs: 2000 + Math.floor(Math.random() * 3000),
    };
  }

  // Correct (some mistakes but no failed strokes)
  for (let i = 0; i < justCorrectCount; i++) {
    const ci = indices[idx++];
    results[ci] = {
      char: chars[ci],
      result: 'correct',
      failedStrokes: 0,
      hintUsed: false,
      durationMs: 3000 + Math.floor(Math.random() * 4000),
    };
  }

  // Incorrect
  for (let i = 0; i < incorrectCount; i++) {
    const ci = indices[idx++];
    results[ci] = {
      char: chars[ci],
      result: 'incorrect',
      failedStrokes: 1 + Math.floor(Math.random() * 3),
      hintUsed: false,
      durationMs: 5000 + Math.floor(Math.random() * 5000),
    };
  }

  return results;
}

async function main() {
  // Create user
  let user: { id: number; name: string };
  try {
    user = await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'TestBot' }),
    });
    console.log(`Created user: ${user.name} (id=${user.id})`);
  } catch {
    // Already exists, find it
    const users = await api<{ id: number; name: string }[]>('/api/users');
    const existing = users.find(u => u.name === 'TestBot');
    if (!existing) throw new Error('Could not create or find TestBot user');
    user = existing;
    console.log(`Using existing user: ${user.name} (id=${user.id})`);
  }

  // Start assessment
  console.log('\nStarting assessment...');
  const start = await api<{ sentence: Sentence; step: number; totalSteps: number }>(
    '/api/writing-challenge/assessment/start',
    { method: 'POST', body: JSON.stringify({ userId: user.id }) },
  );

  console.log(`Total steps: ${start.totalSteps}\n`);

  let currentSentence = start.sentence;
  let step = start.step;
  const totalSteps = start.totalSteps;

  for (let i = 0; i < totalSteps; i++) {
    const chars = extractChars(currentSentence.trad);
    const results = simulateResults(chars);

    const perfectCount = results.filter(r => r.result === 'perfect').length;
    const correctCount = results.filter(r => r.result === 'correct').length;
    const incorrectCount = results.filter(r => r.result === 'incorrect').length;

    console.log(`Step ${step}/${totalSteps}: ${currentSentence.trad}`);
    console.log(`  ${chars.length} chars → ${perfectCount}P ${correctCount}C ${incorrectCount}I`);
    console.log(`  ${results.map(r => r.char + (r.result === 'perfect' ? '✓' : r.result === 'correct' ? '~' : '✗')).join(' ')}`);

    const response = await api<{
      done: boolean;
      sentence?: Sentence;
      step?: number;
      assessedLevel?: number;
      knownChars?: string[];
    }>('/api/writing-challenge/assessment/submit', {
      method: 'POST',
      body: JSON.stringify({ userId: user.id, charResults: results }),
    });

    if (response.done) {
      console.log(`\n=== Assessment Complete ===`);
      console.log(`Assessed Level: HSK ${response.assessedLevel}`);
      console.log(`Known Characters: ${response.knownChars?.length}`);
      break;
    }

    currentSentence = response.sentence!;
    step = response.step!;
  }

  // Show final profile
  const profile = await api<{ assessedLevel: number; currentLevel: number }>(
    `/api/writing-challenge/profile?userId=${user.id}`,
  );
  console.log(`\nProfile: assessedLevel=${profile.assessedLevel} currentLevel=${profile.currentLevel}`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
