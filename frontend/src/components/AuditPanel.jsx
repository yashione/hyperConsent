import React, { useState } from 'react';
import { Loader2, Shield, ShieldAlert, ShieldCheck } from 'lucide-react';

export function AuditPanel({ token, api }) {
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'passed' | 'failed'
  const [errorMsg, setErrorMsg] = useState('');
  const [lastAuditTime, setLastAuditTime] = useState(null);

  const runAudit = async () => {
    setStatus('loading');
    setErrorMsg('');
    try {
      // Simulate slight delay to make the premium scan animation feel realistic and satisfying
      await new Promise((resolve) => setTimeout(resolve, 800));
      const res = await api.auditLedger(token);
      
      // The response is either { result: "passed" } or has { result: "failed", error: "..." }
      if (res.result === 'passed' || res.status === 'passed') {
        setStatus('passed');
      } else {
        setStatus('failed');
        setErrorMsg(res.detail || res.error || 'Integrity validation failed');
      }
    } catch (err) {
      setStatus('failed');
      setErrorMsg(err.message || 'Audit request failed');
    } finally {
      setLastAuditTime(new Date().toLocaleTimeString());
    }
  };

  return (
    <section className="audit-panel">
      <div className="audit-header">
        <Shield className="header-icon" size={20} />
        <h2>Ledger Security Audit</h2>
      </div>

      <div className={`audit-body status-${status}`}>
        <div className="audit-visual">
          {status === 'idle' && (
            <div className="status-avatar idle">
              <Shield className="icon-pulse" size={48} />
            </div>
          )}
          {status === 'loading' && (
            <div className="status-avatar loading">
              <Loader2 className="icon-spin" size={48} />
            </div>
          )}
          {status === 'passed' && (
            <div className="status-avatar passed">
              <ShieldCheck size={48} />
            </div>
          )}
          {status === 'failed' && (
            <div className="status-avatar failed">
              <ShieldAlert size={48} />
            </div>
          )}
        </div>

        <div className="audit-info">
          <h3>
            {status === 'idle' && 'Ready to Audit'}
            {status === 'loading' && 'Scanning Blockchain Ledger...'}
            {status === 'passed' && 'Blockchain Intact'}
            {status === 'failed' && 'Security Breach Detected!'}
          </h3>
          
          <p className="audit-description">
            {status === 'idle' && 'Verify that no external database administrator has altered or injected records directly into the state database.'}
            {status === 'loading' && 'Walking the ledger records version-by-version, re-computing cryptographic hashes, and validating the sequence chain.'}
            {status === 'passed' && 'Hash-chain linking verified. All block sequences, previous version IDs, and timestamp sequences are cryptographically valid.'}
            {status === 'failed' && (errorMsg || 'A verification mismatch was found. The block chain hash-linking is broken.')}
          </p>

          {lastAuditTime && (
            <span className="last-run">
              Last audited at: <strong>{lastAuditTime}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="audit-footer">
        <button 
          className={`audit-btn ${status === 'loading' ? 'loading' : ''}`}
          onClick={runAudit}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <>
              <Loader2 className="icon-spin" size={16} />
              Auditing...
            </>
          ) : (
            'Verify Cryptographic Integrity'
          )}
        </button>
      </div>
    </section>
  );
}
