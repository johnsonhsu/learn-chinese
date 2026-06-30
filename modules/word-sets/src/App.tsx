import { useState, useEffect, useCallback } from 'react';
import { getCategories, getCategoryWords } from './utils/api.ts';
import type { Category, CategoryWord } from './utils/api.ts';
import { useOffline } from '@platform/offline/offline-context.tsx';
import { LanguageContext, useT } from './i18n/index.ts';
import type { Language } from './i18n/index.ts';
import { CategoryGrid } from './pages/CategoryGrid.tsx';
import { WordList } from './pages/WordList.tsx';
import './App.css';

export default function App({ userId, language, onExit }: { userId: number; language: Language; onExit?: () => void }) {
  const { dataLayer } = useOffline();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [words, setWords] = useState<CategoryWord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Local-first: read from the on-device word-sets content when ready.
    const load = dataLayer
      ? Promise.resolve(dataLayer.getWordSetCategories())
      : getCategories();
    load.then(setCategories).catch(console.error).finally(() => setLoading(false));
  }, [dataLayer]);

  const handleSelectCategory = useCallback((cat: Category) => {
    setSelectedCategory(cat);
    const load = dataLayer
      ? Promise.resolve(dataLayer.getWordSetCategoryWords(cat.id))
      : getCategoryWords(cat.id);
    load.then(setWords).catch(console.error);
  }, [dataLayer]);

  const handleBack = useCallback(() => {
    setSelectedCategory(null);
    setWords([]);
  }, []);

  return (
    <LanguageContext.Provider value={language}>
      {loading ? (
        <LoadingView />
      ) : selectedCategory ? (
        <WordList
          userId={userId}
          category={selectedCategory}
          words={words}
          onBack={handleBack}
        />
      ) : (
        <CategoryGrid
          categories={categories}
          onSelect={handleSelectCategory}
          onBack={onExit}
        />
      )}
    </LanguageContext.Provider>
  );
}

function LoadingView() {
  const t = useT();
  return <div className="ws-page-empty">{t('loading')}</div>;
}
