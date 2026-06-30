/**
 * Tag TOCFL words with grammar roles based on definition analysis.
 *
 * Usage: npx tsx scripts/tag-grammar.ts
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// tocfl_words is platform-owned curriculum content now (content.db).
const DB_PATH = join(__dirname, '..', '..', '..', 'platform', 'content.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Add grammar column if not exists
try { db.exec('ALTER TABLE tocfl_words ADD COLUMN grammar TEXT DEFAULT ""'); } catch { /* exists */ }

interface WordRow {
  id: number;
  word: string;
  definition: string;
  category: string;
}

// --- Known words for manual override ---
const MANUAL: Record<string, string> = {
  // Pronouns
  '我': 'pronoun', '你': 'pronoun', '妳': 'pronoun', '他': 'pronoun', '她': 'pronoun',
  '它': 'pronoun', '我們': 'pronoun', '你們': 'pronoun', '妳們': 'pronoun',
  '他們': 'pronoun', '她們': 'pronoun', '自己': 'pronoun', '大家': 'pronoun',
  '人家': 'pronoun', '別人': 'pronoun', '誰': 'pronoun', '什麼': 'pronoun',
  '哪': 'pronoun', '哪裡': 'pronoun', '哪兒': 'pronoun', '這': 'pronoun',
  '那': 'pronoun', '這裡': 'pronoun', '那裡': 'pronoun', '這兒': 'pronoun',
  '那兒': 'pronoun', '這個': 'pronoun', '那個': 'pronoun', '每': 'pronoun',
  '某': 'pronoun', '各': 'pronoun', '咱們': 'pronoun', '您': 'pronoun',
  '什麼': 'pronoun', '怎麼': 'adverb', '怎麼樣': 'adverb', '多少': 'adverb',
  '這麼': 'adverb', '那麼': 'adverb', '為什麼': 'adverb',

  // Classifiers
  '個': 'classifier', '位': 'classifier', '本': 'classifier', '塊': 'classifier',
  '杯': 'classifier', '瓶': 'classifier', '碗': 'classifier', '盤': 'classifier',
  '份': 'classifier', '件': 'classifier', '條': 'classifier', '隻': 'classifier',
  '張': 'classifier', '把': 'classifier', '輛': 'classifier', '架': 'classifier',
  '台': 'classifier', '棵': 'classifier', '朵': 'classifier', '顆': 'classifier',
  '雙': 'classifier', '次': 'classifier', '遍': 'classifier', '趟': 'classifier',

  // More particles
  '們': 'particle', '子': 'particle',

  // More adverbs
  '可以': 'adverb', '會': 'adverb', '能': 'adverb', '要': 'adverb',
  '想': 'verb', '知道': 'verb', '覺得': 'verb', '希望': 'verb',
  '可能': 'adverb', '一定': 'adverb',

  // Time
  '今年': 'time', '去年': 'time', '明年': 'time', '時間': 'time',
  '久': 'time', '早': 'adjective', '晚': 'adjective',

  // Phrases
  '元': 'classifier', '歲': 'classifier',
  '對不起': 'interjection', '沒關係': 'interjection', '謝謝': 'interjection',
  '請問': 'interjection', '不客氣': 'interjection',

  // Particles
  '的': 'particle', '了': 'particle', '著': 'particle', '過': 'particle',
  '嗎': 'particle', '呢': 'particle', '吧': 'particle', '啊': 'particle',
  '嘛': 'particle', '吶': 'particle', '呀': 'particle', '哦': 'particle',
  '喔': 'particle', '耶': 'particle', '囉': 'particle', '哇': 'particle',
  '地': 'particle', '得': 'particle', '所': 'particle',

  // Conjunctions
  '和': 'conjunction', '跟': 'conjunction', '與': 'conjunction', '或': 'conjunction',
  '或者': 'conjunction', '還是': 'conjunction', '但是': 'conjunction', '但': 'conjunction',
  '可是': 'conjunction', '不過': 'conjunction', '而且': 'conjunction', '而': 'conjunction',
  '因為': 'conjunction', '所以': 'conjunction', '如果': 'conjunction', '雖然': 'conjunction',

  // Prepositions
  '在': 'preposition', '從': 'preposition', '到': 'preposition', '對': 'preposition',
  '給': 'preposition', '向': 'preposition', '往': 'preposition', '為': 'preposition',
  '把': 'preposition', '被': 'preposition', '比': 'preposition', '除了': 'preposition',
  '關於': 'preposition', '按照': 'preposition',

  // Adverbs
  '不': 'adverb', '沒': 'adverb', '沒有': 'adverb', '很': 'adverb', '太': 'adverb',
  '也': 'adverb', '都': 'adverb', '就': 'adverb', '才': 'adverb', '再': 'adverb',
  '又': 'adverb', '還': 'adverb', '已經': 'adverb', '正在': 'adverb', '剛': 'adverb',
  '常常': 'adverb', '常': 'adverb', '一直': 'adverb', '總是': 'adverb', '非常': 'adverb',
  '真': 'adverb', '最': 'adverb', '更': 'adverb', '只': 'adverb', '一定': 'adverb',
  '可能': 'adverb', '應該': 'adverb', '必須': 'adverb', '千萬': 'adverb',
  '馬上': 'adverb', '立刻': 'adverb', '忽然': 'adverb', '突然': 'adverb',
  '其實': 'adverb', '當然': 'adverb', '大概': 'adverb', '幾乎': 'adverb',

  // Numbers
  '一': 'number', '二': 'number', '三': 'number', '四': 'number', '五': 'number',
  '六': 'number', '七': 'number', '八': 'number', '九': 'number', '十': 'number',
  '百': 'number', '千': 'number', '萬': 'number', '億': 'number', '零': 'number',
  '兩': 'number', '半': 'number', '第一': 'number', '幾': 'number',

  // Directions
  '上': 'direction', '下': 'direction', '左': 'direction', '右': 'direction',
  '前': 'direction', '後': 'direction', '裡': 'direction', '外': 'direction',
  '中': 'direction', '旁邊': 'direction', '對面': 'direction', '附近': 'direction',
  '東': 'direction', '西': 'direction', '南': 'direction', '北': 'direction',
  '上面': 'direction', '下面': 'direction', '裡面': 'direction', '外面': 'direction',
  '前面': 'direction', '後面': 'direction', '中間': 'direction',

  // Time
  '今天': 'time', '明天': 'time', '昨天': 'time', '現在': 'time', '以前': 'time',
  '以後': 'time', '早上': 'time', '晚上': 'time', '中午': 'time', '下午': 'time',
  '上午': 'time', '時候': 'time', '年': 'time', '月': 'time', '日': 'time',
  '天': 'time', '星期': 'time', '小時': 'time', '分鐘': 'time', '秒': 'time',
  '最近': 'time', '剛才': 'time', '馬上': 'time', '永遠': 'time',
};

function tagByDefinition(def: string, word: string): string {
  const d = def.toLowerCase();

  // Classifier signals
  if (/^(classifier|measure word)\b/.test(d)) return 'classifier';
  if (/^cl\b/.test(d) && word.length === 1) return 'classifier';

  // Verb signals — starts with "to "
  if (/^to /.test(d)) return 'verb';

  // Adjective signals
  if (/^(big|small|long|short|tall|high|low|good|bad|new|old|many|few|fast|slow|hot|cold|warm|beautiful|happy|sad|easy|hard|difficult|early|late|far|near|right|wrong|same|different|important|busy|quiet|cheap|expensive|clean|dirty|full|empty|thick|thin|heavy|light|deep|young|dark|bright|fresh|dry|wet|soft|hard|rich|poor|strong|weak|wide|narrow|sharp|flat|round|straight|sweet|sour|bitter|salty|spicy|loud|comfortable|dangerous|safe|correct|wrong|serious|special|normal|strange|certain|whole|entire|complete|main|real|basic|common|popular|famous|public|private|single|double)\b/.test(d)) return 'adjective';

  // Noun — has CL: in definition (classifier reference = noun)
  if (/cl[:：]|cl\[/.test(d)) return 'noun';

  // More noun signals
  if (/^(a |an |the )?(type|kind|sort|piece|pair|set) of\b/.test(d)) return 'noun';
  if (/\b(person|people|place|thing|food|drink|animal|plant|building|room|tool|machine|device|vehicle|language|country|city|school|hospital|company|store|restaurant|park|station|airport)\b/.test(d) && !d.startsWith('to ')) return 'noun';

  // Interjection
  if (/^(oh|ah|hey|wow|ouch|hmm|well|hello|hi|goodbye|bye)\b/.test(d)) return 'interjection';

  // Noun — broader patterns
  // Ends with common noun suffixes in the word itself
  if (/[子人員師生家機車店場房間路街學院館園廠區局所站台].?$/.test(word) && word.length >= 2) return 'noun';

  // Definition contains noun-ish words without "to " prefix
  if (!d.startsWith('to ') && /\b(son|daughter|father|mother|brother|sister|child|baby|friend|teacher|student|doctor|worker|driver|wife|husband|king|queen|god|man|woman|boy|girl|name|number|time|day|week|month|year|hour|minute|age|color|shape|size|price|money|dollar|way|method|reason|problem|question|answer|idea|plan|news|story|letter|word|sentence|book|paper|page|map|picture|photo|movie|song|music|game|sport|test|exam|class|lesson|course|degree|job|work|business|meeting|party|holiday|trip|gift|mail|phone|computer|internet|email|weather|rain|snow|wind|sun|moon|star|sky|air|water|fire|earth|sea|river|lake|mountain|tree|flower|grass|fruit|rice|tea|coffee|milk|egg|bread|cake|sugar|salt|oil|meat|fish|chicken|beef|pork|vegetable|soup|noodle|dumpling|breakfast|lunch|dinner|meal|dish|cup|bottle|bowl|plate|bag|box|table|chair|bed|door|window|wall|floor|roof|key|clock|watch|umbrella|mirror|towel|soap|ticket|stamp|card|coin|knife|fork|spoon|chopstick|pen|pencil|brush|needle|thread|clothes|shirt|pants|skirt|dress|coat|jacket|hat|shoe|sock|ring|glass|bowl|basket|ladder|rope|wheel|bell|flag|sign|mark|dot|line|circle|square|corner)\b/.test(d)) return 'noun';

  // Definition is a single word or short phrase without "to" — likely noun
  if (!d.startsWith('to ') && d.split(',')[0].trim().split(' ').length <= 3 && !/^(not|very|quite|also|too|all|already|still|just|only|never|always|often|really|extremely|most|more|less|how|why|when|where|what|which|who)\b/.test(d)) return 'noun';

  return '';
}

// --- Main ---

const words = db.prepare('SELECT id, word, definition, category FROM tocfl_words').all() as WordRow[];
const update = db.prepare('UPDATE tocfl_words SET grammar = ? WHERE id = ?');

const stats: Record<string, number> = {};
let manualCount = 0;
let autoCount = 0;
let untagged = 0;

const tagAll = db.transaction(() => {
  for (const row of words) {
    let grammar = '';

    // Manual override — check word and all slash variants
    const variants = row.word.split('/');
    const manualMatch = variants.find(v => MANUAL[v]);
    if (manualMatch) {
      grammar = MANUAL[manualMatch];
      manualCount++;
    } else {
      grammar = tagByDefinition(row.definition, row.word);
      if (grammar) autoCount++;
      else untagged++;
    }

    stats[grammar || 'untagged'] = (stats[grammar || 'untagged'] || 0) + 1;
    update.run(grammar, row.id);
  }
});

tagAll();

console.log('Tagged', words.length, 'words');
console.log('  Manual:', manualCount);
console.log('  Auto:', autoCount);
console.log('  Untagged:', untagged);
console.log('');
console.log('Distribution:');
for (const [tag, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + (tag || 'untagged').padEnd(15) + count);
}

// Show untagged samples from level 1
console.log('\nUntagged level 1 samples:');
const untaggedL1 = db.prepare("SELECT word, definition FROM tocfl_words WHERE grammar = '' AND level = '第1級' LIMIT 20").all() as { word: string; definition: string }[];
for (const { word, definition } of untaggedL1) {
  console.log('  ' + word + ' | ' + definition.slice(0, 50));
}

db.close();
