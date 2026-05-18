import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api } from './services/api';
import { Header } from './components/Header';
import { LoginForm } from './components/LoginForm';
import { ConsentForm } from './components/ConsentForm';
import { ConsentTable } from './components/ConsentTable';
import { AuditPanel } from './components/AuditPanel';
import './styles.css';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || 'alice');
  const [password, setPassword] = useState('alice123');
  const [consents, setConsents] = useState([]);
  const [systemMode, setSystemMode] = useState('mock');
  const [form, setForm] = useState({ consumer_id: 'bank-a', purpose: 'KYC verification', status: 'GRANTED' });
  const [message, setMessage] = useState('');

  async function refresh() {
    if (!token) return;
    try {
      const data = await api.listConsents(token);
      setConsents(data);
    } catch (error) {
      setMessage(error.message || 'Failed to fetch consents');
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  useEffect(() => {
    api.status()
      .then((status) => setSystemMode(status.gateway.mode))
      .catch(() => setSystemMode('unknown'));
  }, []);

  async function login(event) {
    event.preventDefault();
    try {
      const result = await api.login(username, password);
      localStorage.setItem('token', result.access_token);
      localStorage.setItem('username', username);
      setToken(result.access_token);
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Login failed');
    }
  }

  async function createConsent(event) {
    event.preventDefault();
    try {
      await api.createConsent(token, { user_id: username, ...form });
      setForm({ consumer_id: '', purpose: '', status: 'GRANTED' });
      await refresh();
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Failed to create consent');
    }
  }

  async function revoke(id) {
    try {
      await api.revokeConsent(token, id);
      await refresh();
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Failed to revoke consent');
    }
  }

  async function grant(id) {
    try {
      await api.grantConsent(token, id);
      await refresh();
      setMessage('');
    } catch (error) {
      setMessage(error.message || 'Failed to grant consent');
    }
  }

  const signOut = () => {
    localStorage.clear();
    setToken('');
    setConsents([]);
  };

  if (!token) {
    return (
      <LoginForm 
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        onLogin={login}
      />
    );
  }

  return (
    <main className="app-shell">
      <Header 
        username={username}
        systemMode={systemMode}
        onSignOut={signOut}
      />

      {message && <div className="notice">{message}</div>}

      <div className="workspace-grid">
        <aside className="sidebar">
          <ConsentForm 
            form={form}
            setForm={setForm}
            onCreateConsent={createConsent}
          />
          
          <AuditPanel 
            token={token}
            api={api}
          />
        </aside>

        <section className="main-content">
          <ConsentTable 
            consents={consents}
            onRevoke={revoke}
            onGrant={grant}
          />
        </section>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
