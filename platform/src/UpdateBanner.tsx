/**
 * "New version available" banner. Presentational only: the single SW
 * registration lives in useAppUpdate() (called once in AppInner). This receives
 * the update state via props so useRegisterSW() is never called more than once.
 */
import { useContext } from 'react';
import { LanguageContext } from './i18n/index.ts';

export default function UpdateBanner({ needRefresh, onUpdate, onDismiss }: {
  needRefresh: boolean;
  onUpdate: () => void;
  onDismiss: () => void;
}) {
  const lang = useContext(LanguageContext);

  if (!needRefresh) return null;

  const t = lang === 'zh-TW'
    ? { msg: '有新版本！', update: '立即更新', later: '稍後' }
    : { msg: 'A new version is available', update: 'Update now', later: 'Later' };

  return (
    <div className="update-banner" role="alert">
      <span className="update-banner-msg">🎉 {t.msg}</span>
      <button className="update-banner-update" onClick={onUpdate}>{t.update}</button>
      <button className="update-banner-later" onClick={onDismiss}>{t.later}</button>
    </div>
  );
}
