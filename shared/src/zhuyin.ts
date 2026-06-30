/**
 * Pinyin to Zhuyin conversion — pure functions, no Node dependencies.
 * Safe to import from client (PWA) and server.
 */

export const TONE_MARKS: Record<string, [string, number]> = {
  'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4],
  'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
  'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4],
  'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
  'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4],
  'ǖ': ['ü', 1], 'ǘ': ['ü', 2], 'ǚ': ['ü', 3], 'ǜ': ['ü', 4],
};

export const ZHUYIN_TONE = ['', '', 'ˊ', 'ˇ', 'ˋ', '˙'];

// Complete pinyin syllable -> zhuyin mapping (without tones)
export const SYLLABLE_MAP: Record<string, string> = {
  // Zero-initial
  a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ',
  an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ', er: 'ㄦ',
  yi: 'ㄧ', ya: 'ㄧㄚ', ye: 'ㄧㄝ', yao: 'ㄧㄠ', you: 'ㄧㄡ',
  yan: 'ㄧㄢ', yin: 'ㄧㄣ', yang: 'ㄧㄤ', ying: 'ㄧㄥ', yong: 'ㄩㄥ',
  wu: 'ㄨ', wa: 'ㄨㄚ', wo: 'ㄨㄛ', wai: 'ㄨㄞ', wei: 'ㄨㄟ',
  wan: 'ㄨㄢ', wen: 'ㄨㄣ', wang: 'ㄨㄤ', weng: 'ㄨㄥ',
  yu: 'ㄩ', yue: 'ㄩㄝ', yuan: 'ㄩㄢ', yun: 'ㄩㄣ',
  // b
  ba: 'ㄅㄚ', bo: 'ㄅㄛ', bai: 'ㄅㄞ', bei: 'ㄅㄟ', bao: 'ㄅㄠ',
  ban: 'ㄅㄢ', ben: 'ㄅㄣ', bang: 'ㄅㄤ', beng: 'ㄅㄥ',
  bi: 'ㄅㄧ', bie: 'ㄅㄧㄝ', biao: 'ㄅㄧㄠ', bian: 'ㄅㄧㄢ', bin: 'ㄅㄧㄣ', bing: 'ㄅㄧㄥ',
  bu: 'ㄅㄨ',
  // p
  pa: 'ㄆㄚ', po: 'ㄆㄛ', pai: 'ㄆㄞ', pei: 'ㄆㄟ', pao: 'ㄆㄠ', pou: 'ㄆㄡ',
  pan: 'ㄆㄢ', pen: 'ㄆㄣ', pang: 'ㄆㄤ', peng: 'ㄆㄥ',
  pi: 'ㄆㄧ', pie: 'ㄆㄧㄝ', piao: 'ㄆㄧㄠ', pian: 'ㄆㄧㄢ', pin: 'ㄆㄧㄣ', ping: 'ㄆㄧㄥ',
  pu: 'ㄆㄨ',
  // m
  ma: 'ㄇㄚ', mo: 'ㄇㄛ', me: 'ㄇㄜ', mai: 'ㄇㄞ', mei: 'ㄇㄟ', mao: 'ㄇㄠ', mou: 'ㄇㄡ',
  man: 'ㄇㄢ', men: 'ㄇㄣ', mang: 'ㄇㄤ', meng: 'ㄇㄥ',
  mi: 'ㄇㄧ', mie: 'ㄇㄧㄝ', miao: 'ㄇㄧㄠ', miu: 'ㄇㄧㄡ', mian: 'ㄇㄧㄢ', min: 'ㄇㄧㄣ', ming: 'ㄇㄧㄥ',
  mu: 'ㄇㄨ',
  // f
  fa: 'ㄈㄚ', fo: 'ㄈㄛ', fei: 'ㄈㄟ', fou: 'ㄈㄡ',
  fan: 'ㄈㄢ', fen: 'ㄈㄣ', fang: 'ㄈㄤ', feng: 'ㄈㄥ',
  fu: 'ㄈㄨ',
  // d
  da: 'ㄉㄚ', de: 'ㄉㄜ', dai: 'ㄉㄞ', dei: 'ㄉㄟ', dao: 'ㄉㄠ', dou: 'ㄉㄡ',
  dan: 'ㄉㄢ', den: 'ㄉㄣ', dang: 'ㄉㄤ', deng: 'ㄉㄥ', dong: 'ㄉㄨㄥ',
  di: 'ㄉㄧ', die: 'ㄉㄧㄝ', diao: 'ㄉㄧㄠ', diu: 'ㄉㄧㄡ', dian: 'ㄉㄧㄢ', ding: 'ㄉㄧㄥ',
  du: 'ㄉㄨ', duo: 'ㄉㄨㄛ', dui: 'ㄉㄨㄟ', duan: 'ㄉㄨㄢ', dun: 'ㄉㄨㄣ',
  // t
  ta: 'ㄊㄚ', te: 'ㄊㄜ', tai: 'ㄊㄞ', tao: 'ㄊㄠ', tou: 'ㄊㄡ',
  tan: 'ㄊㄢ', tang: 'ㄊㄤ', teng: 'ㄊㄥ', tong: 'ㄊㄨㄥ',
  ti: 'ㄊㄧ', tie: 'ㄊㄧㄝ', tiao: 'ㄊㄧㄠ', tian: 'ㄊㄧㄢ', ting: 'ㄊㄧㄥ',
  tu: 'ㄊㄨ', tuo: 'ㄊㄨㄛ', tui: 'ㄊㄨㄟ', tuan: 'ㄊㄨㄢ', tun: 'ㄊㄨㄣ',
  // n
  na: 'ㄋㄚ', ne: 'ㄋㄜ', nai: 'ㄋㄞ', nei: 'ㄋㄟ', nao: 'ㄋㄠ', nou: 'ㄋㄡ',
  nan: 'ㄋㄢ', nen: 'ㄋㄣ', nang: 'ㄋㄤ', neng: 'ㄋㄥ', nong: 'ㄋㄨㄥ',
  ni: 'ㄋㄧ', nie: 'ㄋㄧㄝ', niao: 'ㄋㄧㄠ', niu: 'ㄋㄧㄡ', nian: 'ㄋㄧㄢ', nin: 'ㄋㄧㄣ', niang: 'ㄋㄧㄤ', ning: 'ㄋㄧㄥ',
  nu: 'ㄋㄨ', nuo: 'ㄋㄨㄛ', nuan: 'ㄋㄨㄢ',
  nv: 'ㄋㄩ', nve: 'ㄋㄩㄝ',
  // l
  la: 'ㄌㄚ', lo: 'ㄌㄛ', le: 'ㄌㄜ', lai: 'ㄌㄞ', lei: 'ㄌㄟ', lao: 'ㄌㄠ', lou: 'ㄌㄡ',
  lan: 'ㄌㄢ', lang: 'ㄌㄤ', leng: 'ㄌㄥ', long: 'ㄌㄨㄥ',
  li: 'ㄌㄧ', lie: 'ㄌㄧㄝ', liao: 'ㄌㄧㄠ', liu: 'ㄌㄧㄡ', lian: 'ㄌㄧㄢ', lin: 'ㄌㄧㄣ', liang: 'ㄌㄧㄤ', ling: 'ㄌㄧㄥ',
  lu: 'ㄌㄨ', luo: 'ㄌㄨㄛ', luan: 'ㄌㄨㄢ', lun: 'ㄌㄨㄣ',
  lv: 'ㄌㄩ', lve: 'ㄌㄩㄝ',
  // g
  ga: 'ㄍㄚ', ge: 'ㄍㄜ', gai: 'ㄍㄞ', gei: 'ㄍㄟ', gao: 'ㄍㄠ', gou: 'ㄍㄡ',
  gan: 'ㄍㄢ', gen: 'ㄍㄣ', gang: 'ㄍㄤ', geng: 'ㄍㄥ', gong: 'ㄍㄨㄥ',
  gu: 'ㄍㄨ', gua: 'ㄍㄨㄚ', guo: 'ㄍㄨㄛ', guai: 'ㄍㄨㄞ', gui: 'ㄍㄨㄟ',
  guan: 'ㄍㄨㄢ', gun: 'ㄍㄨㄣ', guang: 'ㄍㄨㄤ',
  // k
  ka: 'ㄎㄚ', ke: 'ㄎㄜ', kai: 'ㄎㄞ', kei: 'ㄎㄟ', kao: 'ㄎㄠ', kou: 'ㄎㄡ',
  kan: 'ㄎㄢ', ken: 'ㄎㄣ', kang: 'ㄎㄤ', keng: 'ㄎㄥ', kong: 'ㄎㄨㄥ',
  ku: 'ㄎㄨ', kua: 'ㄎㄨㄚ', kuo: 'ㄎㄨㄛ', kuai: 'ㄎㄨㄞ', kui: 'ㄎㄨㄟ',
  kuan: 'ㄎㄨㄢ', kun: 'ㄎㄨㄣ', kuang: 'ㄎㄨㄤ',
  // h
  ha: 'ㄏㄚ', he: 'ㄏㄜ', hai: 'ㄏㄞ', hei: 'ㄏㄟ', hao: 'ㄏㄠ', hou: 'ㄏㄡ',
  han: 'ㄏㄢ', hen: 'ㄏㄣ', hang: 'ㄏㄤ', heng: 'ㄏㄥ', hong: 'ㄏㄨㄥ',
  hu: 'ㄏㄨ', hua: 'ㄏㄨㄚ', huo: 'ㄏㄨㄛ', huai: 'ㄏㄨㄞ', hui: 'ㄏㄨㄟ',
  huan: 'ㄏㄨㄢ', hun: 'ㄏㄨㄣ', huang: 'ㄏㄨㄤ',
  // j
  ji: 'ㄐㄧ', jie: 'ㄐㄧㄝ', jiao: 'ㄐㄧㄠ', jiu: 'ㄐㄧㄡ',
  jian: 'ㄐㄧㄢ', jin: 'ㄐㄧㄣ', jiang: 'ㄐㄧㄤ', jing: 'ㄐㄧㄥ', jiong: 'ㄐㄩㄥ',
  jia: 'ㄐㄧㄚ',
  ju: 'ㄐㄩ', jue: 'ㄐㄩㄝ', juan: 'ㄐㄩㄢ', jun: 'ㄐㄩㄣ',
  // q
  qi: 'ㄑㄧ', qie: 'ㄑㄧㄝ', qiao: 'ㄑㄧㄠ', qiu: 'ㄑㄧㄡ',
  qian: 'ㄑㄧㄢ', qin: 'ㄑㄧㄣ', qiang: 'ㄑㄧㄤ', qing: 'ㄑㄧㄥ', qiong: 'ㄑㄩㄥ',
  qia: 'ㄑㄧㄚ',
  qu: 'ㄑㄩ', que: 'ㄑㄩㄝ', quan: 'ㄑㄩㄢ', qun: 'ㄑㄩㄣ',
  // x
  xi: 'ㄒㄧ', xie: 'ㄒㄧㄝ', xiao: 'ㄒㄧㄠ', xiu: 'ㄒㄧㄡ',
  xian: 'ㄒㄧㄢ', xin: 'ㄒㄧㄣ', xiang: 'ㄒㄧㄤ', xing: 'ㄒㄧㄥ', xiong: 'ㄒㄩㄥ',
  xia: 'ㄒㄧㄚ',
  xu: 'ㄒㄩ', xue: 'ㄒㄩㄝ', xuan: 'ㄒㄩㄢ', xun: 'ㄒㄩㄣ',
  // zh
  zha: 'ㄓㄚ', zhe: 'ㄓㄜ', zhi: 'ㄓ', zhai: 'ㄓㄞ', zhei: 'ㄓㄟ', zhao: 'ㄓㄠ', zhou: 'ㄓㄡ',
  zhan: 'ㄓㄢ', zhen: 'ㄓㄣ', zhang: 'ㄓㄤ', zheng: 'ㄓㄥ', zhong: 'ㄓㄨㄥ',
  zhu: 'ㄓㄨ', zhua: 'ㄓㄨㄚ', zhuo: 'ㄓㄨㄛ', zhuai: 'ㄓㄨㄞ', zhui: 'ㄓㄨㄟ',
  zhuan: 'ㄓㄨㄢ', zhun: 'ㄓㄨㄣ', zhuang: 'ㄓㄨㄤ',
  // ch
  cha: 'ㄔㄚ', che: 'ㄔㄜ', chi: 'ㄔ', chai: 'ㄔㄞ', chao: 'ㄔㄠ', chou: 'ㄔㄡ',
  chan: 'ㄔㄢ', chen: 'ㄔㄣ', chang: 'ㄔㄤ', cheng: 'ㄔㄥ', chong: 'ㄔㄨㄥ',
  chu: 'ㄔㄨ', chua: 'ㄔㄨㄚ', chuo: 'ㄔㄨㄛ', chuai: 'ㄔㄨㄞ', chui: 'ㄔㄨㄟ',
  chuan: 'ㄔㄨㄢ', chun: 'ㄔㄨㄣ', chuang: 'ㄔㄨㄤ',
  // sh
  sha: 'ㄕㄚ', she: 'ㄕㄜ', shi: 'ㄕ', shai: 'ㄕㄞ', shei: 'ㄕㄟ', shao: 'ㄕㄠ', shou: 'ㄕㄡ',
  shan: 'ㄕㄢ', shen: 'ㄕㄣ', shang: 'ㄕㄤ', sheng: 'ㄕㄥ',
  shu: 'ㄕㄨ', shua: 'ㄕㄨㄚ', shuo: 'ㄕㄨㄛ', shuai: 'ㄕㄨㄞ', shui: 'ㄕㄨㄟ',
  shuan: 'ㄕㄨㄢ', shun: 'ㄕㄨㄣ', shuang: 'ㄕㄨㄤ',
  // r
  re: 'ㄖㄜ', ri: 'ㄖ', rao: 'ㄖㄠ', rou: 'ㄖㄡ',
  ran: 'ㄖㄢ', ren: 'ㄖㄣ', rang: 'ㄖㄤ', reng: 'ㄖㄥ', rong: 'ㄖㄨㄥ',
  ru: 'ㄖㄨ', ruo: 'ㄖㄨㄛ', rui: 'ㄖㄨㄟ', ruan: 'ㄖㄨㄢ', run: 'ㄖㄨㄣ',
  // z
  za: 'ㄗㄚ', ze: 'ㄗㄜ', zi: 'ㄗ', zai: 'ㄗㄞ', zei: 'ㄗㄟ', zao: 'ㄗㄠ', zou: 'ㄗㄡ',
  zan: 'ㄗㄢ', zen: 'ㄗㄣ', zang: 'ㄗㄤ', zeng: 'ㄗㄥ', zong: 'ㄗㄨㄥ',
  zu: 'ㄗㄨ', zuo: 'ㄗㄨㄛ', zui: 'ㄗㄨㄟ', zuan: 'ㄗㄨㄢ', zun: 'ㄗㄨㄣ',
  // c
  ca: 'ㄘㄚ', ce: 'ㄘㄜ', ci: 'ㄘ', cai: 'ㄘㄞ', cao: 'ㄘㄠ', cou: 'ㄘㄡ',
  can: 'ㄘㄢ', cen: 'ㄘㄣ', cang: 'ㄘㄤ', ceng: 'ㄘㄥ', cong: 'ㄘㄨㄥ',
  cu: 'ㄘㄨ', cuo: 'ㄘㄨㄛ', cui: 'ㄘㄨㄟ', cuan: 'ㄘㄨㄢ', cun: 'ㄘㄨㄣ',
  // s
  sa: 'ㄙㄚ', se: 'ㄙㄜ', si: 'ㄙ', sai: 'ㄙㄞ', sao: 'ㄙㄠ', sou: 'ㄙㄡ',
  san: 'ㄙㄢ', sen: 'ㄙㄣ', sang: 'ㄙㄤ', seng: 'ㄙㄥ', song: 'ㄙㄨㄥ',
  su: 'ㄙㄨ', suo: 'ㄙㄨㄛ', sui: 'ㄙㄨㄟ', suan: 'ㄙㄨㄢ', sun: 'ㄙㄨㄣ',
};

export function stripTone(pinyin: string): { base: string; tone: number } {
  let tone = 0;
  let base = '';
  for (const ch of pinyin) {
    if (TONE_MARKS[ch]) {
      base += TONE_MARKS[ch][0];
      tone = TONE_MARKS[ch][1];
    } else {
      base += ch;
    }
  }
  return { base: base.toLowerCase(), tone };
}

export function pinyinToZhuyin(pinyin: string): string {
  const { base, tone } = stripTone(pinyin.trim());
  const zhuyin = SYLLABLE_MAP[base];
  if (!zhuyin) return pinyin;
  const toneMark = ZHUYIN_TONE[tone] || '';
  if (tone === 5) return '˙' + zhuyin;
  return zhuyin + toneMark;
}

/** Characters that share pronunciation and need a hint to distinguish */
export const DISAMBIG: Record<string, string> = {
  '她': 'SHE', '他': 'HE', '它': 'IT', '祂': 'GOD', '牠': 'ANIMAL',
  '你': 'HE', '妳': 'SHE',
};
