const MemoryConsentRepository = require('./MemoryConsentRepository');
const CouchDbConsentRepository = require('./CouchDbConsentRepository');
const FabricConsentRepository = require('./FabricConsentRepository');

/**
 * Factory class to resolve concrete storage repository instances dynamically.
 * Implements Dependency Inversion by isolating client resolution from consumer classes.
 */
class ConsentRepositoryFactory {
  /**
   * Resolves and returns the appropriate concrete repository based on environmental parameters.
   * @returns {IConsentRepository} Resolved repository instance.
   */
  static getRepository() {
    const isMock = process.env.FABRIC_MOCK !== 'false';
    const dbType = (process.env.DB_TYPE || 'memory').toLowerCase();

    if (!isMock) {
      console.log('[Factory] Instantiating FabricConsentRepository (Fabric Network Active)...');
      return new FabricConsentRepository();
    }

    if (dbType === 'couchdb') {
      console.log('[Factory] Instantiating CouchDbConsentRepository (Local CouchDB Active)...');
      return new CouchDbConsentRepository();
    }

    console.log('[Factory] Instantiating MemoryConsentRepository (Local In-Memory Active)...');
    return new MemoryConsentRepository();
  }
}

module.exports = ConsentRepositoryFactory;
