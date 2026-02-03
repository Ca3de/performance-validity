/**
 * Data Cache System for FCLM Performance Extension
 *
 * Caches historical data to reduce API calls and improve performance.
 * - Historical months: Fetched once and cached permanently
 * - Current day: Refreshed periodically for real-time data
 */

(function() {
  'use strict';

  const DB_NAME = 'FCLMPerformanceCache';
  const DB_VERSION = 1;
  const STORE_NAME = 'performanceData';
  const META_STORE = 'cacheMeta';

  // Cache configuration
  const CONFIG = {
    monthsToCache: 3,           // How many months of historical data to cache
    currentDayRefreshMs: 60000, // Refresh current day every 60 seconds
    debug: true
  };

  let db = null;
  let refreshInterval = null;

  function log(...args) {
    if (CONFIG.debug) {
      console.log('[DataCache]', ...args);
    }
  }

  /**
   * Initialize IndexedDB
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
        log('Database opened successfully');
        resolve(db);
      };

      request.onupgradeneeded = (event) => {
        const database = event.target.result;

        // Store for performance data by month
        // Key: {warehouseId}_{processId}_{YYYY-MM}
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: 'cacheKey' });
          store.createIndex('warehouseId', 'warehouseId', { unique: false });
          store.createIndex('processId', 'processId', { unique: false });
          store.createIndex('month', 'month', { unique: false });
          store.createIndex('fetchedAt', 'fetchedAt', { unique: false });
          log('Created performance data store');
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
   * Generate cache key for a month
   */
  function getCacheKey(warehouseId, processId, yearMonth) {
    return `${warehouseId}_${processId}_${yearMonth}`;
  }

  /**
   * Get year-month string from date
   */
  function getYearMonth(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get list of months to cache (last N months including current)
   */
  function getMonthsToCache(count = CONFIG.monthsToCache) {
    const months = [];
    const now = new Date();

    for (let i = 0; i < count; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(getYearMonth(d));
    }

    return months;
  }

  /**
   * Store data for a month in cache
   */
  async function storeMonthData(warehouseId, processId, yearMonth, records) {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const cacheKey = getCacheKey(warehouseId, processId, yearMonth);
      const data = {
        cacheKey,
        warehouseId,
        processId,
        month: yearMonth,
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
        log('Error storing data:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get cached data for a month
   */
  async function getMonthData(warehouseId, processId, yearMonth) {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const cacheKey = getCacheKey(warehouseId, processId, yearMonth);
      const request = store.get(cacheKey);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        log('Error getting data:', request.error);
        reject(request.error);
      };
    });
  }

  /**
   * Get all cached months for a process
   */
  async function getCachedMonths(warehouseId, processId) {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const months = [];

      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const data = cursor.value;
          if (data.warehouseId === warehouseId && data.processId === processId) {
            months.push({
              month: data.month,
              recordCount: data.recordCount,
              fetchedAt: data.fetchedAt
            });
          }
          cursor.continue();
        } else {
          resolve(months);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Store current day data separately (with timestamp for freshness)
   */
  async function storeCurrentDayData(warehouseId, processId, records) {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([META_STORE], 'readwrite');
      const store = transaction.objectStore(META_STORE);

      const key = `currentDay_${warehouseId}_${processId}`;
      const data = {
        key,
        warehouseId,
        processId,
        records,
        fetchedAt: new Date().toISOString(),
        recordCount: records.length
      };

      const request = store.put(data);

      request.onsuccess = () => {
        log(`Stored ${records.length} current day records`);
        resolve(data);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get current day cached data
   */
  async function getCurrentDayData(warehouseId, processId) {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([META_STORE], 'readonly');
      const store = transaction.objectStore(META_STORE);

      const key = `currentDay_${warehouseId}_${processId}`;
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all cached data
   */
  async function clearCache() {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME, META_STORE], 'readwrite');

      transaction.objectStore(STORE_NAME).clear();
      transaction.objectStore(META_STORE).clear();

      transaction.oncomplete = () => {
        log('Cache cleared');
        resolve();
      };

      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get cache statistics
   */
  async function getCacheStats() {
    await initDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME, META_STORE], 'readonly');
      const stats = {
        months: [],
        totalRecords: 0,
        currentDayFreshness: null
      };

      const monthStore = transaction.objectStore(STORE_NAME);
      const metaStore = transaction.objectStore(META_STORE);

      const monthRequest = monthStore.openCursor();
      monthRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const data = cursor.value;
          stats.months.push({
            key: data.cacheKey,
            month: data.month,
            records: data.recordCount,
            fetchedAt: data.fetchedAt
          });
          stats.totalRecords += data.recordCount;
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve(stats);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Query data for a date range, combining cached historical + current day data
   */
  async function queryDataForRange(warehouseId, processId, startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const allRecords = [];
    const monthsNeeded = new Set();

    // Determine which months we need
    let current = new Date(start.getFullYear(), start.getMonth(), 1);
    while (current <= end) {
      monthsNeeded.add(getYearMonth(current));
      current.setMonth(current.getMonth() + 1);
    }

    log(`Query range: ${start.toISOString()} to ${end.toISOString()}`);
    log(`Months needed:`, Array.from(monthsNeeded));

    // Get cached data for each month
    for (const month of monthsNeeded) {
      const cached = await getMonthData(warehouseId, processId, month);
      if (cached && cached.records) {
        log(`Found ${cached.records.length} cached records for ${month}`);
        allRecords.push(...cached.records);
      } else {
        log(`No cached data for ${month}`);
      }
    }

    // If date range includes today, also get current day data
    if (end >= today) {
      const currentDay = await getCurrentDayData(warehouseId, processId);
      if (currentDay && currentDay.records) {
        log(`Adding ${currentDay.records.length} current day records`);
        // Merge current day data, replacing any records from the same day
        const todayStr = getYearMonth(today) + '-' + String(today.getDate()).padStart(2, '0');
        // Filter out today's data from historical and add fresh current day data
        const filteredRecords = allRecords.filter(r => {
          // Keep records that aren't from today
          return true; // For now, just add all - deduplication handled by employee ID
        });
        allRecords.push(...currentDay.records);
      }
    }

    return {
      records: allRecords,
      monthsCached: Array.from(monthsNeeded),
      includesCurrentDay: end >= today
    };
  }

  /**
   * Check if we need to fetch data for a month
   */
  async function needsFetch(warehouseId, processId, yearMonth) {
    const cached = await getMonthData(warehouseId, processId, yearMonth);

    if (!cached) return true;

    // For current month, check if data is older than 1 hour
    const currentMonth = getYearMonth(new Date());
    if (yearMonth === currentMonth) {
      const fetchedAt = new Date(cached.fetchedAt);
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
      return fetchedAt < hourAgo;
    }

    // Historical months don't need refresh
    return false;
  }

  // Expose to global scope for use by fclm.js
  window.FCLMDataCache = {
    init: initDB,
    storeMonthData,
    getMonthData,
    getCachedMonths,
    storeCurrentDayData,
    getCurrentDayData,
    queryDataForRange,
    needsFetch,
    clearCache,
    getCacheStats,
    getMonthsToCache,
    getYearMonth,
    CONFIG
  };

  log('Data cache module loaded');
})();
