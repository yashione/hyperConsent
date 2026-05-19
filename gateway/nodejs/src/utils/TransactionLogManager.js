const fs = require('fs');
const path = require('path');

/**
  * Manages the secure, offline, append-only blockchain transaction ledger file.
  * Honors the Single Responsibility Principle (SRP).
  */
class TransactionLogManager {
  constructor() {
    // Save inside the volume-mounted keys folder so it is visible in WSL!
    this.logFilePath = path.join(__dirname, '..', '..', 'keys', 'gateway_ledger_log.jsonl');
    this.init();
  }

  init() {
    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Touch file to make sure it exists
    if (!fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, '', 'utf8');
    }
  }

  /**
    * Appends a valid, signed transaction document to the append-only ledger log.
    * @param {Object} consentDoc 
    */
  logWrite(consentDoc) {
    try {
      if (!consentDoc || !consentDoc.signature) {
        throw new Error('Refusing to log unsigned transaction document.');
      }
      // Ensure we don't pollute the log with CouchDB's _rev or _id edits
      const cleanDoc = { ...consentDoc };
      delete cleanDoc._rev;
      
      const logLine = JSON.stringify(cleanDoc) + '\n';
      fs.appendFileSync(this.logFilePath, logLine, 'utf8');
      console.log(`[TransactionLog] Successfully appended transaction to immutable ledger: ${consentDoc._id}`);
    } catch (err) {
      console.error('[TransactionLog] Failed to write to append-only log:', err.message);
    }
  }

  /**
    * Reads all logged transactions.
    * @returns {Array<Object>}
    */
  getLogs() {
    try {
      if (!fs.existsSync(this.logFilePath)) return [];
      const content = fs.readFileSync(this.logFilePath, 'utf8');
      return content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => JSON.parse(line));
    } catch (err) {
      console.error('[TransactionLog] Failed to read ledger logs:', err.message);
      return [];
    }
  }
}

// Export singleton instance to preserve transaction log file handle consistency
module.exports = new TransactionLogManager();
