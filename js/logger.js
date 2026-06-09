// logger.js - VERSION 1.0
// Fitur Log Aktivitas (Audit Trail)
// Mencatat semua aksi penting pengguna ke Firebase Realtime Database
// Auto-cleanup log lebih dari 30 hari
// ============================================================================

// Konfigurasi: berapa hari log disimpan (default 30 hari)
const LOG_RETENTION_DAYS = 30;

// Inisialisasi flag untuk mencegah multiple cleanup
let logCleanupScheduled = false;

/**
 * Mendapatkan alamat IP publik client (menggunakan API eksternal)
 * Karena IP tidak tersedia langsung di client-side, kita gunakan fallback
 * @returns {Promise<string>}
 */
async function getClientIP() {
    try {
        // Gunakan ipapi.co atau ipify.org (gratis, tanpa API key)
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
    // Cek apakah user sudah login
    if (!currentUser || !currentUser.uid) {
        console.warn('logActivity: currentUser tidak tersedia, log tidak disimpan');
        return;
    }

    // Format details menjadi string jika object
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

    // Batasi panjang details (max 500 karakter) agar tidak membengkak
    if (detailsStr.length > 500) {
        detailsStr = detailsStr.substring(0, 497) + '...';
    }

    let ipAddress = 'unknown';
    try {
        ipAddress = await getClientIP();
    } catch (e) {
        // tetap lanjut
    }

    const logEntry = {
        action: action,
        userId: currentUser.uid,
        userName: currentUser.nama || currentUser.email || 'unknown',
        userRole: currentUser.role || 'unknown',
        details: detailsStr,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        ipAddress: ipAddress,
        userAgent: navigator.userAgent.substring(0, 200) // batasi panjang
    };

    try {
        // Gunakan push agar otomatis mendapat key unik
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
 */
async function cleanupOldLogs() {
    logCleanupScheduled = false;
    try {
        const cutoffDate = Date.now() - (LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        const snapshot = await db.ref('logs').orderByChild('timestamp').endAt(cutoffDate).once('value');
        const oldLogs = snapshot.val();
        if (oldLogs) {
            const updates = {};
            Object.keys(oldLogs).forEach(key => {
                updates[`logs/${key}`] = null;
            });
            await db.ref().update(updates);
            console.log(`🧹 Cleaned up ${Object.keys(oldLogs).length} old log entries`);
        }
    } catch (error) {
        console.error('Cleanup old logs error:', error);
    }
}

/**
 * Fungsi untuk menampilkan log (hanya untuk admin/developer)
 * Bisa dipanggil dari halaman "Log Aktivitas" nanti
 */
async function fetchLogs(limit = 100, startAfter = null) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        console.warn('Unauthorized to fetch logs');
        return [];
    }
    try {
        let query = db.ref('logs').orderByChild('timestamp').limitToLast(limit);
        const snapshot = await query.once('value');
        const data = snapshot.val();
        if (!data) return [];
        // Convert object ke array dan urutkan descending
        let logs = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        logs.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return logs;
    } catch (error) {
        console.error('Fetch logs error:', error);
        return [];
    }
}

// Ekspor ke global
window.logActivity = logActivity;
window.fetchLogs = fetchLogs;
window.cleanupOldLogs = cleanupOldLogs;

console.log('✅ logger.js loaded - Audit trail ready');