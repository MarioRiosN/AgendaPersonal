import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DbService {

  private dbName = 'calendarDB';
  private storeName = 'files';
  private db: IDBDatabase | null = null;

  async init() {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        db.createObjectStore(this.storeName, { keyPath: 'id' });
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve();
      };

      request.onerror = (err) => reject(err);
    });
  }

  async saveFile(fileItem: any) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('DB not initialized');

      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);

      store.put(fileItem);

      tx.oncomplete = () => resolve(true);
      tx.onerror = (err) => reject(err);
    });
  }

  async getFile(id: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('DB not initialized');

      const tx = this.db.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);

      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (err) => reject(err);
    });
  }

  async deleteFile(id: string) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject('DB not initialized');

      const tx = this.db.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);

      store.delete(id);

      tx.oncomplete = () => resolve(true);
      tx.onerror = (err) => reject(err);
    });
  }
}