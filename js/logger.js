// logger.js - VERSION 2.0 (LOG VISIBILITY: NON-DEVELOPER CAN ONLY SEE LAST 7 DAYS)
// Fitur Log Aktivitas (Audit Trail)
// Mencatat semua aksi penting pengguna ke Firebase Realtime Database
// PERUBAHAN V2.0:
//   - NON-DEVELOPER (Admin, Guru, Staff TU, Wakil Kepala, Siswa) hanya bisa melihat log 7 hari terakhir
//   - DEVELOPER bisa melihat semua log (365 hari / 1 tahun)
//   - Auto-cleanup database: log non-developer dihapus setelah 7 hari, developer setelah 365 hari
//   - Filter data yang ditampilkan di halaman berdasarkan role
// ============================================================================

// Konfigurasi retensi data di DATABASE
const LOG_RETENTION_DAYS_NON_DEVELOPER = 7;    // 7 hari untuk non-developer
const LOG_RETENTION_DAYS_DEVELOPER = 365;       // 365 hari (1 tahun) untuk developer

// Konfigurasi TAMPILAN di halaman
const LOG_VISIBLE_DAYS_NON_DEVELOPER = 7;       // Non-developer hanya lihat 7 hari terakhir
const LOG_VISIBLE_DAYS_DEVELOPER = 365;          // Developer lihat 1 tahun

// Inisialisasi flag
let logCleanupScheduled = false;
let cleanupInterval = null;

/**
 * Mendapatkan alamat IP publik client
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
 * Mendapatkan role user dari userId
 * @param {string} userId - User ID
 * @returns {Promise<string>}
 */
async function getUserRole(userId) {
    try {
        const snapshot = await db.ref(`users_auth/${userId}/role`).once('value');
        return snapshot.val() || 'siswa';
    } catch (error) {
        console.warn('Gagal mendapatkan user role:', error);
        return 'siswa';
    }
}

/**
 * Cek apakah user adalah developer
 * @returns {boolean}
 */
function isCurrentUserDeveloper() {
    return currentUser && currentUser.role === 'developer';
}

/**
 * Mendapatkan cutoff date untuk TAMPILAN (berdasarkan role user yang login)
 * @returns {number} Timestamp cutoff
 */
function getDisplayCutoffDate() {
    const now = Date.now();
    if (isCurrentUserDeveloper()) {
        // Developer: lihat 1 tahun terakhir
        return now - (LOG_VISIBLE_DAYS_DEVELOPER * 24 * 60 * 60 * 1000);
    } else {
        // Non-developer: hanya lihat 7 hari terakhir
        return now - (LOG_VISIBLE_DAYS_NON_DEVELOPER * 24 * 60 * 60 * 1000);
    }
}

/**
 * Mendapatkan cutoff date untuk CLEANUP DATABASE (berdasarkan role pembuat log)
 * @param {string} userRole - Role pembuat log
 * @returns {number} Timestamp cutoff
 */
function getCleanupCutoffDate(userRole) {
    const now = Date.now();
    if (userRole === 'developer') {
        // Log developer: disimpan 1 tahun
        return now - (LOG_RETENTION_DAYS_DEVELOPER * 24 * 60 * 60 * 1000);
    } else {
        // Log non-developer: disimpan 7 hari
        return now - (LOG_RETENTION_DAYS_NON_DEVELOPER * 24 * 60 * 60 * 1000);
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
        userAgent: navigator.userAgent.substring(0, 200)
    };

    try {
        await db.ref('logs').push(logEntry);
        console.log(`📝 Log activity: ${action} - ${detailsStr.substring(0, 50)} (Role: ${currentUser.role})`);
        
        // Trigger cleanup log lama jika belum dijadwalkan
        if (!logCleanupScheduled) {
            logCleanupScheduled = true;
            setTimeout(() => cleanupDatabaseLogs(), 5000);
        }
    } catch (error) {
        console.error('Gagal menyimpan log aktivitas:', error);
    }
}

/**
 * CLEANUP DATABASE: Hapus log dari database berdasarkan role pembuat log
 * - Log dari role non-developer: dihapus setelah 7 hari
 * - Log dari role developer: dihapus setelah 365 hari (1 tahun)
 * Fungsi ini dipanggil otomatis setelah write dan setiap minggu
 */
async function cleanupDatabaseLogs() {
    logCleanupScheduled = false;
    console.log('🧹 Memulai cleanup database logs berdasarkan role pembuat...');
    
    try {
        // Ambil semua log dari Firebase
        const snapshot = await db.ref('logs').once('value');
        const allLogs = snapshot.val();
        
        if (!allLogs) {
            console.log('📭 Tidak ada log untuk dibersihkan');
            return;
        }
        
        // Kelompokkan log berdasarkan userId untuk analisis role
        const userIds = new Set();
        for (const [logId, log] of Object.entries(allLogs)) {
            if (log.userId) {
                userIds.add(log.userId);
            }
        }
        
        // Ambil role untuk setiap user yang memiliki log (gunakan cache)
        const userRoles = new Map();
        for (const userId of userIds) {
            try {
                const role = await getUserRole(userId);
                userRoles.set(userId, role);
            } catch (err) {
                console.warn(`Gagal mendapatkan role untuk user ${userId}:`, err);
                userRoles.set(userId, 'siswa');
            }
        }
        
        // Tentukan log mana yang akan dihapus dari DATABASE
        const logsToDelete = [];
        
        for (const [logId, log] of Object.entries(allLogs)) {
            const timestamp = log.timestamp;
            if (!timestamp) continue;
            
            const userRole = userRoles.get(log.userId) || 'siswa';
            const cutoffDate = getCleanupCutoffDate(userRole);
            
            if (timestamp < cutoffDate) {
                logsToDelete.push(logId);
            }
        }
        
        // Hapus log dari database
        if (logsToDelete.length > 0) {
            const updates = {};
            for (const logId of logsToDelete) {
                updates[`logs/${logId}`] = null;
            }
            await db.ref().update(updates);
            
            // Hitung statistik
            let developerCount = 0;
            let nonDeveloperCount = 0;
            for (const logId of logsToDelete) {
                const log = allLogs[logId];
                const userRole = userRoles.get(log?.userId) || 'siswa';
                if (userRole === 'developer') {
                    developerCount++;
                } else {
                    nonDeveloperCount++;
                }
            }
            
            console.log(`🧹 Database cleanup: ${logsToDelete.length} log dihapus`);
            console.log(`   - Log developer (> ${LOG_RETENTION_DAYS_DEVELOPER} hari): ${developerCount}`);
            console.log(`   - Log non-developer (> ${LOG_RETENTION_DAYS_NON_DEVELOPER} hari): ${nonDeveloperCount}`);
        } else {
            console.log('✅ Tidak ada log yang perlu dibersihkan dari database');
        }
        
        // Update last cleanup date
        localStorage.setItem('lastLogDatabaseCleanup', new Date().toISOString());
        
    } catch (error) {
        console.error('Cleanup database logs error:', error);
    }
}

/**
 * FILTER LOG UNTUK TAMPILAN: Hanya ambil log yang boleh dilihat user saat ini
 * - Non-developer: hanya lihat log 7 hari terakhir (dari semua role)
 * - Developer: lihat semua log yang masih ada di database (1 tahun)
 * @param {Array} logs - Array log dari database
 * @returns {Array} Log yang sudah difilter untuk ditampilkan
 */
function filterLogsForDisplay(logs) {
    if (!logs || logs.length === 0) return [];
    
    const cutoffDate = getDisplayCutoffDate();
    const isDeveloper = isCurrentUserDeveloper();
    
    // Filter berdasarkan tanggal
    let filtered = logs.filter(log => {
        const timestamp = log.timestamp;
        if (!timestamp) return false;
        return timestamp >= cutoffDate;
    });
    
    // Urutkan dari yang terbaru
    filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    console.log(`📊 Filter logs for display: ${logs.length} → ${filtered.length} (role: ${isDeveloper ? 'DEVELOPER' : 'NON-DEVELOPER'}, cutoff: ${new Date(cutoffDate).toLocaleDateString()})`);
    
    return filtered;
}

/**
 * Fungsi untuk menampilkan log di halaman (dengan filter berdasarkan role)
 * @param {number} limit - Jumlah maksimal log yang diambil
 * @param {string} startAfter - ID log untuk pagination
 * @returns {Promise<Array>}
 */
async function fetchLogs(limit = 100, startAfter = null) {
    // Cek otorisasi: hanya admin, guru, staff_tu, wakil_kepala, developer yang bisa lihat log
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer' && 
        currentUser.role !== 'guru' && currentUser.role !== 'staff_tu' && currentUser.role !== 'wakil_kepala')) {
        console.warn('Unauthorized to fetch logs - role:', currentUser?.role);
        return [];
    }
    
    try {
        // Ambil log dari database (ambil lebih banyak untuk difilter)
        let query = db.ref('logs').orderByChild('timestamp').limitToLast(limit * 2);
        const snapshot = await query.once('value');
        const data = snapshot.val();
        
        if (!data) return [];
        
        let logs = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        
        // Filter untuk tampilan berdasarkan role user yang login
        const filteredLogs = filterLogsForDisplay(logs);
        
        // Batasi jumlah
        return filteredLogs.slice(0, limit);
        
    } catch (error) {
        console.error('Fetch logs error:', error);
        return [];
    }
}

/**
 * Fetch logs dengan pagination dan filter role
 * @param {Object} options - Opsi filter
 * @returns {Promise<Object>}
 */
async function fetchLogsAdvanced(options = {}) {
    const { limit = 50, actionFilter = null, startDate = null, endDate = null, page = 1 } = options;
    
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer' && 
        currentUser.role !== 'guru' && currentUser.role !== 'staff_tu' && currentUser.role !== 'wakil_kepala')) {
        return { logs: [], total: 0 };
    }
    
    try {
        let query = db.ref('logs').orderByChild('timestamp');
        
        // Filter berdasarkan tanggal jika ada
        if (startDate) {
            const startTimestamp = new Date(startDate).getTime();
            query = query.startAt(startTimestamp);
        }
        if (endDate) {
            const endTimestamp = new Date(endDate).getTime() + (24 * 60 * 60 * 1000);
            query = query.endAt(endTimestamp);
        }
        
        query = query.limitToLast(limit * 2);
        const snapshot = await query.once('value');
        const data = snapshot.val();
        
        if (!data) return { logs: [], total: 0 };
        
        let logs = Object.entries(data).map(([id, val]) => ({ id, ...val }));
        
        // Filter untuk tampilan berdasarkan role
        logs = filterLogsForDisplay(logs);
        
        // Filter berdasarkan action
        if (actionFilter && actionFilter !== 'all') {
            logs = logs.filter(log => log.action === actionFilter);
        }
        
        // Pagination
        const startIdx = (page - 1) * limit;
        const paginatedLogs = logs.slice(startIdx, startIdx + limit);
        
        return {
            logs: paginatedLogs,
            total: logs.length,
            page: page,
            totalPages: Math.ceil(logs.length / limit)
        };
        
    } catch (error) {
        console.error('Fetch logs advanced error:', error);
        return { logs: [], total: 0 };
    }
}

/**
 * Mendapatkan statistik log untuk dashboard
 * @returns {Promise<Object>}
 */
async function getLogStatistics() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        return null;
    }
    
    try {
        const snapshot = await db.ref('logs').once('value');
        const allLogs = snapshot.val();
        
        if (!allLogs) {
            return { total: 0, visibleCount: 0 };
        }
        
        const logsArray = Object.values(allLogs);
        const totalDatabase = logsArray.length;
        
        // Filter untuk tampilan
        const cutoffDate = getDisplayCutoffDate();
        const visibleLogs = logsArray.filter(log => {
            const timestamp = log.timestamp;
            return timestamp && timestamp >= cutoffDate;
        });
        
        // Hitung per role
        const roleStats = {
            developer: 0,
            admin: 0,
            wakil_kepala: 0,
            staff_tu: 0,
            guru: 0,
            siswa: 0
        };
        
        for (const log of visibleLogs) {
            const role = log.userRole || 'siswa';
            if (roleStats[role] !== undefined) {
                roleStats[role]++;
            }
        }
        
        return {
            totalDatabase: totalDatabase,
            visibleCount: visibleLogs.length,
            roleStats: roleStats,
            retentionDays: isCurrentUserDeveloper() ? LOG_VISIBLE_DAYS_DEVELOPER : LOG_VISIBLE_DAYS_NON_DEVELOPER,
            isDeveloper: isCurrentUserDeveloper()
        };
        
    } catch (error) {
        console.error('Get log statistics error:', error);
        return null;
    }
}

/**
 * Jadwalkan cleanup database setiap hari Minggu jam 00:00 WIB
 */
function scheduleWeeklyDatabaseCleanup() {
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
    }
    
    // Cek setiap 1 jam apakah perlu cleanup
    cleanupInterval = setInterval(async () => {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 = Minggu
        const hours = now.getHours();
        const minutes = now.getMinutes();
        
        // Jalankan cleanup pada hari Minggu jam 00:00 - 00:59
        if (dayOfWeek === 0 && hours === 0 && minutes === 0) {
            const lastCleanup = localStorage.getItem('lastLogDatabaseCleanup');
            const today = now.toISOString().split('T')[0];
            
            if (!lastCleanup || !lastCleanup.includes(today)) {
                console.log('🕐 Menjalankan scheduled database cleanup...');
                await cleanupDatabaseLogs();
                localStorage.setItem('lastLogDatabaseCleanup', now.toISOString());
            }
        }
    }, 60 * 60 * 1000); // Cek setiap jam
    
    console.log('✅ Scheduled weekly database cleanup active (setiap hari Minggu jam 00:00)');
}

/**
 * Jalankan cleanup manual (hanya untuk admin/developer)
 */
async function runManualDatabaseCleanup() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        if (typeof showToast === 'function') {
            showToast('⛔ Hanya Admin dan Developer yang dapat menjalankan cleanup manual!', 'error');
        }
        return;
    }
    
    if (typeof showToast === 'function') {
        showToast('🧹 Menjalankan cleanup database log...', 'info');
    }
    
    await cleanupDatabaseLogs();
    
    if (typeof showToast === 'function') {
        showToast('✅ Cleanup database log selesai', 'success');
    }
}

/**
 * Hapus SEMUA log dari database (hanya untuk developer)
 */
async function deleteAllDatabaseLogs() {
    if (!currentUser || currentUser.role !== 'developer') {
        if (typeof showToast === 'function') {
            showToast('⛔ Hanya Developer yang dapat menghapus semua log!', 'error');
        }
        return { success: false, message: 'Unauthorized - Only developer' };
    }
    
    if (!confirm('⚠️ PERINGATAN! Anda akan menghapus SEMUA log aktivitas dari database.\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!\n\nKetik "DELETE ALL LOGS" untuk konfirmasi:')) {
        return { success: false, message: 'Cancelled' };
    }
    
    const confirmation = prompt('Ketik "DELETE ALL LOGS" untuk konfirmasi:');
    if (confirmation !== 'DELETE ALL LOGS') {
        if (typeof showToast === 'function') {
            showToast('❌ Konfirmasi gagal, penghapusan dibatalkan', 'error');
        }
        return { success: false, message: 'Confirmation failed' };
    }
    
    try {
        await db.ref('logs').remove();
        console.log('🗑️ All logs deleted from database by developer');
        if (typeof showToast === 'function') {
            showToast('✅ Semua log aktivitas berhasil dihapus dari database', 'success');
        }
        return { success: true, message: 'All logs deleted' };
    } catch (error) {
        console.error('Delete all logs error:', error);
        return { success: false, message: error.message };
    }
}

// ======================= INISIALISASI ========================

// Mulai scheduled cleanup setelah Firebase siap
function initLogSystem() {
    if (typeof db !== 'undefined' && db) {
        scheduleWeeklyDatabaseCleanup();
        // Jalankan sekali saat startup (delay 10 detik)
        setTimeout(() => {
            console.log('🕐 Menjalankan initial database cleanup on startup...');
            cleanupDatabaseLogs();
        }, 10000);
    } else {
        console.log('⏳ Menunggu Firebase siap untuk schedule cleanup...');
        setTimeout(initLogSystem, 1000);
    }
}

// Start scheduler
setTimeout(initLogSystem, 2000);

// ======================= EKSPOR KE GLOBAL ========================
window.logActivity = logActivity;
window.fetchLogs = fetchLogs;
window.fetchLogsAdvanced = fetchLogsAdvanced;
window.cleanupDatabaseLogs = cleanupDatabaseLogs;
window.filterLogsForDisplay = filterLogsForDisplay;
window.getLogStatistics = getLogStatistics;
window.getDisplayCutoffDate = getDisplayCutoffDate;
window.runManualDatabaseCleanup = runManualDatabaseCleanup;
window.deleteAllDatabaseLogs = deleteAllDatabaseLogs;
window.isCurrentUserDeveloper = isCurrentUserDeveloper;

console.log('✅ logger.js V2.0 loaded - Non-developer hanya lihat log 7 hari terakhir, Developer lihat 1 tahun');