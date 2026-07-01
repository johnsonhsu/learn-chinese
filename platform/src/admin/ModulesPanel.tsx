import { useState, useEffect } from 'react';
import { useOffline } from '../offline/offline-context.tsx';

interface ModuleInfo {
  name: string;
  displayName: string;
  displayNameZh: string;
  icon: string;
  enabled: boolean;
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Build-time module manifests — same glob App.tsx uses to render the module
// grid on-device. Lets the Modules tab list modules with no server running.
interface ModuleManifest {
  name: string;
  displayName: string;
  displayNameZh: string;
  icon: string;
  order: number;
}
const manifestModules = import.meta.glob<{ default: ModuleManifest } | ModuleManifest>(
  '../../../modules/*/module.json',
  { eager: true },
);
function manifestList(): ModuleManifest[] {
  const out: ModuleManifest[] = [];
  for (const mod of Object.values(manifestModules)) {
    const m = ('default' in mod ? mod.default : mod) as ModuleManifest;
    if (m?.name) out.push(m);
  }
  return out.sort((a, b) => a.order - b.order);
}

export function ModulesPanel({ onSelectModule }: { onSelectModule: (_name: string) => void }) {
  const { getModulesConfig } = useOffline();
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    // Dev machine: the Express server owns module_config (read + write).
    // On-device release: no server — read the shipped module_config flags
    // (baked into platform.db) and merge with the build-time manifests.
    if (import.meta.env.DEV) {
      api<ModuleInfo[]>('/admin/modules').then(setModules).finally(() => setLoading(false));
      return;
    }
    const config = getModulesConfig() ?? {};
    setModules(
      manifestList().map(m => ({
        name: m.name,
        displayName: m.displayName,
        displayNameZh: m.displayNameZh,
        icon: m.icon,
        enabled: config[m.name] ?? true, // absent → enabled (matches server default)
      })),
    );
    setLoading(false);
  };

  useEffect(load, []);

  const handleToggle = async (name: string, enabled: boolean) => {
    // Toggling persists only on the dev machine (writes module_config via the
    // server). On-device the shipped flags are read-only — no per-device store.
    await api(`/admin/modules/${name}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
    load();
  };

  if (loading) return <div className="admin-empty">Loading...</div>;

  return (
    <div>
      {modules.length === 0 ? (
        <div className="admin-empty">No modules installed</div>
      ) : (
        <div className="module-toggle-list">
          {modules.map(m => (
            <div
              key={m.name}
              className={`module-toggle-row clickable${m.enabled ? '' : ' disabled'}`}
              onClick={() => onSelectModule(m.name)}
            >
              <span className="module-toggle-icon">{m.icon}</span>
              <div className="module-toggle-info">
                <span className="module-toggle-name">{m.displayName}</span>
                <span className="module-toggle-zh">{m.displayNameZh}</span>
              </div>
              <label className="toggle-switch" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={m.enabled}
                  disabled={!import.meta.env.DEV}
                  onChange={e => handleToggle(m.name, e.target.checked)}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
