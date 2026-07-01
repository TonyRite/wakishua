import React from 'react';
import { useT } from '../i18n/LanguageContext.jsx';
import { LANGUAGES } from '../i18n/translations.js';

export default function LanguageToggle({ block = false }) {
  const { lang, setLang } = useT();
  return (
    <div className={`lang-toggle ${block ? 'lang-toggle-block' : ''}`} role="group" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`lang-btn ${lang === l.code ? 'active' : ''}`}
          aria-pressed={lang === l.code}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
