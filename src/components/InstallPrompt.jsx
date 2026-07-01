import React, { useState, useEffect } from 'react';
import { useT } from '../i18n/LanguageContext.jsx';

const DISMISS_KEY = 'wakishua_install_dismissed';

// Reliable PWA install UX:
//  • Chrome/Android/desktop: capture `beforeinstallprompt`, show our own button,
//    and call prompt() on a user gesture (the browser no longer auto-pops a banner).
//  • iOS Safari: no `beforeinstallprompt` exists, so show manual "Add to Home
//    Screen" instructions instead.
export default function InstallPrompt() {
  const { t } = useT();
  const [deferred, setDeferred] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (standalone) return; // already installed

    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* ignore */ }
    if (dismissed) return;

    const ua = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(ua) && !window.MSStream;
    const isSafari = ios && /safari/.test(ua) && !/crios|fxios/.test(ua);

    const onBIP = (e) => {
      e.preventDefault();
      setDeferred(e);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBIP);

    const onInstalled = () => {
      setVisible(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    // iOS gets manual instructions (only in Safari, where Add-to-Home-Screen exists).
    if (isSafari) {
      setIsIOS(true);
      setVisible(true);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBIP);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch { /* ignore */ }
    setDeferred(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="install-banner" role="dialog" aria-label={t('install_title')}>
      <div className="install-banner-icon" aria-hidden="true">🌊</div>
      <div className="install-banner-text">
        <strong>{isIOS ? t('install_ios_title') : t('install_title')}</strong>
        <span>{isIOS ? t('install_ios_body') : t('install_body')}</span>
      </div>
      <div className="install-banner-actions">
        {!isIOS && (
          <button className="btn btn-primary btn-sm" onClick={install}>{t('install_btn')}</button>
        )}
        <button className="install-banner-close" onClick={dismiss} aria-label={t('install_dismiss')}>✕</button>
      </div>
    </div>
  );
}
