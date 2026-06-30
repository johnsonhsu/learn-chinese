import { useT } from '../i18n';

export type Page = 'practice' | 'progress' | 'settings' | 'admin' | 'admin-user' | 'admin-system';

interface Props {
  profileName?: string;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onProfileClick?: () => void;
}

export function MenuBar({ profileName, currentPage, onNavigate, onProfileClick }: Props) {
  const t = useT();
  const isAdmin = currentPage.startsWith('admin');

  if (isAdmin) {
    return (
      <nav className="menu-bar">
        <button className="menu-profile" onClick={() => onNavigate('practice')}>
          ← App
        </button>
        <div className="menu-tabs">
          <button className={`menu-tab${currentPage === 'admin' ? ' active' : ''}`} onClick={() => onNavigate('admin')}>
            Users
          </button>
          <button className={`menu-tab${currentPage === 'admin-system' ? ' active' : ''}`} onClick={() => onNavigate('admin-system')}>
            System
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav className="menu-bar">
      <button className="menu-profile" onClick={onProfileClick}>
        {profileName} ▾
      </button>
      <div className="menu-tabs">
        <button className={`menu-tab${currentPage === 'practice' ? ' active' : ''}`} onClick={() => onNavigate('practice')}>
          {t('menu.practice')}
        </button>
        <button className={`menu-tab${currentPage === 'progress' ? ' active' : ''}`} onClick={() => onNavigate('progress')}>
          {t('menu.progress')}
        </button>
        <button className={`menu-tab${currentPage === 'settings' ? ' active' : ''}`} onClick={() => onNavigate('settings')}>
          {t('menu.settings')}
        </button>
        <button className="menu-tab" onClick={() => onNavigate('admin')} style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.6 }}>
          ⚙
        </button>
      </div>
    </nav>
  );
}
