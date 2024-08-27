export class P2PLoaderIndexedDB {
  private db: IDBDatabase | null = null;

  constructor(
    private readonly dbName: string,
    private readonly dbVersion: number,
    private readonly infoItemsStoreName: string,
    private readonly dataItemsStoreName: string,
  ) {}

  async openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(new Error("Failed to open database."));
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onupgradeneeded = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(this.db);
      };
    });
  }

  private createObjectStores(db: IDBDatabase): void {
    if (!db.objectStoreNames.contains(this.dataItemsStoreName)) {
      db.createObjectStore(this.dataItemsStoreName, { keyPath: "storageId" });
    }
    if (!db.objectStoreNames.contains(this.infoItemsStoreName)) {
      db.createObjectStore(this.infoItemsStoreName, { keyPath: "storageId" });
    }
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    return this.performTransaction(storeName, "readonly", (store) =>
      store.getAll(),
    );
  }

  async put<T>(storeName: string, item: T): Promise<void> {
    await this.performTransaction(storeName, "readwrite", (store) =>
      store.put(item),
    );
  }

  async get<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    return this.performTransaction(storeName, "readonly", (store) =>
      store.get(key),
    );
  }

  async delete(storeName: string, key: IDBValidKey): Promise<void> {
    await this.performTransaction(storeName, "readwrite", (store) =>
      store.delete(key),
    );
  }

  private async performTransaction<T>(
    storeName: string,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.db) throw new Error("Database not initialized");

      const transaction = this.db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onerror = () => reject(new Error("IndexedDB operation failed"));

      request.onsuccess = () => {
        const result = request.result as T;
        resolve(result);
      };
    });
  }

  closeDatabase(): void {
    if (!this.db) return;
    this.db.close();
    this.db = null;
  }

  async deleteDatabase(): Promise<void> {
    this.closeDatabase();
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete database."));
    });
  }
}
