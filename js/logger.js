// logger.js - VERSION 1.1 (DENGAN AUTO DELETE LOG OTOMATIS)
// Fitur Log Aktivitas (Audit Trail)
// Mencatat semua aksi penting pengguna ke Firebase Realtime Database
// AUTO-DELETE: Log yang berusia lebih dari LOG_RETENTION_DAYS akan otomatis dihapus
// ============================================================================

// Konfigurasi: berapa hari log disimpan (default 7 hari = 1 minggu)
const LOG_RETENTION_DAYS = 7;

// Konfigurasi interval pengecekan (dalam milidetik) - default 1 jam
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 jam

// Inisialisasi flag untuk mencegah multiple cleanup
let logCleanupScheduled = false;
let cleanupIntervalId = null;

/**
 * Mendapatkan alamat IP publik client (menggunakan API eksternal)
 * @returns {Promise<string>}
 */
async function getClientIP() {
    try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        return data.ip || 'unknown';
    } catch (error) {
        console.warn('Gagal mendapatkan IP:', error);
        return 'unknown';
    }
}

/**
 * Fungsi utama untuk mencatat aktivitas
 * @param {string} action - Nama aksi (contoh: 'login', 'delete_attendance')
 * @param {string|object} details - Detail tambahan (bisa string atau object)
 * @returns {Promise<void>}
 */
async function logActivity(action, details = '') {
    if (!currentUser || !currentUser.uid) {
        console.warn('logActivity: currentUser tidak tersedia, log tidak disimpan');
        return;
    }

    let detailsStr = '';
    if (typeof details === 'object') {
        try {
            detailsStr = JSON.stringify(details);
        } catch (e) {
            detailsStr = String(details);
        }
    } else {
        detailsStr = String(details || '');
    }

    if (detailsStr.length > 500) {
        detailsStr = detailsStr.substring(0, 497) + '...';
    }

    let ipAddress = 'unknown';
    try {
        ipAddress = await getClientIP();
    } catch (e) {}

    const logEntry = {
        action: action,
        userId: currentUser.uid,
        userName: currentUser.nama || currentUser.email || 'unknown',
        userRole: currentUser.role || 'unknown',
        details: detailsStr,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        ipAddress: ipAddress,
        userAgent: navigator.userAgent.substring(0, 200)
    };

    try {
        await db.ref('logs').push(logEntry);
        console.log(`📝 Log activity: ${action} - ${detailsStr.substring(0, 50)}`);
        
        // Trigger cleanup log lama (hanya sekali setelah write)
        if (!logCleanupScheduled) {
            logCleanupScheduled = true;
            setTimeout(() => cleanupOldLogs(), 5000);
        }
    } catch (error) {
        console.error('Gagal menyimpan log aktivitas:', error);
    }
}

/**
 * Hapus log yang lebih lama dari LOG_RETENTION_DAYS
 * Dipanggil otomatis setelah write, dan juga bisa dipanggil manual
 * @returns {Promise<number>} Jumlah log yang dihapus
 */
async function cleanupOldLogs() {
    logCleanupScheduled = false;
    
    try {
        const cutoffDate = Date.now() - (LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const snapshot = await db.ref('logs').orderByChild('timestamp').endAt(cutoffDate).once('value');
        const oldLogs = snapshot.val();
        
        if (oldLogs && Object.keys(oldLogs).length > 0) {
            const updates = {};
            Object.keys(oldLogs).forEach(key => {
                updates[`logs/${key}`] = null;
            });
            await db.ref().update(updates);
            console.log(`🧹 Auto-delete: ${Object.keys(oldLogs).length} old log entries removed (older than ${LOG_RETENTION_DAYS} days)`);
            return Object.keys(oldLogs).length;
        }
        
        console.log(`🧹 No old logs to delete (retention: ${LOG_RETENTION_DAYS} days)`);
        return 0;
        
    } catch (error) {
        console.error('Cleanup old logs error:', error);
        return 0;
    }
}

/**
 * Menampilkan info tentang status log (jumlah log, retention days)
 * @returns {Promise<object>} Info tentang log
 */
async function getLogsInfo() {
    try {
        const snapshot = await db.ref('logs').once('value');
        const logs = snapshot.val();
        const totalLogs = logs ? Object.keys(logs).length : 0;
        
        let oldestTimestamp = null;
        let newestTimestamp = null;
        
        if (logs) {
            const timestamps = Object.values(logs).map(log => log.timestamp).filter(ts => ts);
            if (timestamps.length > 0) {
                oldestTimestamp = Math.min(...timestamps);
                newestTimestamp = Math.max(...timestamps);
            }
        }
        
        const oldestDate = oldestTimestamp ? new Date(oldestTimestamp) : null;
        const newestDate = newestTimestamp ? new Date(newestTimestamp) : null;
        
        return {
            totalLogs: totalLogs,
            retentionDays: LOG_RETENTION_DAYS,
            oldestLogDate: oldestDate,
            newestLogDate: newestDate,
            cleanupIntervalMs: CLEANUP_INTERVAL_MS
        };
    } catch (error) {
        console.error('Get logs info error:', error);
        return { totalLogs: 0, retentionDays: LOG_RETENTION_DAYS };
    }
}

/**
 * Manual force cleanup - panggil dari UI jika perlu
 * @returns {Promise<number>}
 */
async function forceCleanupLogs() {
    console.log('🔧 Manual force cleanup triggered');
    if (typeof showToast === 'function') {
        showToast('🧹 Membersihkan log lama...', 'info');
    }
    const deletedCount = await cleanupOldLogs();
    if (typeof showToast === 'function') {
        if (deletedCount > 0) {
            showToast(`✅ ${deletedCount} log lama berhasil dihapus (retensi ${LOG_RETENTION_DAYS} hari)`, 'success');
        } else {
            showToast(`📭 Tidak ada log lama yang perlu dihapus (retensi ${LOG_RETENTION_DAYS} hari)`, 'info');
        }
    }
    return deletedCount;
}

/**
 * Memulai interval auto-cleanup (dijalankan setiap CLEANUP_INTERVAL_MS)
 */
function startAutoCleanup() {
    if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
    }
    
    // Jalankan cleanup pertama kali setelah 10 detik
    setTimeout(() => {
        cleanupOldLogs();
    }, 10000);
    
    // Setup interval berkala
    cleanupIntervalId = setInterval(() => {
        console.log(`🕐 Auto-cleanup check (every ${CLEANUP_INTERVAL_MS / 60000} minutes)...`);
        cleanupOldLogs();
    }, CLEANUP_INTERVAL_MS);
    
    console.log(`✅ Auto-cleanup started: logs older than ${LOG_RETENTION_DAYS} days will be deleted every ${CLEANUP_INTERVAL_MS / 60000} minutes`);
}

/**
 * Menghentikan interval auto-cleanup
 */
function stopAutoCleanup() {
    if (cleanupIntervalId) {
        clearInterval(cleanupIntervalId);
        cleanupIntervalId = null;
        console.log('⏹️ Auto-cleanup stopped');
    }
}

/**
 * Mengubah durasi retensi log (perlu restart untuk efek)
 * @param {number} days - Jumlah hari retensi (minimal 1, maksimal 30)
 */
function setLogRetentionDays(days) {
    if (days < 1) days = 1;
    if (days > 30) days = 30;
    
    console.log(`📝 Log retention days changed from ${LOG_RETENTION_DAYS} to ${days} (will take effect on next cleanup)`);
    
    // Simpan ke localStorage agar persisten
    localStorage.setItem('logRetentionDays', days);
    
    // Catat aktivitas
    if (typeof logActivity === 'function') {
        logActivity('change_log_retention', `Mengubah retensi log dari ${LOG_RETENTION_DAYS} menjadi ${days} hari`);
    }
    
    // Trigger cleanup segera
    setTimeout(() => {
        cleanupOldLogs();
    }, 1000);
    
    return days;
}

/**
 * Mendapatkan durasi retensi saat ini
 */
function getCurrentRetentionDays() {
    const saved = localStorage.getItem('logRetentionDays');
    if (saved && !isNaN(parseInt(saved))) {
        return Math.min(30, Math.max(1, parseInt(saved)));
    }
    return LOG_RETENTION_DAYS;
}

// ======================= INISIALISASI AUTO-CLEANUP =======================

// Start auto-cleanup ketika Firebase siap
function initAutoCleanup() {
    if (typeof db !== 'undefined' && db) {
        console.log('🗑️ Initializing auto-cleanup for logs...');
        startAutoCleanup();
    } else {
        setTimeout(initAutoCleanup, 1000);
    }
}

// Jalankan inisialisasi
setTimeout(initAutoCleanup, 2000);

// Ekspor ke global
window.logActivity = logActivity;
window.cleanupOldLogs = cleanupOldLogs;
window.forceCleanupLogs = forceCleanupLogs;
window.getLogsInfo = getLogsInfo;
window.startAutoCleanup = startAutoCleanup;
window.stopAutoCleanup = stopAutoCleanup;
window.setLogRetentionDays = setLogRetentionDays;
window.getCurrentRetentionDays = getCurrentRetentionDays;

console.log(`✅ logger.js V1.1 loaded - Auto-delete logs older than ${LOG_RETENTION_DAYS} days (every ${CLEANUP_INTERVAL_MS / 60000} minutes)`);