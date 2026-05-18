import React from 'react';
import { LogOut } from 'lucide-react';

export function Header({ username, systemMode, onSignOut }) {
  return (
    <header className="app-header">
      <div className="brand-info">
        <p className="subtitle">Signed in as</p>
        <h1 className="username">{username}</h1>
      </div>
      
      <div className="header-actions">
        <span className={`mode ${systemMode === 'fabric' ? 'fabric' : 'mock'}`}>
          <span className="dot" />
          {systemMode === 'fabric' ? 'Fabric Network' : 'Mock Gateway'}
        </span>
        
        <button 
          className="icon-button logout-btn" 
          onClick={onSignOut} 
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
