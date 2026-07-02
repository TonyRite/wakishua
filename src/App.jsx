import React, { useState, useEffect, useRef } from 'react';
import { useT } from './i18n/LanguageContext.jsx';
import { CATEGORIES, HERO_PROMPTS } from './i18n/translations.js';
import { categoryLabel, msUntilExpiry } from './utils/format.js';
import LanguageToggle from './components/LanguageToggle.jsx';
import BottomSheet from './components/BottomSheet.jsx';
import CategoryCard from './components/CategoryCard.jsx';
import PostCard from './components/PostCard.jsx';
import Skeleton from './components/Skeleton.jsx';
import Toast from './components/Toast.jsx';
import MapPicker from './components/MapPicker.jsx';
import InstallPrompt from './components/InstallPrompt.jsx';

const CONTACT_STORE = 'wakishua_contact';
const COORDS_STORE = 'wakishua_coords';

// Last known location (from a previous visit) so we default to the user's real
// area immediately, before a fresh GPS fix lands. Falls back to Dar es Salaam.
function initialCoords() {
  try {
    const saved = JSON.parse(localStorage.getItem(COORDS_STORE) || 'null');
    if (saved && typeof saved.lat === 'number' && typeof saved.lon === 'number') return saved;
  } catch { /* ignore */ }
  return { lat: -6.7924, lon: 39.2083 };
}

export default function App() {
  const { t, lang } = useT();

  // Geolocation (user's current position)
  const [coords, setCoords] = useState(initialCoords);

  // Navigation
  const [activeView, setActiveView] = useState('home');
  const [showAllCategories, setShowAllCategories] = useState(false);

  // Feed
  const [posts, setPosts] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('');

  // Hero rotation
  const [heroIndex, setHeroIndex] = useState(0);

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Post sheet
  const [showPostSheet, setShowPostSheet] = useState(false);
  const [postType, setPostType] = useState('request');
  const [postStep, setPostStep] = useState(1);
  const [postCategory, setPostCategory] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [postDetails, setPostDetails] = useState('');
  const [postName, setPostName] = useState('');
  const [postPhone, setPostPhone] = useState('');
  const [postLat, setPostLat] = useState(coords.lat);
  const [postLon, setPostLon] = useState(coords.lon);
  const [postArea, setPostArea] = useState('');
  const [postAddress, setPostAddress] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [postBudgetType, setPostBudgetType] = useState('flexible');
  const [postBudgetAmount, setPostBudgetAmount] = useState('');
  const [postExpiry, setPostExpiry] = useState('1440');

  const geocodeTimer = useRef(null);

  // ---------------------------------------------------------------
  // Boot: GPS + remembered contact
  // ---------------------------------------------------------------
  useEffect(() => {
    // Use the user's real location by default on every launch.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => saveCoords(+pos.coords.latitude.toFixed(6), +pos.coords.longitude.toFixed(6)),
        () => console.warn('GPS unavailable, using last-known / default coords.'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }
    try {
      const saved = JSON.parse(localStorage.getItem(CONTACT_STORE) || '{}');
      if (saved.name) setPostName(saved.name);
      if (saved.phone) setPostPhone(saved.phone);
    } catch { /* ignore */ }
  }, []);

  // Rotate the hero prompt every 4s.
  useEffect(() => {
    const id = setInterval(() => {
      setHeroIndex((i) => (i + 1) % HERO_PROMPTS[lang].length);
    }, 4000);
    return () => clearInterval(id);
  }, [lang]);

  // ---------------------------------------------------------------
  // Feed
  // ---------------------------------------------------------------
  useEffect(() => {
    if (activeView === 'browse') syncPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, filterType, filterCategory, coords]);

  // While browsing, drop expired posts locally every 20s and re-pull the fresh
  // (server-side already excludes expired) feed each minute — so jobs auto-vanish.
  useEffect(() => {
    if (activeView !== 'browse') return;
    const prune = setInterval(() => {
      setPosts((prev) => prev.filter((p) => msUntilExpiry(p.expires_at) > 0));
    }, 20000);
    const refetch = setInterval(() => syncPosts(), 60000);
    return () => { clearInterval(prune); clearInterval(refetch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, filterType, filterCategory]);

  const syncPosts = async () => {
    setLoadingFeed(true);
    try {
      const params = new URLSearchParams({ lat: coords.lat, lon: coords.lon, radius_km: '25' });
      if (filterType !== 'all') params.set('type', filterType);
      if (filterCategory) params.set('category', filterCategory);
      const res = await fetch(`/api/posts?${params.toString()}`);
      const data = await res.json();
      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch posts failed:', err);
    } finally {
      setLoadingFeed(false);
    }
  };

  // Update current location and remember it for next launch.
  const saveCoords = (lat, lon) => {
    setCoords({ lat, lon });
    try { localStorage.setItem(COORDS_STORE, JSON.stringify({ lat, lon })); } catch { /* ignore */ }
  };

  // ---------------------------------------------------------------
  // Reverse geocoding (server-proxied, cached)
  // ---------------------------------------------------------------
  const reverseGeocode = async (lat, lon) => {
    setGeocoding(true);
    try {
      const res = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lon}`);
      const data = await res.json();
      if (data.location_name) setPostArea(data.location_name);
      if (data.address) setPostAddress(data.address);
    } catch (err) {
      console.error('Reverse geocode failed:', err);
    } finally {
      setGeocoding(false);
    }
  };

  const handlePinChange = ({ lat, lon }) => {
    setPostLat(lat);
    setPostLon(lon);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(() => reverseGeocode(lat, lon), 600);
  };

  // Request a fresh, high-accuracy GPS fix (must be user-initiated on mobile).
  // On success it pins the *exact* coordinates and reverse-geocodes the area.
  const requestGps = ({ silent = false } = {}) => {
    if (!('geolocation' in navigator)) {
      if (!silent) addToast(t('toast_gps_unavailable'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = +pos.coords.latitude.toFixed(6);
        const lon = +pos.coords.longitude.toFixed(6);
        saveCoords(lat, lon);
        setPostLat(lat);
        setPostLon(lon);
        reverseGeocode(lat, lon);
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        if (!silent) addToast(err.code === 1 ? t('toast_gps_denied') : t('toast_gps_unavailable'));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  const useMyLocation = () => requestGps();

  // ---------------------------------------------------------------
  // Post creation
  // ---------------------------------------------------------------
  const openPostSheet = (type, category = '') => {
    setPostType(type);
    setPostCategory(category);
    setPostTitle('');
    setPostDetails('');
    setPostStep(1);
    setPostLat(coords.lat);
    setPostLon(coords.lon);
    setPostArea('');
    setPostAddress('');
    setPostBudgetType('flexible');
    setPostBudgetAmount('');
    setPostExpiry('1440');
    setShowPostSheet(true);
    // Auto-capture the user's real location (this call rides the tap gesture, so
    // mobile browsers will honour the permission prompt).
    requestGps({ silent: true });
  };

  const handlePublishPost = async (e) => {
    e.preventDefault();
    if (submitting) return; // guard against double-submit
    if (!postTitle.trim()) { addToast(t('toast_need_title')); return; }
    if (!postPhone.trim()) { addToast(t('toast_need_phone')); return; }

    try {
      localStorage.setItem(CONTACT_STORE, JSON.stringify({ name: postName, phone: postPhone }));
    } catch { /* ignore */ }

    setSubmitting(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_type: postType,
          category: postCategory || null,
          title: postTitle,
          details: postDetails,
          contact_name: postName,
          contact_phone: postPhone,
          lat: postLat,
          lon: postLon,
          location_name: postArea,
          address: postAddress,
          budget_type: postBudgetType,
          budget_amount: postBudgetType === 'fixed' ? parseFloat(postBudgetAmount) : null,
          expiry_mins: parseInt(postExpiry)
        })
      });
      const data = await res.json();
      if (data.error) addToast(`❌ ${data.error}`);
      else {
        addToast(t('toast_posted'));
        setShowPostSheet(false);
        setFilterType('all');
        setFilterCategory('');
        setActiveView('browse');
        syncPosts();
      }
    } catch (err) {
      addToast(t('toast_network'));
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  const addToast = (message, onClickAction = null) => {
    const id = Math.random();
    setToasts((prev) => [...prev, { id, message, onClick: onClickAction }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4500);
  };

  const dismissToast = (id) => setToasts((prev) => prev.filter((x) => x.id !== id));

  const visibleCategories = showAllCategories ? CATEGORIES : CATEGORIES.filter((c) => c.featured);

  const titlePlaceholder = postType === 'offer' ? t('title_ph_offer') : t('title_ph_request');
  const detailsPlaceholder = postType === 'offer' ? t('details_ph_offer') : t('details_ph_request');

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------
  return (
    <>
      <header className="app-header">
        <div className="logo-container" onClick={() => setActiveView('home')} style={{ cursor: 'pointer' }}>
          <span className="logo-icon" aria-hidden="true">🌊</span>
          <span className="logo-text">wakishua</span>
        </div>
        <div className="header-right">
          <LanguageToggle />
        </div>
      </header>

      <main id="app-content">
        {/* HOME */}
        {activeView === 'home' && (
          <section className="app-view">
            <div className="welcome-banner">
              <p className="welcome-eyebrow">{t('home_greeting_guest')} 👋</p>
              <h1 className="welcome-heading hero-rotate" key={heroIndex}>
                {HERO_PROMPTS[lang][heroIndex]}
              </h1>
              <p className="welcome-sub">{t('home_sub')}</p>
            </div>

            <div className="category-grid">
              {visibleCategories.map((c) => (
                <CategoryCard
                  key={c.key}
                  icon={c.icon}
                  label={categoryLabel(c.key, t)}
                  onClick={() => openPostSheet('request', c.key)}
                />
              ))}
              <CategoryCard
                icon="✨"
                label={t('custom_label')}
                onClick={() => openPostSheet('request', '')}
              />
            </div>

            <button className="btn-text-toggle" onClick={() => setShowAllCategories((v) => !v)}>
              {showAllCategories ? t('home_view_less') : t('home_view_all')}
            </button>

            <div className="offer-card">
              <p className="offer-card-prompt">{t('home_offer_prompt')}</p>
              <button className="btn btn-outline w-100" onClick={() => openPostSheet('offer', '')}>
                {t('home_offer_cta')}
              </button>
            </div>

            <div className="home-secondary-action">
              <button className="btn btn-secondary w-100" onClick={() => setActiveView('browse')}>
                {t('home_browse_cta')}
              </button>
            </div>
          </section>
        )}

        {/* BROWSE */}
        {activeView === 'browse' && (
          <section className="app-view">
            <h2 className="view-title">{t('browse_title')}</h2>

            <div className="filter-bar">
              <div className="seg-control">
                {[['all', t('filter_all')], ['request', t('filter_needs')], ['offer', t('filter_offers')]].map(([val, label]) => (
                  <button
                    key={val}
                    className={`seg-btn ${filterType === val ? 'active' : ''}`}
                    onClick={() => setFilterType(val)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="filter-bar mt-2">
              <select className="form-control btn-sm w-100" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="">{t('all_services')}</option>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{categoryLabel(c.key, t)}</option>
                ))}
              </select>
            </div>

            <div className="post-list mt-3">
              {(() => {
                if (loadingFeed) return <Skeleton count={4} />;
                const live = posts.filter((p) => msUntilExpiry(p.expires_at) > 0);
                if (live.length === 0) return <div className="empty-state">{t('no_posts')}</div>;
                return live.map((p) => <PostCard key={p.id} post={p} t={t} />);
              })()}
            </div>
          </section>
        )}
      </main>

      {/* FLOATING POST BUTTON */}
      <button className="fab" onClick={() => openPostSheet('request', '')} aria-label={t('post_request_title')}>
        ＋
      </button>

      {/* BOTTOM NAV */}
      <nav className="bottom-nav">
        <button className={`nav-item ${activeView === 'home' ? 'active' : ''}`} onClick={() => setActiveView('home')}>
          <span className="nav-icon" aria-hidden="true">🏠</span>
          <span className="nav-label">{t('nav_home')}</span>
        </button>
        <button className={`nav-item ${activeView === 'browse' ? 'active' : ''}`} onClick={() => setActiveView('browse')}>
          <span className="nav-icon" aria-hidden="true">🔍</span>
          <span className="nav-label">{t('nav_browse')}</span>
        </button>
      </nav>

      {/* POST SHEET */}
      <BottomSheet
        open={showPostSheet}
        onClose={() => setShowPostSheet(false)}
        title={postType === 'offer' ? t('post_offer_title') : t('post_request_title')}
      >
        {/* The type (request vs offer) is chosen at the entry point, so the sheet
            goes straight into the form — no redundant toggle. */}
        <p className="sheet-desc post-type-note">
          {postType === 'offer' ? t('post_offer_note') : t('post_request_note')}
        </p>

        <form onSubmit={handlePublishPost}>
          {postStep === 1 && (
            <div className="task-step active">
              <div className="form-group">
                <label>{t('field_title')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  placeholder={titlePlaceholder}
                  required
                />
              </div>

              <div className="form-group">
                <label>{t('category')}</label>
                <select className="form-control" value={postCategory} onChange={(e) => setPostCategory(e.target.value)}>
                  <option value="">{t('custom_label')}</option>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{categoryLabel(c.key, t)}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>{t('field_details')}</label>
                <textarea
                  className="form-control"
                  rows="3"
                  value={postDetails}
                  onChange={(e) => setPostDetails(e.target.value)}
                  placeholder={detailsPlaceholder}
                ></textarea>
              </div>

              <button
                type="button"
                className="btn btn-primary w-100 mt-2"
                onClick={() => {
                  if (!postTitle.trim()) { addToast(t('toast_need_title')); return; }
                  setPostStep(2);
                  if (!postArea) reverseGeocode(postLat, postLon);
                }}
              >
                {t('next_location')}
              </button>
            </div>
          )}

          {postStep === 2 && (
            <div className="task-step active">
              <h4 className="step-subtitle">{t('location_step')}</h4>
              <p className="sheet-desc">{t('location_hint')}</p>
              <MapPicker
                lat={postLat}
                lon={postLon}
                onChange={handlePinChange}
                onLocate={useMyLocation}
                locating={locating}
                locateLabel={t('use_my_location')}
              />
              <div className="form-group mt-2">
                <label>{t('area_name')}</label>
                <input
                  type="text"
                  className="form-control"
                  value={postArea}
                  onChange={(e) => setPostArea(e.target.value)}
                  placeholder={geocoding ? t('area_placeholder') : t('area_name')}
                />
              </div>
              <button type="button" className="btn btn-outline btn-sm w-100" onClick={useMyLocation} disabled={locating}>
                {locating ? t('locating') : t('use_my_location')}
              </button>
              <div className="d-flex justify-between gap-2 mt-3">
                <button type="button" className="btn btn-outline w-45" onClick={() => setPostStep(1)}>⬅️ {t('back')}</button>
                <button type="button" className="btn btn-primary w-45" onClick={() => setPostStep(3)}>{t('next_budget')}</button>
              </div>
            </div>
          )}

          {postStep === 3 && (
            <div className="task-step active">
              <h4 className="step-subtitle">{t('budget_expiry')}</h4>

              <div className="form-group">
                <label>{t('field_name')}</label>
                <input type="text" className="form-control" value={postName} onChange={(e) => setPostName(e.target.value)} placeholder={t('name_ph')} />
              </div>
              <div className="form-group">
                <label>{t('field_phone')}</label>
                <input type="tel" className="form-control" value={postPhone} onChange={(e) => setPostPhone(e.target.value)} placeholder="+255700000000" required />
                <p className="field-hint">{t('phone_hint')}</p>
              </div>

              <div className="form-group">
                <label>{t('budget_type')}</label>
                <div className="budget-type-select">
                  <button type="button" className={`btn btn-secondary w-50 ${postBudgetType === 'flexible' ? 'active' : ''}`} onClick={() => setPostBudgetType('flexible')}>
                    {t('flexible')}
                  </button>
                  <button type="button" className={`btn btn-secondary w-50 ${postBudgetType === 'fixed' ? 'active' : ''}`} onClick={() => setPostBudgetType('fixed')}>
                    {t('fixed_amount')}
                  </button>
                </div>
              </div>

              {postBudgetType === 'fixed' && (
                <div className="form-group">
                  <label>{t('amount_tzs')}</label>
                  <input type="number" className="form-control" value={postBudgetAmount} onChange={(e) => setPostBudgetAmount(e.target.value)} placeholder={t('amount_placeholder')} required />
                </div>
              )}

              <div className="form-group">
                <label>{t('expires_in')}</label>
                <select className="form-control" value={postExpiry} onChange={(e) => setPostExpiry(e.target.value)}>
                  <option value="60">{t('exp_60')}</option>
                  <option value="180">{t('exp_180')}</option>
                  <option value="1440">{t('exp_1440')}</option>
                </select>
              </div>

              <div className="d-flex justify-between gap-2 mt-3">
                <button type="button" className="btn btn-outline w-45" onClick={() => setPostStep(2)} disabled={submitting}>⬅️ {t('back')}</button>
                <button type="submit" className="btn btn-primary w-45" disabled={submitting}>
                  {submitting ? <><span className="btn-spinner" aria-hidden="true"></span>{t('posting')}</> : t('post_publish')}
                </button>
              </div>
            </div>
          )}
        </form>
      </BottomSheet>

      {/* PWA INSTALL */}
      <InstallPrompt />

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={dismissToast} />
        ))}
      </div>
    </>
  );
}
