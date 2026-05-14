import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckCircle2, LogOut, Plus, ShieldCheck, XCircle } from 'lucide-react';
import { api } from './services/api';
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
    setConsents(await api.listConsents(token));
  }

  useEffect(() => {
    refresh().catch((error) => setMessage(error.message));
  }, [token]);

  useEffect(() => {
    api.status().then((status) => setSystemMode(status.gateway.mode)).catch(() => setSystemMode('unknown'));
  }, []);

  async function login(event) {
    event.preventDefault();
    const result = await api.login(username, password);
    localStorage.setItem('token', result.access_token);
    localStorage.setItem('username', username);
    setToken(result.access_token);
    setMessage('');
  }

  async function createConsent(event) {
    event.preventDefault();
    await api.createConsent(token, { user_id: username, ...form });
    setForm({ consumer_id: '', purpose: '', status: 'GRANTED' });
    await refresh();
  }

  async function revoke(id) {
    await api.revokeConsent(token, id);
    await refresh();
  }

  async function grant(id) {
    await api.grantConsent(token, id);
    await refresh();
  }

  if (!token) {
    return (
      <main className="auth-shell">
        <form className="login-panel" onSubmit={login}>
          <ShieldCheck size={36} />
          <h1>Consent Management</h1>
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button type="submit">Sign in</button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header>
        <div>
          <p>Signed in as</p>
          <h1>{username}</h1>
        </div>
        <span className={systemMode === 'fabric' ? 'mode fabric' : 'mode mock'}>
          {systemMode === 'fabric' ? 'Fabric network' : 'Mock gateway'}
        </span>
        <button className="icon-button" onClick={() => { localStorage.clear(); setToken(''); }} title="Sign out">
          <LogOut size={18} />
        </button>
      </header>

      {message && <div className="notice">{message}</div>}

      <section className="workspace">
        <form className="consent-form" onSubmit={createConsent}>
          <h2>New consent</h2>
          <label>
            Consumer
            <input value={form.consumer_id} onChange={(event) => setForm({ ...form, consumer_id: event.target.value })} />
          </label>
          <label>
            Purpose
            <input value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
          </label>
          <div className="decision-group" role="group" aria-label="Consent decision">
            <button
              className={form.status === 'GRANTED' ? 'selected grant' : 'secondary'}
              type="button"
              onClick={() => setForm({ ...form, status: 'GRANTED' })}
            >
              <CheckCircle2 size={17} /> Granted
            </button>
            <button
              className={form.status === 'REVOKED' ? 'selected revoke' : 'secondary'}
              type="button"
              onClick={() => setForm({ ...form, status: 'REVOKED' })}
            >
              <XCircle size={17} /> Revoked
            </button>
          </div>
          <button type="submit"><Plus size={17} /> Create</button>
        </form>

        <section className="list-panel">
          <h2>Consents</h2>
          <div className="table">
            <div className="row table-head">
              <span>Consent ID</span>
              <span>Version</span>
              <span>Entry key</span>
              <span>Consumer</span>
              <span>Purpose</span>
              <span>Status</span>
              <span>Action</span>
            </div>
            {consents.map((consent) => (
              <div className="row" key={consent.id}>
                <span>{consent.consent_id}</span>
                <span>v{consent.version}</span>
                <span className="entry-key" title={consent.id}>{consent.id}</span>
                <span>{consent.consumer_id}</span>
                <span>{consent.purpose}</span>
                <span className={consent.status === 'GRANTED' ? 'active' : 'revoked'}>
                  {consent.status === 'GRANTED' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                  {consent.status}
                </span>
                {consent.is_latest && consent.status === 'GRANTED' ? (
                  <button onClick={() => revoke(consent.consent_id)}>Revoke</button>
                ) : consent.is_latest && consent.status === 'REVOKED' ? (
                  <button className="grant-action" onClick={() => grant(consent.consent_id)}>Grant</button>
                ) : (
                  <span className="locked">Locked</span>
                )}
              </div>
            ))}
            {!consents.length && <p className="empty">No consents yet.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
