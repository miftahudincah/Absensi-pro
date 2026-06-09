// global-functions.js - VERSION 2.0 (FIXED PHOTO CACHE & RESET FUNCTIONS)
// Fungsi global yang digunakan di seluruh aplikasi
// PERUBAHAN V2.0:
//   - Menambahkan resetAllPhotoCaches() untuk membersihkan semua cache foto
//   - Menambahkan refreshAllAvatarsGlobal() untuk refresh avatar di seluruh UI
//   - Menambahkan forceRefreshAllPhotos() untuk memaksa refresh semua foto
// ============================================================================

// ======================== PHOTO CACHE MANAGEMENT ========================

/**
 * Reset semua cache foto di seluruh modul
 * Fungsi ini membersihkan cache foto di:
 * - students.js (studentPhotoCache)
 * - attendance.js (attendancePhotoCache)
 * - rekap-per-siswa.js (rekapPhotoCache)
 * - staff.js (staffPhotoCache)
 * - chat.js (chatPhotoCache)
 */
function resetAllPhotoCaches() {
    console.log("🖼️ resetAllPhotoCaches - Membersihkan semua cache foto...");
    
    // Reset cache students.js
    if (typeof studentPhotoCache !== 'undefined' && studentPhotoCache.clear) {
        studentPhotoCache.clear();
        console.log("  ✅ studentPhotoCache cleared");
    } else if (typeof window.studentPhotoCache !== 'undefined' && window.studentPhotoCache.clear) {
        window.studentPhotoCache.clear();
        console.log("  ✅ window.studentPhotoCache cleared");
    }
    
    // Reset cache attendance.js
    if (typeof attendancePhotoCache !== 'undefined' && attendancePhotoCache.clear) {
        attendancePhotoCache.clear();
        console.log("  ✅ attendancePhotoCache cleared");
    } else if (typeof window.attendancePhotoCache !== 'undefined' && window.attendancePhotoCache.clear) {
        window.attendancePhotoCache.clear();
        console.log("  ✅ window.attendancePhotoCache cleared");
    }
    
    // Reset cache rekap-per-siswa.js
    if (typeof rekapPhotoCache !== 'undefined' && rekapPhotoCache.clear) {
        rekapPhotoCache.clear();
        console.log("  ✅ rekapPhotoCache cleared");
    } else if (typeof window.rekapPhotoCache !== 'undefined' && window.rekapPhotoCache.clear) {
        window.rekapPhotoCache.clear();
        console.log("  ✅ window.rekapPhotoCache cleared");
    }
    
    // Reset cache staff.js
    if (typeof staffPhotoCache !== 'undefined' && staffPhotoCache.clear) {
        staffPhotoCache.clear();
        console.log("  ✅ staffPhotoCache cleared");
    } else if (typeof window.staffPhotoCache !== 'undefined' && window.staffPhotoCache.clear) {
        window.staffPhotoCache.clear();
        console.log("  ✅ window.staffPhotoCache cleared");
    }
    
    // Reset cache chat.js (jika ada)
    if (typeof chatPhotoCache !== 'undefined' && chatPhotoCache.clear) {
        chatPhotoCache.clear();
        console.log("  ✅ chatPhotoCache cleared");
    }
    
    console.log("✅ Semua cache foto berhasil dibersihkan!");
}

/**
 * Refresh semua avatar di UI (global version)
 * Memperbarui semua elemen avatar dengan timestamp untuk bypass cache browser
 */
function refreshAllAvatarsGlobal() {
    if (!currentUser) {
        console.log("⚠️ refreshAllAvatarsGlobal: No currentUser, skipping");
        return;
    }
    
    console.log("🖼️ refreshAllAvatarsGlobal - Memperbarui semua avatar...");
    
    const timestamp = Date.now();
    let photoUrl = currentUser.photoUrl;
    
    // Jika tidak ada foto, gunakan avatar default dengan timestamp
    if (!photoUrl || photoUrl === 'null' || photoUrl === 'undefined' || photoUrl === '') {
        const initial = currentUser.nama ? currentUser.nama.charAt(0).toUpperCase() : 'U';
        photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=00bcd4&color=fff&size=100&bold=true&t=${timestamp}`;
    } else {
        // Tambahkan timestamp untuk bypass cache browser
        const separator = photoUrl.includes('?') ? '&' : '?';
        photoUrl = photoUrl.split('?')[0] + separator + 't=' + timestamp;
    }
    
    // Update semua elemen avatar yang diketahui
    const avatarElements = [
        'headerAvatar',      // Header avatar
        'navbarAvatar',      // Navbar avatar
        'sidebarAvatar',     // Sidebar avatar
        'profileImg'         // Profile modal image
    ];
    
    let updatedCount = 0;
    avatarElements.forEach(id => {
        const el = document.getElementById(id);
        if (el && photoUrl) {
            // Hapus event onerror sementara untuk menghindari infinite loop
            const oldOnError = el.onerror;
            el.onerror = null;
            el.src = photoUrl;
            el.onerror = oldOnError;
            updatedCount++;
        }
    });
    
    // Update sidebar user image (jika ada struktur berbeda)
    const sidebarUserImg = document.querySelector('#sidebarUserInfo img, .sidebar-user-img');
    if (sidebarUserImg && photoUrl) {
        sidebarUserImg.src = photoUrl;
        updatedCount++;
    }
    
    // Update navbar user image (jika ada struktur berbeda)
    const navbarUserImg = document.querySelector('.navbar-user img');
    if (navbarUserImg && photoUrl && navbarUserImg.id !== 'navbarAvatar') {
        navbarUserImg.src = photoUrl;
        updatedCount++;
    }
    
    console.log(`✅ ${updatedCount} avatar berhasil diperbarui dengan timestamp: ${timestamp}`);
    
    // Refresh tabel yang sedang aktif untuk update foto di list
    refreshActiveTablesPhotos();
}

/**
 * Refresh foto di semua tabel yang sedang aktif
 */
function refreshActiveTablesPhotos() {
    const activeTab = document.querySelector('.tab-content.active')?.id;
    
    console.log(`🖼️ Refreshing photos for active tab: ${activeTab}`);
    
    switch(activeTab) {
        case 'tab-students':
            if (typeof renderStudentsTable === 'function') {
                renderStudentsTable();
                console.log("  ✅ Students table refreshed");
            }
            break;
        case 'tab-attendance':
            if (typeof renderTable === 'function') {
                renderTable();
                console.log("  ✅ Attendance table refreshed");
            }
            break;
        case 'tab-rekap':
            if (typeof loadRekap === 'function') {
                loadRekap();
                console.log("  ✅ Rekap table refreshed");
            }
            if (typeof loadRekapPerSiswa === 'function') {
                loadRekapPerSiswa();
            }
            break;
        case 'tab-staff':
            if (typeof renderStaffTable === 'function') {
                renderStaffTable();
                console.log("  ✅ Staff table refreshed");
            }
            break;
        case 'tab-staff-attendance':
            if (typeof renderStaffAttendanceTable === 'function') {
                renderStaffAttendanceTable();
                console.log("  ✅ Staff attendance table refreshed");
            }
            break;
        default:
            console.log("  ℹ️ No table refresh needed for this tab");
    }
    
    // Refresh friends list jika ada
    if (typeof loadFriendsList === 'function' && document.getElementById('tab-friends')?.classList.contains('active')) {
        loadFriendsList();
        console.log("  ✅ Friends list refreshed");
    }
    
    // Refresh chat list jika ada
    if (typeof loadChatList === 'function' && document.getElementById('tab-chat')?.classList.contains('active')) {
        loadChatList();
        console.log("  ✅ Chat list refreshed");
    }
}

/**
 * Force refresh semua foto (reset cache + refresh UI)
 * @param {boolean} clearCacheFirst - Apakah akan membersihkan cache terlebih dahulu
 */
async function forceRefreshAllPhotos(clearCacheFirst = true) {
    console.log("🖼️ forceRefreshAllPhotos - Memulai refresh paksa semua foto...");
    
    if (clearCacheFirst) {
        resetAllPhotoCaches();
    }
    
    // Refresh avatar user
    refreshAllAvatarsGlobal();
    
    // Tunggu sebentar agar DOM update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Refresh semua tabel yang mungkin menampilkan foto
    if (typeof renderStudentsTable === 'function') {
        renderStudentsTable();
    }
    if (typeof renderTable === 'function') {
        renderTable();
    }
    if (typeof loadRekap === 'function') {
        loadRekap();
    }
    if (typeof renderStaffTable === 'function') {
        renderStaffTable();
    }
    if (typeof renderStaffAttendanceTable === 'function') {
        renderStaffAttendanceTable();
    }
    if (typeof loadFriendsList === 'function') {
        loadFriendsList();
    }
    if (typeof loadChatList === 'function') {
        loadChatList();
    }
    
    console.log("✅ Force refresh semua foto selesai!");
    
    // Tampilkan toast notifikasi
    if (typeof showToast === 'function') {
        showToast("🖼️ Semua foto telah direfresh", "success");
    }
}

/**
 * Mendapatkan URL foto dengan timestamp (untuk bypass cache)
 * @param {string} photoUrl - URL foto asli
 * @returns {string} URL dengan timestamp
 */
function getPhotoUrlWithTimestamp(photoUrl) {
    if (!photoUrl || photoUrl === 'null' || photoUrl === 'undefined' || photoUrl === '') {
        return null;
    }
    
    const timestamp = Date.now();
    const separator = photoUrl.includes('?') ? '&' : '?';
    return photoUrl.split('?')[0] + separator + 't=' + timestamp;
}

/**
 * Preload foto untuk mencegah flicker
 * @param {string} photoUrl - URL foto yang akan dipreload
 * @returns {Promise<boolean>} - True jika berhasil dimuat
 */
function preloadPhoto(photoUrl) {
    return new Promise((resolve) => {
        if (!photoUrl || photoUrl === 'null' || photoUrl === 'undefined') {
            resolve(false);
            return;
        }
        
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = photoUrl;
    });
}

/**
 * Preload semua foto di halaman yang sedang aktif
 */
async function preloadAllVisiblePhotos() {
    console.log("🖼️ Preloading all visible photos...");
    
    const photoElements = document.querySelectorAll('img[src*="avatar"], img[src*="ui-avatars"], img.student-avatar, img.attendance-student-avatar');
    const promises = [];
    
    photoElements.forEach(img => {
        if (img.src && !img.complete) {
            promises.push(preloadPhoto(img.src));
        }
    });
    
    if (promises.length > 0) {
        await Promise.all(promises);
        console.log(`✅ Preloaded ${promises.length} photos`);
    }
}

// ======================== ORIGINAL FUNCTIONS (TETAP DIJAGA) ========================

/**
 * Menampilkan toast notification
 * @param {string} msg - Pesan yang akan ditampilkan
 * @param {string} type - Tipe notifikasi ('success', 'error', 'info', 'warning')
 */
function showToast(msg, type) {
    var t = document.getElementById('toast');
    if (t) {
        t.textContent = msg;
        
        // Set warna border berdasarkan tipe
        switch(type) {
            case 'error':
                t.style.borderLeftColor = '#f44336';
                break;
            case 'warning':
                t.style.borderLeftColor = '#ff9800';
                break;
            case 'info':
                t.style.borderLeftColor = '#2196f3';
                break;
            default:
                t.style.borderLeftColor = '#00bcd4';
        }
        
        t.className = 'toast show';
        setTimeout(function() {
            t.className = t.className.replace('show', '');
        }, 3000);
    }
}

/**
 * Menutup modal berdasarkan ID
 * @param {string} id - ID modal yang akan ditutup
 */
function closeModal(id) {
    var m = document.getElementById(id);
    if (m) m.classList.remove('open');
}

/**
 * Toggle modal friends
 */
function toggleFriendsModal() {
    var modal = document.getElementById('modal-friends');
    if (modal) {
        modal.classList.add('open');
        if (typeof renderFriendsPanel === 'function') renderFriendsPanel();
    }
}

/**
 * Buka modal chat
 */
function openChatModal() {
    var modal = document.getElementById('modal-chat');
    if (modal) {
        modal.classList.add('open');
        if (typeof renderChatInterface === 'function') renderChatInterface('chatModalPanel');
    }
}

/**
 * Buka modal AI Summary
 */
function openAISummaryModal() {
    if (typeof window.openAISummaryModal === 'function') {
        window.openAISummaryModal();
    } else {
        console.log("openAISummaryModal not ready");
        // Fallback: coba buka modal langsung
        var modal = document.getElementById('modal-ai-summary');
        if (modal) modal.classList.add('open');
    }
}

/**
 * Buka modal AI Assistant
 */
function openAIAssistantModal() {
    if (typeof window.openAIAssistantModal === 'function') {
        window.openAIAssistantModal();
    } else {
        console.log("openAIAssistantModal not ready");
        // Fallback: coba buka modal langsung
        var modal = document.getElementById('modal-ai-assistant');
        if (modal) modal.classList.add('open');
    }
}

/**
 * Tutup modal AI Assistant
 */
function closeAIAssistantModal() {
    var modal = document.getElementById('modal-ai-assistant');
    if (modal) modal.classList.remove('open');
    if (typeof window.closeAIAssistantModal === 'function') {
        window.closeAIAssistantModal();
    }
}

// ======================== AUTO INITIALIZATION ========================

/**
 * Setup listener untuk perubahan foto user secara realtime
 */
function setupGlobalPhotoListener() {
    if (!currentUser || !currentUser.uid) return;
    
    if (typeof db !== 'undefined' && db) {
        // Listener untuk perubahan photoUrl
        db.ref(`users_auth/${currentUser.uid}/photoUrl`).on('value', (snapshot) => {
            const newPhotoUrl = snapshot.val();
            if (newPhotoUrl && currentUser.photoUrl !== newPhotoUrl) {
                console.log("🖼️ Photo URL changed in Firebase, refreshing all avatars...");
                currentUser.photoUrl = newPhotoUrl;
                
                // Simpan ke localStorage
                if (typeof saveUserToLocalStorage === 'function') {
                    saveUserToLocalStorage(currentUser);
                }
                
                // Refresh semua avatar
                refreshAllAvatarsGlobal();
                
                // Reset cache untuk user ini
                if (currentUser.fpId) {
                    if (typeof studentPhotoCache !== 'undefined' && studentPhotoCache.delete) {
                        studentPhotoCache.delete(currentUser.fpId);
                    }
                    if (typeof attendancePhotoCache !== 'undefined' && attendancePhotoCache.delete) {
                        attendancePhotoCache.delete(currentUser.fpId);
                    }
                }
                
                // Tampilkan notifikasi
                showToast("🖼️ Foto profil telah diperbarui", "info");
            }
        });
    }
}

// Jalankan setup listener saat user tersedia
if (typeof currentUser !== 'undefined' && currentUser) {
    setTimeout(setupGlobalPhotoListener, 1000);
}

// ======================== EXPORT KE GLOBAL ========================

// Fungsi baru untuk manajemen foto
window.resetAllPhotoCaches = resetAllPhotoCaches;
window.refreshAllAvatarsGlobal = refreshAllAvatarsGlobal;
window.refreshActiveTablesPhotos = refreshActiveTablesPhotos;
window.forceRefreshAllPhotos = forceRefreshAllPhotos;
window.getPhotoUrlWithTimestamp = getPhotoUrlWithTimestamp;
window.preloadPhoto = preloadPhoto;
window.preloadAllVisiblePhotos = preloadAllVisiblePhotos;
window.setupGlobalPhotoListener = setupGlobalPhotoListener;

// Fungsi original
window.showToast = showToast;
window.closeModal = closeModal;
window.toggleFriendsModal = toggleFriendsModal;
window.openChatModal = openChatModal;
window.openAISummaryModal = openAISummaryModal;
window.openAIAssistantModal = openAIAssistantModal;
window.closeAIAssistantModal = closeAIAssistantModal;

console.log("✅ global-functions.js V2.0 loaded - Photo cache management & force refresh functions added");