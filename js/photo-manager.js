// photo-manager.js - VERSION 1.0 (CENTRALIZED PHOTO CACHE MANAGEMENT)
// Manajemen cache foto terpusat untuk seluruh sistem
// Memastikan semua foto sinkron dan menggunakan timestamp yang konsisten
// ============================================================================

// ======================= KONFIGURASI =======================
const PHOTO_CACHE_TTL = 5000; // 5 detik cache TTL (dalam milliseconds)
const DEFAULT_AVATAR_BG = '00bcd4';
const DEFAULT_STAFF_BG = 'ff9800';
const DEFAULT_USER_BG = '4a90e2';

// Cache storage utama
const photoCache = new Map();           // URL cache
const photoTimestampCache = new Map();   // Timestamp cache

// Cache per module (untuk kompatibilitas dengan module lama)
if (typeof window.studentPhotoCache === 'undefined') {
    window.studentPhotoCache = new Map();
}
if (typeof window.attendancePhotoCache === 'undefined') {
    window.attendancePhotoCache = new Map();
}
if (typeof window.rekapPhotoCache === 'undefined') {
    window.rekapPhotoCache = new Map();
}
if (typeof window.staffPhotoCache === 'undefined') {
    window.staffPhotoCache = new Map();
}
if (typeof window.usersPhotoCache === 'undefined') {
    window.usersPhotoCache = new Map();
}

// ======================= UTILITY FUNCTIONS =======================

/**
 * Generate avatar URL dari inisial nama
 * @param {string} name - Nama user
 * @param {string} bgColor - Warna background (hex tanpa #)
 * @returns {string} URL avatar
 */
function getAvatarUrlFromName(name, bgColor = DEFAULT_AVATAR_BG) {
    const initial = name ? name.charAt(0).toUpperCase() : 'U';
    const timestamp = Date.now();
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=${bgColor}&color=fff&size=100&bold=true&t=${timestamp}`;
}

/**
 * Mendapatkan timestamp terbaru untuk bypass cache browser
 * @returns {number} Timestamp saat ini
 */
function getFreshTimestamp() {
    return Date.now();
}

/**
 * Menambahkan timestamp ke URL untuk bypass cache browser
 * @param {string} url - URL asli
 * @returns {string|null} URL dengan timestamp atau null jika url tidak valid
 */
function addTimestampToUrl(url) {
    if (!url || url === 'null' || url === 'undefined' || url === '') {
        return null;
    }
    const timestamp = getFreshTimestamp();
    const separator = url.includes('?') ? '&' : '?';
    return url.split('?')[0] + separator + 't=' + timestamp;
}

/**
 * Validasi apakah URL valid
 * @param {string} url - URL yang akan divalidasi
 * @returns {boolean}
 */
function isValidPhotoUrl(url) {
    if (!url) return false;
    if (url === 'null' || url === 'undefined' || url === '') return false;
    if (url.startsWith('blob:')) return true;
    if (url.startsWith('http://') || url.startsWith('https://')) return true;
    if (url.startsWith('data:image')) return true;
    return false;
}

// ======================= FUNGSI UTAMA PHOTO MANAGER =======================

/**
 * Mendapatkan URL foto untuk user/siswa
 * @param {string} type - Tipe: 'student', 'staff', 'user', 'attendance', 'rekap'
 * @param {string|number} id - ID unik (studentId, staffId, atau uid)
 * @param {string} name - Nama untuk fallback
 * @param {string} existingPhotoUrl - URL foto yang sudah ada (opsional)
 * @param {string} bgColor - Warna background untuk avatar default (opsional)
 * @returns {string} URL foto dengan timestamp
 */
function getPhotoUrl(type, id, name, existingPhotoUrl = null, bgColor = null) {
    if (!id && !name) {
        return getAvatarUrlFromName('User', DEFAULT_AVATAR_BG);
    }
    
    const cacheKey = `${type}_${id}`;
    const lastUpdate = photoTimestampCache.get(cacheKey);
    const now = getFreshTimestamp();
    
    // Gunakan cache jika masih fresh (kurang dari TTL)
    if (photoCache.has(cacheKey) && lastUpdate && (now - lastUpdate) < PHOTO_CACHE_TTL) {
        return photoCache.get(cacheKey);
    }
    
    let finalUrl;
    
    // Pilih warna background berdasarkan tipe
    let bg = bgColor;
    if (!bg) {
        switch(type) {
            case 'staff':
                bg = DEFAULT_STAFF_BG;
                break;
            case 'user':
                bg = DEFAULT_USER_BG;
                break;
            default:
                bg = DEFAULT_AVATAR_BG;
        }
    }
    
    // Cek apakah ada foto yang tersimpan
    if (existingPhotoUrl && isValidPhotoUrl(existingPhotoUrl)) {
        finalUrl = addTimestampToUrl(existingPhotoUrl);
    }
    
    // Jika tidak ada foto atau URL tidak valid, gunakan avatar default
    if (!finalUrl) {
        finalUrl = getAvatarUrlFromName(name || String(id), bg);
    }
    
    // Simpan ke cache
    if (finalUrl) {
        photoCache.set(cacheKey, finalUrl);
        photoTimestampCache.set(cacheKey, now);
    }
    
    // Juga simpan ke cache module yang sesuai untuk kompatibilitas
    updateModuleCache(type, id, finalUrl);
    
    return finalUrl;
}

/**
 * Update cache module (untuk kompatibilitas dengan kode lama)
 * @param {string} type - Tipe
 * @param {string|number} id - ID
 * @param {string} url - URL foto
 */
function updateModuleCache(type, id, url) {
    switch(type) {
        case 'student':
            if (window.studentPhotoCache) window.studentPhotoCache.set(String(id), url);
            if (window.attendancePhotoCache) window.attendancePhotoCache.set(String(id), url);
            if (window.rekapPhotoCache) window.rekapPhotoCache.set(String(id), url);
            break;
        case 'attendance':
            if (window.attendancePhotoCache) window.attendancePhotoCache.set(String(id), url);
            break;
        case 'rekap':
            if (window.rekapPhotoCache) window.rekapPhotoCache.set(String(id), url);
            break;
        case 'staff':
            if (window.staffPhotoCache) window.staffPhotoCache.set(String(id), url);
            break;
        case 'user':
            if (window.usersPhotoCache) window.usersPhotoCache.set(String(id), url);
            break;
    }
}

// ======================= FUNGSI KHUSUS PER TIPE =======================

/**
 * Mendapatkan URL foto siswa
 * @param {string|number} studentId - ID siswa
 * @param {string} studentName - Nama siswa
 * @returns {string} URL foto
 */
function getStudentPhotoUrl(studentId, studentName) {
    // Cari user auth yang terhubung dengan siswa ini
    let userPhotoUrl = null;
    if (window.dbData && window.dbData.users_auth) {
        const userAuth = window.dbData.users_auth.find(u => u.fpId == studentId);
        if (userAuth && userAuth.photoUrl) {
            userPhotoUrl = userAuth.photoUrl;
        }
    }
    
    return getPhotoUrl('student', studentId, studentName, userPhotoUrl, DEFAULT_AVATAR_BG);
}

/**
 * Mendapatkan URL foto staff
 * @param {string|number} staffId - ID staff
 * @param {string} staffName - Nama staff
 * @returns {string} URL foto
 */
function getStaffPhotoUrl(staffId, staffName) {
    // Cari user auth yang terhubung dengan staff ini
    let userPhotoUrl = null;
    if (window.dbData && window.dbData.users_auth) {
        const userAuth = window.dbData.users_auth.find(u => u.staffId == staffId || u.uid == staffId);
        if (userAuth && userAuth.photoUrl) {
            userPhotoUrl = userAuth.photoUrl;
        }
    }
    
    return getPhotoUrl('staff', staffId, staffName, userPhotoUrl, DEFAULT_STAFF_BG);
}

/**
 * Mendapatkan URL foto user (untuk tabel users)
 * @param {string} uid - User ID
 * @param {string} userName - Nama user
 * @param {string} photoUrl - URL foto yang tersimpan
 * @returns {string} URL foto
 */
function getUserPhotoUrl(uid, userName, photoUrl) {
    return getPhotoUrl('user', uid, userName, photoUrl, DEFAULT_USER_BG);
}

/**
 * Mendapatkan URL foto attendance (untuk tabel absensi)
 * @param {string|number} studentId - ID siswa
 * @param {string} studentName - Nama siswa
 * @returns {string} URL foto
 */
function getAttendancePhotoUrl(studentId, studentName) {
    return getStudentPhotoUrl(studentId, studentName);
}

/**
 * Mendapatkan URL foto rekap (untuk rekap per siswa)
 * @param {string|number} studentId - ID siswa
 * @param {string} studentName - Nama siswa
 * @returns {string} URL foto
 */
function getRekapPhotoUrl(studentId, studentName) {
    return getStudentPhotoUrl(studentId, studentName);
}

// ======================= CACHE MANAGEMENT =======================

/**
 * Hapus cache untuk ID tertentu
 * @param {string} type - Tipe: 'student', 'staff', 'user', 'all'
 * @param {string|number} id - ID yang akan dihapus (opsional untuk type='all')
 */
function clearPhotoCache(type, id = null) {
    if (type === 'all') {
        // Hapus semua cache utama
        photoCache.clear();
        photoTimestampCache.clear();
        
        // Hapus cache module untuk kompatibilitas
        if (window.studentPhotoCache) window.studentPhotoCache.clear();
        if (window.attendancePhotoCache) window.attendancePhotoCache.clear();
        if (window.rekapPhotoCache) window.rekapPhotoCache.clear();
        if (window.staffPhotoCache) window.staffPhotoCache.clear();
        if (window.usersPhotoCache) window.usersPhotoCache.clear();
        
        console.log("🖼️ [PhotoManager] All photo caches cleared");
        return;
    }
    
    const cacheKey = `${type}_${id}`;
    photoCache.delete(cacheKey);
    photoTimestampCache.delete(cacheKey);
    
    // Hapus dari cache module yang sesuai
    const strId = String(id);
    switch(type) {
        case 'student':
            if (window.studentPhotoCache) window.studentPhotoCache.delete(strId);
            if (window.attendancePhotoCache) window.attendancePhotoCache.delete(strId);
            if (window.rekapPhotoCache) window.rekapPhotoCache.delete(strId);
            break;
        case 'staff':
            if (window.staffPhotoCache) window.staffPhotoCache.delete(strId);
            break;
        case 'user':
            if (window.usersPhotoCache) window.usersPhotoCache.delete(strId);
            break;
    }
    
    console.log(`🖼️ [PhotoManager] Photo cache cleared for ${type}: ${id}`);
}

/**
 * Hapus cache berdasarkan URL foto
 * @param {string} photoUrl - URL foto yang akan dihapus dari cache
 */
function clearPhotoCacheByUrl(photoUrl) {
    if (!photoUrl) return;
    
    let foundKey = null;
    for (const [key, url] of photoCache.entries()) {
        if (url === photoUrl || (url && url.split('?')[0] === photoUrl.split('?')[0])) {
            foundKey = key;
            break;
        }
    }
    
    if (foundKey) {
        photoCache.delete(foundKey);
        photoTimestampCache.delete(foundKey);
        console.log(`🖼️ [PhotoManager] Cache cleared for URL: ${photoUrl}`);
    }
}

/**
 * Refresh cache untuk siswa tertentu
 * @param {string|number} studentId - ID siswa
 * @param {boolean} refreshTables - Apakah akan refresh tabel
 */
function refreshStudentPhotoCache(studentId, refreshTables = true) {
    if (!studentId) return;
    
    clearPhotoCache('student', studentId);
    
    if (refreshTables) {
        setTimeout(() => {
            if (typeof window.renderStudentsTable === 'function') window.renderStudentsTable();
            if (typeof window.renderTable === 'function') window.renderTable();
            if (typeof window.loadRekap === 'function') window.loadRekap();
        }, 50);
    }
    
    console.log(`🖼️ [PhotoManager] Student photo refreshed for ID: ${studentId}`);
}

/**
 * Refresh cache untuk staff tertentu
 * @param {string|number} staffId - ID staff
 * @param {boolean} refreshTables - Apakah akan refresh tabel
 */
function refreshStaffPhotoCache(staffId, refreshTables = true) {
    if (!staffId) return;
    
    clearPhotoCache('staff', staffId);
    
    if (refreshTables) {
        setTimeout(() => {
            if (typeof window.renderStaffTable === 'function') window.renderStaffTable();
            if (typeof window.renderStaffAttendanceTable === 'function') window.renderStaffAttendanceTable();
        }, 50);
    }
    
    console.log(`🖼️ [PhotoManager] Staff photo refreshed for ID: ${staffId}`);
}

/**
 * Force refresh semua foto di seluruh sistem
 * @param {boolean} refreshTables - Apakah akan refresh tabel juga
 */
async function forceRefreshAllPhotos(refreshTables = true) {
    console.log("🖼️ [PhotoManager] Force refreshing all photos...");
    
    // Clear semua cache
    clearPhotoCache('all');
    
    // Refresh avatar user saat ini jika ada
    if (window.currentUser) {
        // Coba gunakan fungsi yang tersedia
        if (typeof window.refreshAllAvatarsGlobal === 'function') {
            window.refreshAllAvatarsGlobal();
        } else if (typeof window.refreshAllAvatars === 'function') {
            window.refreshAllAvatars();
        } else if (typeof window.refreshAllAuthAvatars === 'function') {
            window.refreshAllAuthAvatars();
        } else {
            // Fallback manual
            const timestamp = Date.now();
            let photoUrl = window.currentUser.photoUrl;
            if (!photoUrl || photoUrl === 'null' || photoUrl === 'undefined') {
                const initial = window.currentUser.nama ? window.currentUser.nama.charAt(0).toUpperCase() : 'U';
                photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=${DEFAULT_USER_BG}&color=fff&size=100&bold=true&t=${timestamp}`;
            } else {
                const separator = photoUrl.includes('?') ? '&' : '?';
                photoUrl = photoUrl.split('?')[0] + separator + 't=' + timestamp;
            }
            
            ['navbarAvatar', 'sidebarAvatar', 'profileImg', 'headerAvatar'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.src = photoUrl;
            });
        }
    }
    
    if (!refreshTables) {
        if (typeof window.showToast === 'function') {
            window.showToast("🖼️ Cache foto telah dibersihkan", "success");
        }
        return;
    }
    
    // Refresh semua tabel yang mungkin menampilkan foto
    setTimeout(() => {
        let refreshCount = 0;
        
        if (typeof window.renderStudentsTable === 'function') {
            window.renderStudentsTable();
            refreshCount++;
        }
        if (typeof window.renderTable === 'function') {
            window.renderTable();
            refreshCount++;
        }
        if (typeof window.loadRekap === 'function') {
            window.loadRekap();
            refreshCount++;
        }
        if (typeof window.renderStaffTable === 'function') {
            window.renderStaffTable();
            refreshCount++;
        }
        if (typeof window.renderStaffAttendanceTable === 'function') {
            window.renderStaffAttendanceTable();
            refreshCount++;
        }
        if (typeof window.renderUsersTable === 'function') {
            window.renderUsersTable();
            refreshCount++;
        }
        if (typeof window.loadFriendsList === 'function') {
            window.loadFriendsList();
            refreshCount++;
        }
        if (typeof window.loadChatList === 'function') {
            window.loadChatList();
            refreshCount++;
        }
        
        console.log(`🖼️ [PhotoManager] Refreshed ${refreshCount} tables/components`);
        
        if (typeof window.showToast === 'function') {
            window.showToast(`🖼️ Semua foto telah direfresh (${refreshCount} komponen)`, "success");
        }
    }, 100);
}

/**
 * Reset semua cache (alias untuk clearPhotoCache('all'))
 */
function resetAllPhotoCaches() {
    clearPhotoCache('all');
    console.log("🖼️ [PhotoManager] All photo caches reset");
}

// ======================= LISTENER SETUP =======================

/**
 * Setup listener untuk perubahan foto secara realtime dari Firebase
 */
function setupPhotoRealtimeListener() {
    if (!window.currentUser || !window.currentUser.uid) {
        console.log("📸 [PhotoManager] No currentUser, skipping realtime listener");
        return;
    }
    if (!window.db) {
        console.log("📸 [PhotoManager] Firebase not available, skipping realtime listener");
        return;
    }
    
    // Hapus listener lama jika ada
    if (window._photoManagerListener) {
        window.db.ref('users_auth').off('child_changed', window._photoManagerListener);
    }
    
    window._photoManagerListener = (snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.photoUrl) {
            console.log(`🖼️ [PhotoManager] Photo changed for user: ${userData.email || userData.nama}`);
            
            // Clear cache untuk user ini
            if (userData.uid) {
                clearPhotoCache('user', userData.uid);
            }
            if (userData.fpId) {
                clearPhotoCache('student', userData.fpId);
                clearPhotoCache('attendance', userData.fpId);
                clearPhotoCache('rekap', userData.fpId);
            }
            if (userData.staffId) {
                clearPhotoCache('staff', userData.staffId);
            }
            
            // Jika user ini adalah current user, refresh avatar
            if (window.currentUser && userData.uid === window.currentUser.uid) {
                window.currentUser.photoUrl = userData.photoUrl;
                if (typeof window.refreshAllAvatarsGlobal === 'function') {
                    window.refreshAllAvatarsGlobal();
                }
            }
            
            // Refresh tabel yang sedang aktif
            const activeTab = document.querySelector('.tab-content.active')?.id;
            setTimeout(() => {
                switch(activeTab) {
                    case 'tab-students':
                        if (typeof window.renderStudentsTable === 'function') window.renderStudentsTable();
                        break;
                    case 'tab-attendance':
                        if (typeof window.renderTable === 'function') window.renderTable();
                        break;
                    case 'tab-rekap':
                        if (typeof window.loadRekap === 'function') window.loadRekap();
                        break;
                    case 'tab-staff':
                        if (typeof window.renderStaffTable === 'function') window.renderStaffTable();
                        break;
                    case 'tab-staff-attendance':
                        if (typeof window.renderStaffAttendanceTable === 'function') window.renderStaffAttendanceTable();
                        break;
                    case 'tab-users':
                        if (typeof window.renderUsersTable === 'function') window.renderUsersTable();
                        break;
                }
            }, 100);
        }
    };
    
    window.db.ref('users_auth').on('child_changed', window._photoManagerListener);
    console.log("📸 [PhotoManager] Realtime photo listener set up");
}

// ======================= INISIALISASI =======================

let photoManagerInitialized = false;

/**
 * Inisialisasi photo manager
 */
function initPhotoManager() {
    if (photoManagerInitialized) {
        console.log("📸 [PhotoManager] Already initialized");
        return;
    }
    
    console.log("📸 [PhotoManager] Initializing v1.0...");
    
    // Setup listener jika user sudah ada
    if (window.currentUser) {
        setTimeout(setupPhotoRealtimeListener, 1000);
    } else {
        // Tunggu user login
        const checkUser = setInterval(() => {
            if (window.currentUser) {
                clearInterval(checkUser);
                setTimeout(setupPhotoRealtimeListener, 1000);
            }
        }, 500);
        setTimeout(() => clearInterval(checkUser), 10000);
    }
    
    photoManagerInitialized = true;
    console.log("✅ [PhotoManager] Initialized successfully");
}

// ======================= EKSPOR KE GLOBAL =======================

// Objek utama photoManager
window.photoManager = {
    // Konfigurasi
    CACHE_TTL: PHOTO_CACHE_TTL,
    
    // Utility functions
    getAvatarUrlFromName,
    addTimestampToUrl,
    isValidPhotoUrl,
    getFreshTimestamp,
    
    // Core functions
    getPhotoUrl,
    getStudentPhotoUrl,
    getStaffPhotoUrl,
    getUserPhotoUrl,
    getAttendancePhotoUrl,
    getRekapPhotoUrl,
    
    // Cache management
    clearPhotoCache,
    clearPhotoCacheByUrl,
    refreshStudentPhotoCache,
    refreshStaffPhotoCache,
    forceRefreshAllPhotos,
    resetAllPhotoCaches,
    
    // Initialization
    init: initPhotoManager,
    setupRealtimeListener: setupPhotoRealtimeListener
};

// Ekspor fungsi individual untuk kompatibilitas dengan module lama
window.getStudentPhotoUrl = getStudentPhotoUrl;
window.getStaffPhotoUrl = getStaffPhotoUrl;
window.getUserPhotoUrl = getUserPhotoUrl;
window.getAttendancePhotoUrl = getAttendancePhotoUrl;
window.getRekapPhotoUrl = getRekapPhotoUrl;
window.clearPhotoCache = clearPhotoCache;
window.forceRefreshAllPhotos = forceRefreshAllPhotos;
window.resetAllPhotoCaches = resetAllPhotoCaches;
window.refreshStudentPhotoCache = refreshStudentPhotoCache;
window.refreshStaffPhotoCache = refreshStaffPhotoCache;
window.initPhotoManager = initPhotoManager;

// Auto-initialize setelah DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initPhotoManager, 500);
    });
} else {
    setTimeout(initPhotoManager, 500);
}

console.log("✅ photo-manager.js v1.0 loaded - Centralized photo cache management ready");