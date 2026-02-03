/**
 * Data Cache System for FCLM Performance Extension
 *
 * Caches DAILY data to enable flexible filtering by:
 * - Date range (any period)
 * - Shift (Day/Night)
 * - Week, Month, or custom ranges
 */

(function() {
  'use strict';

  const DB_NAME = 'FCLMPerformanceCache';
  const DB_VERSION = 2;  // Bumped for daily data schema
  const DAILY_STORE = 'dailyData';
  const META_STORE = 'cacheMeta';

  // Cache configuration
  const CONFIG = {
    daysToCache: 60,            // Cache 60 days of historical data
    currentDayRefreshMs: 60000, // Refresh current day every 60 seconds
    parallelFetches: 3,         // Number of parallel API calls
    debug: true
  };

  // Shift definitions (adjust times as needed for your FC)
  const SHIFTS = {
    day: { startHour: 6, endHour: 18, name: 'Day' },
    night: { startHour: 18, endHour: 6, name: 'Night' }
  };

  let db = null;

  function log(...args) {
    if (CONFIG.debug) {
      console.log('[DataCache]', ...args);
    }
  }

  /**
   * Initialize IndexedDB with daily data schema
   */
  function initDB() {
    return new Promise((resolve, reject) => {
      if (db) {
        resolve(db);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        log('Error opening database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        db = request.result;
        log('Database opened successfully (v' + DB_VERSION + ')');
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        log('Upgrading database to version', DB_VERSION);

        // Delete old stores if they exist
        if (database.objectStoreNames.contains('performanceData')) {
          database.deleteObjectStore('performanceData');
          log('Deleted old performanceData store');
        }

        // Store for DAILY performance data
        // Key: {warehouseId}_{date}_{shift}
        if (!database.objectStoreNames.contains(DAILY_STORE)) {
          const store = database.createObjectStore(DAILY_STORE, { keyPath: 'cacheKey' });
          store.createIndex('warehouseId', 'warehouseId', { unique: false });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('shift', 'shift', { unique: false });
          store.createIndex('fetchedAt', 'fetchedAt', { unique: false });
          log('Created daily data store');
        }

        // Store for cache metadata
        if (!database.objectStoreNames.contains(META_STORE)) {
          database.createObjectStore(META_STORE, { keyPath: 'key' });
          log('Created meta store');
        }
      };
    });
  }

  /**
   * Format date as YYYY-MM-DD
   */
  function formatDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Generate cache key for a day
   */
  function getDailyCacheKey(warehouseId, date, shift = 'all') {
    return `${warehouseId}_${formatDate(date)}_${shift}`;
  }

  /**
   * Get list of dates to cache (last N days)
   */
  function getDatesToCache(days = CONFIG.daysToCache) {
    const dates = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      dates.push(formatDate(d));
    }

    return dates;
  }

  /**
   * Store daily data in cache
   */
  async function storeDailyData(warehouseId, date, shift, records) {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DAILY_STORE], 'readwrite');
      const store = transaction.objectStore(DAILY_STORE);

      const cacheKey = getDailyCacheKey(warehouseId, date, shift);
      const data = {
        cacheKey,
        warehouseId,
        date: formatDate(date),
        shift,
        records,
        fetchedAt: new Date().toISOString(),
        recordCount: records.length
      };

      const request = store.put(data);

      request.onsuccess = () => {
        log(`Stored ${records.length} records for ${cacheKey}`);
        resolve(data);
      };

      request.onerror = () => {
        log('Error storing daily data:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get cached data for a specific day
   */
  async function getDailyData(warehouseId, date, shift = 'all') {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DAILY_STORE], 'readonly');
      const store = transaction.objectStore(DAILY_STORE);

      const cacheKey = getDailyCacheKey(warehouseId, date, shift);
      const request = store.get(cacheKey);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get all cached dates
   */
  async function getCachedDates(warehouseId) {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DAILY_STORE], 'readonly');
      const store = transaction.objectStore(DAILY_STORE);
      const dates = new Map();

      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const data = cursor.value;
          if (data.warehouseId === warehouseId) {
            if (!dates.has(data.date)) {
              dates.set(data.date, {
                date: data.date,
                shifts: [],
                totalRecords: 0,
                fetchedAt: data.fetchedAt
              });
            }
            const dateInfo = dates.get(data.date);
            dateInfo.shifts.push(data.shift);
            dateInfo.totalRecords += data.recordCount;
          }
          cursor.continue();
        } else {
          resolve(Array.from(dates.values()).sort((a, b) => b.date.localeCompare(a.date)));
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Query data for a date range with optional shift filter
   */
  async function queryDateRange(warehouseId, startDate, endDate, shiftFilter = 'all') {
    await initDB();

    const start = new Date(startDate);
    const end = new Date(endDate);
    const allRecords = [];
    const datesQueried = [];

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DAILY_STORE], 'readonly');
      const store = transaction.objectStore(DAILY_STORE);

      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const data = cursor.value;
          if (data.warehouseId === warehouseId) {
            const recordDate = new Date(data.date);
            const inRange = recordDate >= start && recordDate <= end;
            const matchesShift = shiftFilter === 'all' || data.shift === shiftFilter || data.shift === 'all';

            if (inRange && matchesShift && data.records) {
              allRecords.push(...data.records);
              if (!datesQueried.includes(data.date)) {
                datesQueried.push(data.date);
              }
            }
          }
          cursor.continue();
        } else {
          log(`Query returned ${allRecords.length} records from ${datesQueried.length} days`);
          resolve({
            records: allRecords,
            datesQueried: datesQueried.sort(),
            shiftFilter
          });
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Check if a specific date needs fetching
   */
  async function needsFetch(warehouseId, date, shift = 'all') {
    const cached = await getDailyData(warehouseId, date, shift);

    if (!cached) return true;

    // For today, check if data is older than refresh interval
    const today = formatDate(new Date());
    if (date === today) {
      const fetchedAt = new Date(cached.fetchedAt);
      const staleTime = new Date(Date.now() - CONFIG.currentDayRefreshMs);
      return fetchedAt < staleTime;
    }

    // Historical days don't need refresh
    return false;
  }

  /**
   * Get cache statistics
   */
  async function getCacheStats() {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DAILY_STORE], 'readonly');
      const store = transaction.objectStore(DAILY_STORE);
      const stats = {
        totalDays: 0,
        totalRecords: 0,
        dateRange: { earliest: null, latest: null },
        byShift: {}
      };

      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const data = cursor.value;
          stats.totalDays++;
          stats.totalRecords += data.recordCount;

          if (!stats.dateRange.earliest || data.date < stats.dateRange.earliest) {
            stats.dateRange.earliest = data.date;
          }
          if (!stats.dateRange.latest || data.date > stats.dateRange.latest) {
            stats.dateRange.latest = data.date;
          }

          stats.byShift[data.shift] = (stats.byShift[data.shift] || 0) + data.recordCount;

          cursor.continue();
        } else {
          resolve(stats);
        }
      };

      request.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Clear all cached data
   */
  async function clearCache() {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([DAILY_STORE, META_STORE], 'readwrite');

      transaction.objectStore(DAILY_STORE).clear();
      transaction.objectStore(META_STORE).clear();

      transaction.oncomplete = () => {
        log('Cache cleared');
        resolve();
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Store fetch progress in meta store
   */
  async function setFetchProgress(warehouseId, progress) {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([META_STORE], 'readwrite');
      const store = transaction.objectStore(META_STORE);

      const data = {
        key: `progress_${warehouseId}`,
        ...progress,
        updatedAt: new Date().toISOString()
      };

      store.put(data);

      transaction.oncomplete = () => resolve(data);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get fetch progress from meta store
   */
  async function getFetchProgress(warehouseId) {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([META_STORE], 'readonly');
      const store = transaction.objectStore(META_STORE);

      const request = store.get(`progress_${warehouseId}`);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  // Expose to global scope for use by fclm.js
  window.FCLMDataCache = {
    init: initDB,
    storeDailyData,
    getDailyData,
    getCachedDates,
    queryDateRange,
    needsFetch,
    clearCache,
    getCacheStats,
    getDatesToCache,
    formatDate,
    setFetchProgress,
    getFetchProgress,
    CONFIG,
    SHIFTS
  };

  log('Daily data cache module loaded (v2)');
})();
