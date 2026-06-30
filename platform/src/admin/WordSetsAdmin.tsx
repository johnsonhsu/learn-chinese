import { useState, useEffect, useCallback } from 'react';
import { SettingsGroup } from '../components/SettingsGroup.tsx';

const BASE = '/api/word-sets';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

interface Category {
  id: number;
  nameZh: string;
  nameEn: string;
  icon: string;
  color: string;
  sortOrder: number;
  wordCount: number;
}

interface CategoryWord {
  id: number;
  word: string;
  definition: string;
  zhuyin: string;
  pinyin: string;
  tocflLevel?: string;
}

interface DictResult {
  word: string;
  definition: string;
  grammar: string;
  level: string;
  zhuyin: string;
  pinyin: string;
}

export function WordSetsAdmin() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newZh, setNewZh] = useState('');
  const [newEn, setNewEn] = useState('');
  const [newIcon, setNewIcon] = useState('');
  const [newColor, setNewColor] = useState('#4a90d9');

  const load = useCallback(() => {
    api<Category[]>('/categories').then(setCategories);
  }, []);

  useEffect(load, [load]);

  const handleCreate = () => {
    if (!newZh.trim() || !newEn.trim()) return;
    api('/admin/categories', {
      method: 'POST',
      body: JSON.stringify({ nameZh: newZh, nameEn: newEn, icon: newIcon, color: newColor }),
    }).then(() => {
      setNewZh(''); setNewEn(''); setNewIcon(''); setNewColor('#4a90d9');
      load();
    });
  };

  const handleDelete = (id: number) => {
    api(`/admin/categories/${id}`, { method: 'DELETE' }).then(load);
  };

  return (
    <div className="sa-admin">
      <SettingsGroup title="Categories" count={categories.length}>
        {/* Add new */}
        <div className="sa-add-section">
          <div className="sa-add-row">
            <input placeholder="中文名" value={newZh} onChange={e => setNewZh(e.target.value)} className="sa-input" style={{ width: 100 }} />
            <input placeholder="English" value={newEn} onChange={e => setNewEn(e.target.value)} className="sa-input" style={{ width: 120 }} />
            <input placeholder="Icon" value={newIcon} onChange={e => setNewIcon(e.target.value)} className="sa-input" style={{ width: 50 }} />
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={{ width: 36, height: 32, border: 'none', background: 'none', cursor: 'pointer' }} />
            <button className="sa-add-btn" onClick={handleCreate}>+</button>
          </div>
        </div>

        {/* List */}
        {categories.map(cat => (
          <CategoryEditor key={cat.id} category={cat} onDelete={() => handleDelete(cat.id)} onUpdate={load} />
        ))}
      </SettingsGroup>
    </div>
  );
}

function CategoryEditor({ category, onDelete, onUpdate }: { category: Category; onDelete: () => void; onUpdate: () => void }) {
  const [words, setWords] = useState<CategoryWord[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DictResult[]>([]);
  const [manualWord, setManualWord] = useState('');
  const [manualDef, setManualDef] = useState('');
  const [manualZhuyin, setManualZhuyin] = useState('');
  const [manualPinyin, setManualPinyin] = useState('');

  const loadWords = useCallback(() => {
    api<CategoryWord[]>(`/categories/${category.id}/words`).then(setWords);
  }, [category.id]);

  useEffect(() => {
    if (expanded) loadWords();
  }, [expanded, loadWords]);

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    api<DictResult[]>(`/admin/dict-search?q=${encodeURIComponent(searchQuery)}`).then(setSearchResults);
  }, [searchQuery]);

  const addFromDict = (r: DictResult) => {
    api(`/admin/categories/${category.id}/words`, {
      method: 'POST',
      body: JSON.stringify({ word: r.word, definition: r.definition, zhuyin: r.zhuyin || '', pinyin: r.pinyin || '' }),
    }).then(() => { loadWords(); onUpdate(); });
  };

  const addManual = () => {
    if (!manualWord.trim()) return;
    api(`/admin/categories/${category.id}/words`, {
      method: 'POST',
      body: JSON.stringify({ word: manualWord, definition: manualDef, zhuyin: manualZhuyin, pinyin: manualPinyin }),
    }).then(() => {
      setManualWord(''); setManualDef(''); setManualZhuyin(''); setManualPinyin('');
      loadWords(); onUpdate();
    });
  };

  const moveWord = (index: number, dir: number) => {
    const newWords = [...words];
    const target = index + dir;
    if (target < 0 || target >= newWords.length) return;
    [newWords[index], newWords[target]] = [newWords[target], newWords[index]];
    setWords(newWords);
    const wordIds = newWords.map(w => w.id);
    api(`/admin/categories/${category.id}/reorder`, {
      method: 'PUT',
      body: JSON.stringify({ wordIds }),
    });
  };

  const removeWord = (wordId: number) => {
    api(`/admin/categories/${category.id}/words/${wordId}`, { method: 'DELETE' }).then(() => { loadWords(); onUpdate(); });
  };

  return (
    <div className="ws-admin-cat">
      <div className="ws-admin-cat-header" onClick={() => setExpanded(!expanded)}>
        <span className="ws-admin-cat-icon">{category.icon}</span>
        <span className="ws-admin-cat-name" style={{ color: category.color }}>
          {category.nameZh} — {category.nameEn}
        </span>
        <span className="ws-admin-cat-count">{category.wordCount}</span>
        <button className="sa-delete-btn" onClick={e => { e.stopPropagation(); onDelete(); }}>✕</button>
      </div>

      {expanded && (
        <div className="ws-admin-cat-body">
          {/* Dictionary search */}
          <div className="ws-admin-search">
            <input
              placeholder="Search dictionary..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="sa-input"
              style={{ flex: 1 }}
            />
            <button className="sa-add-btn" onClick={handleSearch}>🔍</button>
          </div>

          {searchResults.length > 0 && (
            <div className="ws-admin-search-results">
              {searchResults.map((r, i) => (
                <div key={i} className="ws-admin-search-row">
                  <span className="ws-admin-search-word">{r.word}</span>
                  <span className="ws-admin-search-def">{r.definition?.slice(0, 40)}</span>
                  <span className="ws-admin-search-level">{r.level}</span>
                  <button className="sa-add-btn" onClick={() => addFromDict(r)}>+</button>
                </div>
              ))}
            </div>
          )}

          {/* Manual add */}
          <div className="ws-admin-manual">
            <input placeholder="Word" value={manualWord} onChange={e => setManualWord(e.target.value)} className="sa-input" style={{ width: 80 }} />
            <input placeholder="Definition" value={manualDef} onChange={e => setManualDef(e.target.value)} className="sa-input" style={{ flex: 1 }} />
            <input placeholder="Zhuyin" value={manualZhuyin} onChange={e => setManualZhuyin(e.target.value)} className="sa-input" style={{ width: 80 }} />
            <input placeholder="Pinyin" value={manualPinyin} onChange={e => setManualPinyin(e.target.value)} className="sa-input" style={{ width: 80 }} />
            <button className="sa-add-btn" onClick={addManual}>+</button>
          </div>

          {/* Word list */}
          <div className="ws-admin-words">
            {words.map((w, i) => (
              <div key={w.id} className="ws-admin-word-row">
                <div className="ws-admin-word-arrows">
                  <button
                    className="ws-arrow-btn"
                    disabled={i === 0}
                    onClick={() => moveWord(i, -1)}
                  >▲</button>
                  <button
                    className="ws-arrow-btn"
                    disabled={i === words.length - 1}
                    onClick={() => moveWord(i, 1)}
                  >▼</button>
                </div>
                <span className="ws-admin-word-char">{w.word}</span>
                <span className="ws-admin-word-zhuyin">{w.zhuyin}</span>
                <span className="ws-admin-word-def">{w.definition}</span>
                {w.tocflLevel && <span className="ws-admin-word-level">{w.tocflLevel}</span>}
                <button className="sa-delete-btn" onClick={() => removeWord(w.id)}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
