import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { createPortal } from 'react-dom';

// --- Debug Data Provider ---
// Modules push lines of debug data. Platform renders them.

interface DebugLine {
  label: string;
  value: string;
  color?: string;
}

interface DebugContextType {
  setLines: (_lines: DebugLine[]) => void;
}

const DebugContext = createContext<DebugContextType>({ setLines: () => {} });

export function useDebug() {
  return useContext(DebugContext);
}

// --- Debug Overlay Component ---

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [lines, setLinesState] = useState<DebugLine[]>([]);

  const setLines = useCallback((newLines: DebugLine[]) => {
    setLinesState(newLines);
  }, []);

  // Check platform setting
  useEffect(() => {
    fetch('/api/platform-settings')
      .then(r => r.ok ? r.json() : null)
      .then(s => { if (s) setEnabled(s.debug_overlay === 'true'); })
      .catch(() => {});
  }, []);

  if (!enabled) {
    return (
      <DebugContext.Provider value={{ setLines }}>
        {children}
      </DebugContext.Provider>
    );
  }

  return (
    <DebugContext.Provider value={{ setLines }}>
      {children}
      {createPortal(
        expanded ? (
          <div className="debug-overlay">
            <button className="debug-close" onClick={() => setExpanded(false)}>&#10005;</button>
            {lines.length > 0 ? lines.map((l, i) => (
              <div key={i} className="debug-line">
                {l.label && <span className="debug-line-label" style={l.color ? { color: l.color } : undefined}>{l.label}</span>}
                <span style={l.color ? { color: l.color } : undefined}>{l.value}</span>
              </div>
            )) : (
              <div className="debug-line"><span>No data</span></div>
            )}
          </div>
        ) : (
          <button className="debug-icon" onClick={() => setExpanded(true)}>
            <span className="debug-bubble">?</span>
          </button>
        ),
        document.body,
      )}
    </DebugContext.Provider>
  );
}
