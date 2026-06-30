import { useState, useEffect } from 'react';
import { UsersPanel } from './UsersPanel.tsx';
import { ModulesPanel } from './ModulesPanel.tsx';
import { SqlBrowser } from './SqlBrowser.tsx';
import { DictionaryPanel } from './DictionaryPanel.tsx';
import { StrokePracticeAdmin } from './StrokePracticeAdmin.tsx';
import { WordSetsAdmin } from './WordSetsAdmin.tsx';
import { SentenceBankPanel } from './SentenceBankPanel.tsx';
import { FeedbackPanel } from './FeedbackPanel.tsx';

type Tab = 'users' | 'modules' | 'dictionary' | 'sql' | 'bank' | 'feedback';

const moduleAdminComponents: Record<string, React.ComponentType> = {
  'writing-challenge': StrokePracticeAdmin,
  'word-sets': WordSetsAdmin,
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export default function AdminPage({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('users');
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  const [debugOn, setDebugOn] = useState(false);

  useEffect(() => {
    api<Record<string, string>>('/platform-settings').then(s => setDebugOn(s.debug_overlay === 'true')).catch(() => {});
  }, []);

  const toggleDebug = async () => {
    const next = !debugOn;
    await api('/platform-settings', { method: 'PATCH', body: JSON.stringify({ debug_overlay: next ? 'true' : 'false' }) });
    setDebugOn(next);
  };

  if (selectedModule) {
    const ModuleAdmin = moduleAdminComponents[selectedModule];
    return (
      <div className="admin-page admin-console">
        <div className="admin-header">
          <button className="back-btn" onClick={() => setSelectedModule(null)}>← Modules</button>
          <h2>{selectedModule}</h2>
        </div>
        {ModuleAdmin ? <ModuleAdmin /> : <div className="admin-empty">No settings for this module</div>}
      </div>
    );
  }

  return (
    <div className="admin-page admin-console">
      <div className="admin-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Admin</h2>
        <button className={`admin-debug-toggle${debugOn ? ' on' : ''}`} onClick={toggleDebug} title="Debug Overlay">
          &#9881; {debugOn ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="admin-tabs">
        <button className={`admin-tab${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}>
          Users
        </button>
        <button className={`admin-tab${tab === 'modules' ? ' active' : ''}`} onClick={() => setTab('modules')}>
          Modules
        </button>
        <button className={`admin-tab${tab === 'dictionary' ? ' active' : ''}`} onClick={() => setTab('dictionary')}>
          Dictionary
        </button>
        <button className={`admin-tab${tab === 'sql' ? ' active' : ''}`} onClick={() => setTab('sql')}>
          SQL
        </button>
        <button className={`admin-tab${tab === 'bank' ? ' active' : ''}`} onClick={() => setTab('bank')}>
          Sentence Bank
        </button>
        <button className={`admin-tab${tab === 'feedback' ? ' active' : ''}`} onClick={() => setTab('feedback')}>
          Feedback
        </button>
      </div>
      <div className="admin-content">
        {tab === 'users' && <UsersPanel />}
        {tab === 'modules' && <ModulesPanel onSelectModule={setSelectedModule} />}
        {tab === 'dictionary' && <DictionaryPanel />}
        {tab === 'sql' && <SqlBrowser />}
        {tab === 'bank' && <SentenceBankPanel />}
        {tab === 'feedback' && <FeedbackPanel />}
      </div>
    </div>
  );
}
