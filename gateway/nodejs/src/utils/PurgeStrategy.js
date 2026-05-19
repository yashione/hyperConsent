/**
 * Recovery strategy that purges (deletes) all corrupted and forged versions,
 * rolling back the state of the consent to the last known cryptographically valid version.
 * Honors the SOLID Open/Closed Principle (OCP).
 */
class PurgeStrategy {
  /**
   * Executes the purge recovery action.
   * @param {string} consentId 
   * @param {Array<Object>} versions All versions in the database for this consent
   * @param {number} corruptionStartIndex The index of the first corrupted version
   * @param {IConsentRepository} repo Concrete repository abstraction
   * @returns {Object} Recovery report
   */
  async execute(consentId, versions, corruptionStartIndex, repo) {
    const deletedCount = versions.length - corruptionStartIndex;
    const purgedVersions = [];

    // Delete all versions from the corruption start index up to the latest version
    for (let i = corruptionStartIndex; i < versions.length; i++) {
      const doc = versions[i];
      await repo.deleteConsentVersion(doc._id, doc._rev);
      purgedVersions.push(doc.version);
    }

    const rolledBackTo = corruptionStartIndex === 0 ? null : versions[corruptionStartIndex - 1].version;

    return {
      consentId,
      action: 'PURGE',
      status: 'RECOVERED',
      purgedCount: deletedCount,
      purgedVersions,
      rolledBackToVersion: rolledBackTo,
      details: rolledBackTo 
        ? `Successfully purged ${deletedCount} forged/tampered versions. Rolled back state to valid Version ${rolledBackTo}.`
        : `Successfully deleted all versions of consent ${consentId} because Version 1 was forged.`
    };
  }
}

module.exports = PurgeStrategy;
