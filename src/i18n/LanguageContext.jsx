import React, { createContext, useContext, useState, useCallback } from 'react';
import { dictionaries } from './translations.js';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'wakishua_lang';

function detectInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'sw') return saved;
  } catch {
    /* localStorage unavailable */
  }
  const nav = (navigator.language || 'en').toLowerCase();
  return nav.startsWith('sw') ? 'sw' : 'en';
}

// Interpolate {placeholders} in a translation string.
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? String(vars[key]) : m));
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(detectInitialLang);

  const setLang = useCallback((next) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = next;
  }, []);

  const t = useCallback(
    (key, vars) => {
      const dict = dictionaries[lang] || dictionaries.en;
      const value = dict[key] ?? dictionaries.en[key] ?? key;
      return interpolate(value, vars);
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useT must be used within a LanguageProvider');
  return ctx;
}
