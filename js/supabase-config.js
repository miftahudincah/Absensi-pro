// supabase-config.js - VERSION 5.0 (SUPABASE ONLY - NO FALLBACK)
// Semua operasi upload/delete melalui backend proxy (API Key aman di server)
// ONLY SUPABASE STORAGE - No ImgBB fallback
// Menggunakan FormData (file asli, bukan base64) untuk efisiensi
// ============================================================================

// ======================= KONFIGURASI BACKEND =======================
const BACKEND_URL = "https://backendtest-azure.vercel.app";

// ======================= KONFIGURASI SUPABASE (PRODUCTION) =======================
// Menggunakan project Supabase yang aktif: aaveyddnxsxmrxwhjbsi
const SUPABASE_URL = 'https://aaveyddnxsxmrxwhjbsi.supabase.co';
const STORAGE_BUCKET = 'foto-absensi';

// Flag untuk status
let backendAvailable = true;
let autoDeleteInterval = null;

// ======================= FUNGSI UTILITY =======================

/**
 * Ekstrak path dari URL Supabase
 * @param {string} url - URL lengkap dari Supabase
 * @returns {string|null} Path file atau null
 */
function extractPathFromUrl(url) {
    if (!url || !url.includes(SUPABASE_URL)) return null;
    
    try {
        const pattern = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/`;
        if (url.startsWith(pattern)) {
            return decodeURIComponent(url.replace(pattern, ''));
        }
        
        const altPattern = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
        const altIndex = url.indexOf(altPattern);
        if (altIndex !== -1) {
            return decodeURIComponent(url.substring(altIndex + altPattern.length));
        }
        
        return null;
    } catch (e) {
        console.error('Extract path error:', e);
        return null;
    }
}

/**
 * Validasi file gambar
 * @param {File} file - File yang akan divalidasi
 * @param {string} folder - Folder tujuan (untuk menentukan max size)
 * @returns {Object} { valid: boolean, error: string }
 */
function validateImageFile(file, folder = 'uploads') {
    if (!file) {
        return { valid: false, error: 'Tidak ada file yang dipilih' };
    }
    
    // Validasi tipe file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        return { valid: false, error: 'Hanya file gambar yang diperbolehkan! (JPG, PNG, GIF, WEBP)' };
    }
    
    // Validasi ukuran file
    let maxSize = 2 * 1024 * 1024; // default 2MB
    if (folder === 'status') maxSize = 5 * 1024 * 1024;
    if (folder === 'chat') maxSize = 5 * 1024 * 1024;
    
    if (file.size > maxSize) {
        const sizeMB = maxSize / (1024 * 1024);
        return { valid: false, error: `Ukuran gambar maksimal ${sizeMB}MB!` };
    }
    
    return { valid: true, error: null };
}

// ======================= FUNGSI UPLOAD VIA BACKEND PROXY =======================

/**
 * Upload file melalui backend proxy menggunakan FormData (file asli)
 * ONLY SUPABASE - No fallback to ImgBB
 * @param {File} file - File yang akan diupload
 * @param {string} folder - Folder tujuan (profiles, school, status, chat)
 * @param {string} userId - ID user (untuk folder personal, opsional)
 * @returns {Promise<{success: boolean, url: string, path: string}>}
 */
async function uploadToSupabaseBackend(file, folder = 'uploads', userId = null) {
    // Validasi file
    const validation = validateImageFile(file, folder);
    if (!validation.valid) {
        throw new Error(validation.error);
    }
    
    console.log(`📤 Uploading to Supabase via backend: folder=${folder}, userId=${userId}, file=${file.name}, size=${(file.size / 1024).toFixed(2)}KB`);
    
    try {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('folder', folder);
        if (userId && userId !== 'null' && userId !== 'undefined' && userId !== '') {
            formData.append('userId', userId);
        }
        formData.append('bucket', STORAGE_BUCKET);
        
        const response = await fetch(`${BACKEND_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            let errorMessage = `Upload failed: HTTP ${response.status}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                // Ignore JSON parsing error
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Upload successful to Supabase: ${data.data.url}`);
            backendAvailable = true;
            return {
                success: true,
                url: data.data.url,
                path: data.data.path,
                storage: data.data.storage || 'supabase'
            };
        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error.message);
        backendAvailable = false;
        throw error;
    }
}

// ======================= FUNGSI DELETE VIA BACKEND PROXY =======================

/**
 * Hapus file melalui backend proxy (AMAN)
 * @param {string} fileUrlOrPath - URL atau path file
 * @returns {Promise<boolean>}
 */
async function deleteFromSupabaseBackend(fileUrlOrPath) {
    if (!fileUrlOrPath) return false;
    
    // Jika bukan URL Supabase, skip
    if (!fileUrlOrPath.includes(SUPABASE_URL) && !fileUrlOrPath.includes('supabase.co')) {
        console.log('Not a Supabase URL, skipping delete');
        return true;
    }
    
    console.log(`🗑️ Deleting via backend proxy: ${fileUrlOrPath.substring(0, 100)}...`);
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/storage/delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fileUrl: fileUrlOrPath,
                bucket: STORAGE_BUCKET
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ Deleted successfully via backend`);
            return true;
        } else {
            console.warn(`Delete failed: ${data.message || 'Unknown error'}`);
            return false;
        }
    } catch (error) {
        console.error('Delete via backend error:', error.message);
        return false;
    }
}

// ======================= FUNGSI KHUSUS UPLOAD =======================

/**
 * Upload foto profil
 * @param {File} file - File gambar
 * @param {string} userId - ID user
 * @returns {Promise<string>} URL foto profil
 */
async function uploadProfilePhotoToSupabase(file, userId) {
    if (!userId) {
        throw new Error('User ID is required for profile photo upload');
    }
    const result = await uploadToSupabaseBackend(file, 'profiles', userId);
    return result.url;
}

/**
 * Upload logo sekolah
 * @param {File} file - File gambar logo
 * @returns {Promise<string>} URL logo
 */
async function uploadSchoolLogoToSupabase(file) {
    const result = await uploadToSupabaseBackend(file, 'school');
    return result.url;
}

/**
 * Upload status image (dengan auto-delete setelah 24 jam)
 * @param {File} file - File gambar
 * @param {string} userId - ID user
 * @returns {Promise<{url: string, path: string}>}
 */
async function uploadStatusImageToSupabase(file, userId) {
    const result = await uploadToSupabaseBackend(file, 'status', userId);
    return {
        url: result.url,
        path: result.path
    };
}

/**
 * Upload chat image
 * @param {File} file - File gambar
 * @returns {Promise<string>} URL gambar chat
 */
async function uploadChatImageToSupabase(file) {
    const result = await uploadToSupabaseBackend(file, 'chat');
    return result.url;
}

/**
 * Upload dengan fallback (sekarang hanya Supabase)
 * @param {File} file - File yang akan diupload
 * @param {string} folder - Folder tujuan
 * @param {string} userId - ID user (opsional)
 * @returns {Promise<{success: boolean, url: string, path: string|null}>}
 */
async function uploadWithFallback(file, folder, userId = null) {
    // Sekarang hanya menggunakan Supabase, tidak ada fallback
    const result = await uploadToSupabaseBackend(file, folder, userId);
    return { 
        success: true, 
        url: result.url, 
        path: result.path,
        storage: result.storage
    };
}

// ======================= DELETE FOTO LAMA SAAT UPDATE =======================

/**
 * Hapus foto profil lama user saat diganti
 * @param {string} userId - ID user
 * @param {string} newPhotoUrl - URL foto baru (tidak akan dihapus)
 */
async function deleteOldProfilePhoto(userId, newPhotoUrl) {
    if (!userId) return;
    
    try {
        if (typeof db === 'undefined' || !db) {
            console.warn('Firebase db not available, skipping old photo deletion');
            return;
        }
        
        const snapshot = await db.ref(`users_auth/${userId}`).once('value');
        const userData = snapshot.val();
        const oldPhotoUrl = userData?.photoUrl;
        
        if (oldPhotoUrl && oldPhotoUrl !== newPhotoUrl && oldPhotoUrl !== 'null' && oldPhotoUrl !== 'undefined') {
            console.log(`🗑️ Menghapus foto profil lama untuk user ${userId}`);
            await deleteFromSupabaseBackend(oldPhotoUrl);
        }
    } catch (error) {
        console.error('Error deleting old profile photo:', error.message);
    }
}

/**
 * Hapus logo sekolah lama saat diganti
 * @param {string} newLogoUrl - URL logo baru (tidak akan dihapus)
 */
async function deleteOldSchoolLogo(newLogoUrl) {
    try {
        if (typeof db === 'undefined' || !db) {
            console.warn('Firebase db not available, skipping old logo deletion');
            return;
        }
        
        const snapshot = await db.ref('system_config/schoolLogo').once('value');
        const oldLogoUrl = snapshot.val();
        
        if (oldLogoUrl && oldLogoUrl !== newLogoUrl && oldLogoUrl !== 'null' && oldLogoUrl !== 'undefined') {
            console.log('🗑️ Menghapus logo sekolah lama');
            await deleteFromSupabaseBackend(oldLogoUrl);
        }
    } catch (error) {
        console.error('Error deleting old school logo:', error.message);
    }
}

/**
 * Hapus gambar status tertentu (saat user menghapus status manual)
 * @param {string} statusMediaUrl - URL gambar status
 * @returns {Promise<boolean>}
 */
async function deleteStatusImage(statusMediaUrl) {
    if (statusMediaUrl && statusMediaUrl !== 'null' && statusMediaUrl !== 'undefined') {
        return await deleteFromSupabaseBackend(statusMediaUrl);
    }
    return false;
}

// ======================= AUTO DELETE EXPIRED STATUS (SETIAP 1 JAM) =======================

/**
 * Hapus semua status yang sudah expired (>24 jam) beserta gambarnya
 * Fungsi ini dipanggil oleh auto-delete interval
 */
async function deleteExpiredStatusImages() {
    console.log('🕐 Checking for expired statuses...');
    
    if (typeof db === 'undefined' || !db) {
        console.warn('Firebase not available, skipping expired status cleanup');
        return;
    }
    
    try {
        const snapshot = await db.ref('statuses').once('value');
        const allStatuses = snapshot.val();
        
        if (!allStatuses) {
            console.log('No statuses found');
            return;
        }
        
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        let deletedCount = 0;
        let expiredStatuses = [];
        
        for (const [userId, userStatuses] of Object.entries(allStatuses)) {
            if (!userStatuses) continue;
            
            for (const [statusId, statusData] of Object.entries(userStatuses)) {
                const createdAt = statusData?.createdAt;
                if (createdAt && (now - createdAt) > twentyFourHours) {
                    expiredStatuses.push({ userId, statusId, statusData });
                }
            }
        }
        
        for (const { userId, statusId, statusData } of expiredStatuses) {
            if (statusData.mediaUrl && statusData.mediaUrl !== 'null' && statusData.mediaUrl !== 'undefined') {
                const deleted = await deleteFromSupabaseBackend(statusData.mediaUrl);
                if (deleted) deletedCount++;
            }
            await db.ref(`statuses/${userId}/${statusId}`).remove();
            console.log(`🗑️ Expired status deleted: ${userId}/${statusId}`);
        }
        
        if (deletedCount > 0) {
            console.log(`✅ Deleted ${deletedCount} expired status images`);
        }
        
        if (expiredStatuses.length > 0) {
            console.log(`✅ Removed ${expiredStatuses.length} expired statuses`);
        }
        
    } catch (error) {
        console.error('Error deleting expired statuses:', error.message);
    }
}

/**
 * Start auto-delete interval (setiap 1 jam)
 */
function startAutoDeleteExpiredStatus() {
    if (autoDeleteInterval) {
        clearInterval(autoDeleteInterval);
    }
    
    autoDeleteInterval = setInterval(() => {
        console.log('🕐 Running scheduled expired status cleanup...');
        deleteExpiredStatusImages();
    }, 60 * 60 * 1000);
    
    setTimeout(() => deleteExpiredStatusImages(), 5000);
    console.log('✅ Auto-delete for expired statuses started (every 1 hour)');
}

/**
 * Stop auto-delete interval
 */
function stopAutoDeleteExpiredStatus() {
    if (autoDeleteInterval) {
        clearInterval(autoDeleteInterval);
        autoDeleteInterval = null;
        console.log('⏹️ Auto-delete stopped');
    }
}

// ======================= FUNGSI READ-ONLY =======================

/**
 * Mendapatkan public URL dari path (untuk menampilkan gambar)
 * @param {string} filePath - Path file di storage
 * @returns {string} Public URL
 */
function getPublicUrl(filePath) {
    if (!filePath) return '';
    if (filePath.startsWith('http')) return filePath;
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${filePath}`;
}

/**
 * List semua file di folder tertentu (read-only)
 * @param {string} folderPath - Path folder
 * @returns {Promise<Array>} List file
 */
async function listFilesInFolder(folderPath = '') {
    try {
        const response = await fetch(`${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${folderPath}?list`);
        if (!response.ok) return [];
        const data = await response.json();
        return data || [];
    } catch (error) {
        console.error('List files error:', error.message);
        return [];
    }
}

// ======================= CEK KONEKSI BACKEND =======================

/**
 * Cek koneksi ke backend
 * @returns {Promise<boolean>}
 */
async function checkBackendConnection() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        const supabaseActive = data.services?.supabase === true;
        console.log(`🔌 Backend: ${data.success ? 'Connected' : 'Failed'}, Supabase: ${supabaseActive ? 'Active' : 'Inactive'}`);
        return data.success === true && supabaseActive;
    } catch (error) {
        console.warn('Backend connection check failed:', error.message);
        return false;
    }
}

// Jalankan pengecekan koneksi saat load
setTimeout(() => {
    checkBackendConnection().then(isConnected => {
        if (isConnected) {
            console.log('✅ Backend connected with Supabase active:', BACKEND_URL);
        } else {
            console.warn('⚠️ Backend or Supabase not available:', BACKEND_URL);
        }
    });
}, 1000);

// ======================= EKSPOR KE GLOBAL =======================

// Konfigurasi
window.SUPABASE_URL = SUPABASE_URL;
window.STORAGE_BUCKET = STORAGE_BUCKET;
window.BACKEND_STORAGE_URL = BACKEND_URL;

// Write operations (via backend)
window.uploadToSupabase = uploadToSupabaseBackend;
window.deleteFromSupabase = deleteFromSupabaseBackend;
window.uploadProfilePhotoToSupabase = uploadProfilePhotoToSupabase;
window.uploadStatusImageToSupabase = uploadStatusImageToSupabase;
window.uploadSchoolLogoToSupabase = uploadSchoolLogoToSupabase;
window.uploadChatImageToSupabase = uploadChatImageToSupabase;
window.uploadWithFallback = uploadWithFallback;

// Delete helpers
window.deleteExpiredStatusImages = deleteExpiredStatusImages;
window.deleteOldProfilePhoto = deleteOldProfilePhoto;
window.deleteOldSchoolLogo = deleteOldSchoolLogo;
window.deleteStatusImage = deleteStatusImage;

// Auto-delete
window.startAutoDeleteExpiredStatus = startAutoDeleteExpiredStatus;
window.stopAutoDeleteExpiredStatus = stopAutoDeleteExpiredStatus;

// Utility functions
window.extractPathFromUrl = extractPathFromUrl;
window.getPublicUrl = getPublicUrl;
window.listFilesInFolder = listFilesInFolder;
window.validateImageFile = validateImageFile;
window.checkBackendConnection = checkBackendConnection;

console.log('✅ supabase-config.js V5.0 loaded - SUPABASE ONLY (No ImgBB fallback)!');
console.log(`   🔒 Backend: ${BACKEND_URL}`);
console.log(`   🗄️ Supabase: ${SUPABASE_URL}`);
console.log(`   📁 Storage bucket: ${STORAGE_BUCKET}`);
console.log(`   📸 Using FormData (file asli) for upload - lebih efisien!`);