const BASE = '/api/word-sets';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export interface Category {
  id: number;
  nameZh: string;
  nameEn: string;
  icon: string;
  color: string;
  sortOrder: number;
  wordCount: number;
}

export interface CategoryWord {
  id: number;
  categoryId: number;
  word: string;
  definition: string;
  zhuyin: string;
  pinyin: string;
  sortOrder: number;
}

export const getCategories = () => request<Category[]>('/categories');

export const getCategoryWords = (categoryId: number) =>
  request<CategoryWord[]>(`/categories/${categoryId}/words`);

