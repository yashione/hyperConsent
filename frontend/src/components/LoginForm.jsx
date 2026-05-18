import React from 'react';
import { ShieldCheck } from 'lucide-react';

export function LoginForm({ username, setUsername, password, setPassword, onLogin }) {
  return (
    <main className="auth-shell">
      <form className="login-panel" onSubmit={onLogin}>
        <div className="login-logo-container">
          <ShieldCheck className="login-logo" size={42} />
        </div>
        <h1>Consent Registry</h1>
        <p className="login-subtitle">Secure append-only ledger management platform</p>
        
        <label>
          Username
          <input 
            value={username} 
            onChange={(event) => setUsername(event.target.value)} 
            placeholder="Enter your username"
            required 
          />
        </label>
        
        <label>
          Password
          <input 
            type="password" 
            value={password} 
            onChange={(event) => setPassword(event.target.value)} 
            placeholder="••••••••"
            required 
          />
        </label>
        
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
