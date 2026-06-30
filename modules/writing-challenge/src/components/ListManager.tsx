import { useState } from 'react';

interface Props {
  lists: Record<string, string[]>;
  activeList: string;
  onSelectList: (name: string) => void;
  onAddList: (name: string, chars: string[]) => void;
  onDeleteList: (name: string) => void;
}

export function ListManager({ lists, activeList, onSelectList, onAddList, onDeleteList }: Props) {
  const [showImport, setShowImport] = useState(false);
  const [newName, setNewName] = useState('');
  const [newChars, setNewChars] = useState('');

  const handleImport = () => {
    const name = newName.trim();
    if (!name) return;
    const chars = newChars
      .split(/[\n,\s]+/)
      .map(c => c.trim())
      .filter(c => c.length === 1);
    if (chars.length === 0) return;
    onAddList(name, chars);
    setNewName('');
    setNewChars('');
    setShowImport(false);
  };

  return (
    <div className="list-manager">
      <div className="list-selector">
        <select value={activeList} onChange={e => onSelectList(e.target.value)}>
          {Object.keys(lists).map(name => (
            <option key={name} value={name}>
              {name} ({lists[name].length})
            </option>
          ))}
        </select>
        <button className="icon-btn" onClick={() => setShowImport(!showImport)}>
          {showImport ? '✕' : '＋'}
        </button>
        {activeList !== 'default' && (
          <button className="icon-btn delete-btn" onClick={() => onDeleteList(activeList)}>
            🗑
          </button>
        )}
      </div>

      {showImport && (
        <div className="import-panel">
          <input
            type="text"
            placeholder="List name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <textarea
            placeholder="Paste characters (one per line, comma-separated, or space-separated)"
            value={newChars}
            onChange={e => setNewChars(e.target.value)}
            rows={4}
          />
          <button className="import-btn" onClick={handleImport}>Import</button>
        </div>
      )}
    </div>
  );
}
