import React from 'react';
import { CheckCircle2, Plus, XCircle } from 'lucide-react';

export function ConsentForm({ form, setForm, onCreateConsent }) {
  return (
    <form className="consent-form" onSubmit={onCreateConsent}>
      <h2>New Consent Record</h2>
      
      <label>
        Consumer Organization
        <input 
          value={form.consumer_id} 
          onChange={(event) => setForm({ ...form, consumer_id: event.target.value })} 
          placeholder="e.g. bank-a, insurance-corp"
          required
        />
      </label>
      
      <label>
        Authorized Purpose
        <input 
          value={form.purpose} 
          onChange={(event) => setForm({ ...form, purpose: event.target.value })} 
          placeholder="e.g. KYC verification, marketing"
          required
        />
      </label>
      
      <div className="decision-group-container">
        <span className="field-label">Status</span>
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
      </div>
      
      <button className="submit-btn" type="submit">
        <Plus size={17} /> Write to Ledger
      </button>
    </form>
  );
}
