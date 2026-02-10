/**
 * Data Cache System for FCLM Performance Extension
 *
 * Uses browser.storage.local instead of IndexedDB for better compatibility
 * with Firefox content scripts.
 *
 * Caches DAILY data to enable flexible filtering by:
 * - Date range (any period)
 * - Shift (Day/Night)
 * - Week, Month, or custom ranges
 */

(function() {
  'use strict';

  const STORAGE_PREFIX = 'cache_';
  const META_PREFIX = 'meta_';

  // Cache configuration
  const CONFIG = {
    daysToCache: 30,            // Cache last 30 days (FCLM only keeps 31 days of Intraday data)
    currentDayRefreshMs: 300000, // Refresh current day every 5 minutes
    parallelFetches: 1,         // Sequential fetches to avoid rate limiting
    batchDelayMs: 2000,         // 2 second delay between batches
    debug: true
  };

  // Shift definitions
  const SHIFTS = {
    day: { startHour: 6, endHour: 18, name: 'Day' },
    night: { startHour: 18, endHour: 6, name: 'Night' }
  };

  let initialized = false;

  function log(...args) {
    if (CONFIG.debug) {
      console.log('[DataCache]', ...args);
    }
  }

  /**
   * Initialize cache (no-op for storage.local, just marks as ready)
   */
  async function init() {
    log('Initializing browser.storage.local cache...');
    initialized = true;
    log('Cache ready');
    return true;
  }

  /**
   * Reset/clear all cache data
   */
  async function reset() {
    log('Resetting cache...');
    const all = await browser.storage.local.get(null);
    const keysToRemove = Object.keys(all).filter(k =>
      k.startsWith(STORAGE_PREFIX) || k.startsWith(META_PREFIX)
    );
    if (keysToRemove.length > 0) {
      await browser.storage.local.remove(keysToRemove);
      log(`Removed ${keysToRemove.length} cached items`);
    }
    return true;
  }

  /**
   * Format date as YYYY-MM-DD
   * Handles both Date objects and date strings
   */
  function formatDate(date) {
    // If already a YYYY-MM-DD string, return as-is
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    // For Date objects or other formats, convert properly
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /**
   * Generate cache key for a day
   */
  function getDailyCacheKey(warehouseId, date, shift = 'all') {
    return `${STORAGE_PREFIX}${warehouseId}_${formatDate(date)}_${shift}`;
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
    const cacheKey = getDailyCacheKey(warehouseId, date, shift);
    const data = {
      warehouseId,
      date: formatDate(date),
      shift,
      records,
      fetchedAt: new Date().toISOString(),
      recordCount: records.length
    };

    await browser.storage.local.set({ [cacheKey]: data });
    log(`Stored ${records.length} records for ${cacheKey}`);
    return data;
  }

  /**
   * Get cached data for a specific day
   */
  async function getDailyData(warehouseId, date, shift = 'all') {
    const cacheKey = getDailyCacheKey(warehouseId, date, shift);
    const result = await browser.storage.local.get(cacheKey);
    return result[cacheKey] || null;
  }

  /**
   * Get all cached dates for a warehouse
   */
  async function getCachedDates(warehouseId) {
    const all = await browser.storage.local.get(null);
    const dates = new Map();
    const prefix = `${STORAGE_PREFIX}${warehouseId}_`;

    Object.entries(all).forEach(([key, data]) => {
      if (key.startsWith(prefix) && data && data.date) {
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
        dateInfo.totalRecords += data.recordCount || 0;
      }
    });

    return Array.from(dates.values()).sort((a, b) => b.date.localeCompare(a.date));
  }

  /**
   * Query data for a date range with optional shift filter
   */
  async function queryDateRange(warehouseId, startDate, endDate, shiftFilter = 'all') {
    const all = await browser.storage.local.get(null);
    const start = new Date(startDate);
    const end = new Date(endDate);
    const allRecords = [];
    const datesQueried = [];
    const prefix = `${STORAGE_PREFIX}${warehouseId}_`;

    Object.entries(all).forEach(([key, data]) => {
      if (key.startsWith(prefix) && data && data.date && data.records) {
        const recordDate = new Date(data.date);
        const inRange = recordDate >= start && recordDate <= end;
        const matchesShift = shiftFilter === 'all' || data.shift === shiftFilter || data.shift === 'all';

        if (inRange && matchesShift) {
          allRecords.push(...data.records);
          if (!datesQueried.includes(data.date)) {
            datesQueried.push(data.date);
          }
        }
      }
    });

    log(`Query returned ${allRecords.length} records from ${datesQueried.length} days`);
    return {
      records: allRecords,
      datesQueried: datesQueried.sort(),
      shiftFilter
    };
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
    const all = await browser.storage.local.get(null);
    const stats = {
      totalDays: 0,
      totalRecords: 0,
      dateRange: { earliest: null, latest: null },
      byShift: {}
    };

    Object.entries(all).forEach(([key, data]) => {
      if (key.startsWith(STORAGE_PREFIX) && data && data.date) {
        stats.totalDays++;
        stats.totalRecords += data.recordCount || 0;

        if (!stats.dateRange.earliest || data.date < stats.dateRange.earliest) {
          stats.dateRange.earliest = data.date;
        }
        if (!stats.dateRange.latest || data.date > stats.dateRange.latest) {
          stats.dateRange.latest = data.date;
        }

        stats.byShift[data.shift] = (stats.byShift[data.shift] || 0) + (data.recordCount || 0);
      }
    });

    return stats;
  }

  /**
   * Clear all cached data
   */
  async function clearCache() {
    await reset();
    log('Cache cleared');
  }

  /**
   * Store fetch progress
   */
  async function setFetchProgress(warehouseId, progress) {
    const key = `${META_PREFIX}progress_${warehouseId}`;
    const data = {
      ...progress,
      updatedAt: new Date().toISOString()
    };
    await browser.storage.local.set({ [key]: data });
    return data;
  }

  /**
   * Get fetch progress
   */
  async function getFetchProgress(warehouseId) {
    const key = `${META_PREFIX}progress_${warehouseId}`;
    const result = await browser.storage.local.get(key);
    return result[key] || null;
  }

  // Expose to global scope for use by fclm.js
  window.FCLMDataCache = {
    init,
    reset,
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

  log('Storage-based cache module loaded');
})();
