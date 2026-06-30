import { useContext, type CSSProperties } from 'react';
import { ModuleScreen } from '@platform/ui/index.ts';
import { useT, LanguageContext } from '../i18n/index.ts';
import type { Category } from '../utils/api.ts';

interface Props {
  categories: Category[];
  onSelect: (cat: Category) => void;
  /** Exit the module back to home. Shown only at this top level — the word list
   *  has its own ◀ header, so it carries no top back arrow. */
  onBack?: () => void;
}

export function CategoryGrid({ categories, onSelect, onBack }: Props) {
  const t = useT();
  const lang = useContext(LanguageContext);

  return (
    // Shared module main-screen shell: renders the back pill (only because we
    // pass onBack) + the cream `.module-tile` card + the localized title (the
    // module name, shown in the single chosen UI language). The vivid candy
    // category cards stay module-specific.
    <ModuleScreen
      title={lang === 'zh-TW' ? t('moduleNameZh') : t('moduleNameEn')}
      onBack={onBack}
      backLabel={t('back')}
      cardClassName="ws-tile"
    >
      {categories.length === 0 ? (
        <div className="ws-page-empty">{t('empty')}</div>
      ) : (
        <div className="ws-grid">
          {categories.map(cat => (
            <button
              key={cat.id}
              className="ws-card"
              style={{ '--ws-color': cat.color } as CSSProperties}
              onClick={() => onSelect(cat)}
            >
              {cat.icon && (
                <span className="ws-card-icon-circle">
                  <span className="ws-card-icon">{cat.icon}</span>
                </span>
              )}
              <span className="ws-card-name-zh">{cat.nameZh}</span>
              <span className="ws-card-name-en">{cat.nameEn}</span>
              <span className="ws-card-count">{cat.wordCount} {t('words')}</span>
            </button>
          ))}
        </div>
      )}
    </ModuleScreen>
  );
}
