import React from 'react';
import { CheckCircle2, Lock, XCircle } from 'lucide-react';

export function ConsentTable({ consents, onRevoke, onGrant }) {
  return (
    <section className="list-panel">
      <h2>Consent Transactions</h2>
      <div className="table-wrapper">
        <div className="table">
          <div className="row table-head">
            <span>Consent ID</span>
            <span>Version</span>
            <span>Ledger Address (Key)</span>
            <span>Consumer</span>
            <span>Purpose</span>
            <span>Status</span>
            <span>State Action</span>
          </div>
          
          {consents.map((consent) => (
            <div className="row consent-row" key={consent.id}>
              <span className="consent-id-val" title={consent.consent_id}>{consent.consent_id}</span>
              <span className="version-badge">v{consent.version}</span>
              <span className="entry-key" title={consent.id}>{consent.id}</span>
              <span className="consumer-id-val">{consent.consumer_id}</span>
              <span className="purpose-val">{consent.purpose}</span>
              
              <span className={`status-badge ${consent.status === 'GRANTED' ? 'active' : 'revoked'}`}>
                {consent.status === 'GRANTED' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                {consent.status}
              </span>
              
              <span className="action-cell">
                {consent.is_latest && consent.status === 'GRANTED' ? (
                  <button className="action-btn revoke-action" onClick={() => onRevoke(consent.consent_id)}>
                    Revoke
                  </button>
                ) : consent.is_latest && consent.status === 'REVOKED' ? (
                  <button className="action-btn grant-action" onClick={() => onGrant(consent.consent_id)}>
                    Grant
                  </button>
                ) : (
                  <span className="locked-badge" title="Historical block sequence is immutable">
                    <Lock size={12} /> Locked
                  </span>
                )}
              </span>
            </div>
          ))}
          
          {!consents.length && (
            <div className="empty-state">
              <p className="empty">No consent transactions recorded on the ledger yet.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
