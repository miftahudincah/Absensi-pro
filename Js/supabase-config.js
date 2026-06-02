// supabase-config.js - VERSION 2.1 (FULL INTEGRATION)
// Konfigurasi Supabase untuk penyimpanan gambar
// Mendukung: foto profil, logo sekolah, status, chat image
// Auto-delete file saat data dihapus atau expired
// Fallback ke ImgBB jika Supabase gagal
// ============================================================================

// Konfigurasi dari index.html
const SUPABASE_URL = 'https://hxxvyjzpcabwuvvbgftu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_7XOS2VtvUVGjAZI8nruo8w_P9qxJNVm';
const STORAGE_BUCKET = 'foto-absensi';

// Inisialisasi Supabase
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Flag untuk fallback
let supabaseAvailable = true;
let autoDeleteInterval = null;

// ======================= FUNGSI UTILITY =======================

/**
 * Ekstrak path dari URL Supabase
 * Contoh: https://.../storage/v1/object/public/foto-absensi/profiles/uid/xxx.jpg
 * Menjadi: profiles/uid/xxx.jpg
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
 * Generate unique filename
 */
function generateFileName(prefix, extension) {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 10);
    return `${prefix}/${timestamp}_${randomStr}.${extension}`;
}

/**
 * Dapatkan ekstensi file
 */
function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
}

// ======================= FUNGSI UPLOAD KE SUPABASE =======================

/**
 * Upload file ke Supabase Storage
 * @param {File} file - File yang akan diupload
 * @param {string} folder - Folder tujuan (profiles, school, status, chat)
 * @param {string} userId - ID user (untuk folder personal, opsional)
 * @returns {Promise<{success: boolean, url: string, path: string}>}
 */
async function uploadToSupabase(file, folder = 'uploads', userId = null) {
    if (!file) throw new Error('Tidak ada file yang dipilih');
    
    // Validasi tipe file
    if (!file.type.match('image.*')) {
        throw new Error('Hanya file gambar yang diperbolehkan!');
    }
    
    // Validasi ukuran file (max 5MB untuk status, 2MB untuk profile/logo)
    let maxSize = 2 * 1024 * 1024; // default 2MB
    if (folder === 'status') maxSize = 5 * 1024 * 1024;
    if (folder === 'chat') maxSize = 5 * 1024 * 1024;
    
    if (file.size > maxSize) {
        throw new Error(`Ukuran gambar maksimal ${maxSize / (1024 * 1024)}MB!`);
    }
    
    // Tentukan path lengkap
    let fullPath;
    const ext = getFileExtension(file.name);
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    
    if (userId) {
        fullPath = `${folder}/${userId}/${timestamp}_${randomStr}.${ext}`;
    } else {
        fullPath = `${folder}/${timestamp}_${randomStr}.${ext}`;
    }
    
    console.log(`📤 Uploading to Supabase: ${fullPath}`);
    
    try {
        const { data, error } = await supabaseClient.storage
            .from(STORAGE_BUCKET)
            .upload(fullPath, file, {
                cacheControl: '3600',
                upsert: false,
                contentType: file.type
            });
        
        if (error) {
            console.error('Supabase upload error:', error);
            supabaseAvailable = false;
            throw new Error('Gagal mengupload ke Supabase: ' + error.message);
        }
        
        // Dapatkan public URL
        const { data: urlData } = supabaseClient.storage
            .from(STORAGE_BUCKET)
            .getPublicUrl(fullPath);
        
        supabaseAvailable = true;
        console.log(`✅ Upload successful: ${urlData.publicUrl}`);
        
        return {
            success: true,
            url: urlData.publicUrl,
            path: fullPath
        };
    } catch (error) {
        console.error('Upload error:', error);
        throw error;
    }
}

// ======================= FUNGSI DELETE DARI SUPABASE =======================

/**
 * Hapus file dari Supabase Storage
 * @param {string} fileUrlOrPath - URL atau path file
 * @returns {Promise<boolean>}
 */
async function deleteFromSupabase(fileUrlOrPath) {
    if (!fileUrlOrPath) return false;
    
    // Ekstrak path
    let path = fileUrlOrPath;
    if (fileUrlOrPath.includes(SUPABASE_URL) || fileUrlOrPath.includes('supabase.co')) {
        path = extractPathFromUrl(fileUrlOrPath);
        if (!path) {
            console.warn('Could not extract path from URL:', fileUrlOrPath);
            return false;
        }
    }
    
    if (!path) return false;
    
    console.log(`🗑️ Deleting from Supabase: ${path}`);
    
    try {
        const { error } = await supabaseClient.storage
            .from(STORAGE_BUCKET)
            .remove([path]);
        
        if (error) {
            console.error('Supabase delete error:', error);
            return false;
        }
        
        console.log(`✅ Deleted: ${path}`);
        return true;
    } catch (error) {
        console.error('Delete error:', error);
        return false;
    }
}

// ======================= FUNGSI KHUSUS UPLOAD =======================

/**
 * Upload foto profil
 */
async function uploadProfilePhotoToSupabase(file, userId) {
    const result = await uploadToSupabase(file, 'profiles', userId);
    return result.url;
}

/**
 * Upload logo sekolah
 */
async function uploadSchoolLogoToSupabase(file) {
    const result = await uploadToSupabase(file, 'school');
    return result.url;
}

/**
 * Upload status image (dengan auto-delete setelah 24 jam)
 */
async function uploadStatusImageToSupabase(file, userId) {
    const result = await uploadToSupabase(file, 'status', userId);
    return {
        url: result.url,
        path: result.path
    };
}

/**
 * Upload chat image
 */
async function uploadChatImageToSupabase(file) {
    const result = await uploadToSupabase(file, 'chat');
    return result.url;
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
        const snapshot = await db.ref(`users_auth/${userId}`).once('value');
        const userData = snapshot.val();
        const oldPhotoUrl = userData?.photoUrl;
        
        if (oldPhotoUrl && oldPhotoUrl !== newPhotoUrl && oldPhotoUrl.includes(SUPABASE_URL)) {
            console.log(`🗑️ Menghapus foto profil lama untuk user ${userId}`);
            await deleteFromSupabase(oldPhotoUrl);
        }
    } catch (error) {
        console.error('Error deleting old profile photo:', error);
    }
}

/**
 * Hapus logo sekolah lama saat diganti
 * @param {string} newLogoUrl - URL logo baru (tidak akan dihapus)
 */
async function deleteOldSchoolLogo(newLogoUrl) {
    try {
        const snapshot = await db.ref('system_config/schoolLogo').once('value');
        const oldLogoUrl = snapshot.val();
        
        if (oldLogoUrl && oldLogoUrl !== newLogoUrl && oldLogoUrl.includes(SUPABASE_URL)) {
            console.log('🗑️ Menghapus logo sekolah lama');
            await deleteFromSupabase(oldLogoUrl);
        }
    } catch (error) {
        console.error('Error deleting old school logo:', error);
    }
}

/**
 * Hapus gambar status tertentu (saat user menghapus status manual)
 * @param {string} statusMediaUrl - URL gambar status
 */
async function deleteStatusImage(statusMediaUrl) {
    if (statusMediaUrl && statusMediaUrl.includes(SUPABASE_URL)) {
        return await deleteFromSupabase(statusMediaUrl);
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
        
        // Loop melalui semua user yang punya status
        for (const [userId, userStatuses] of Object.entries(allStatuses)) {
            for (const [statusId, statusData] of Object.entries(userStatuses)) {
                const createdAt = statusData.createdAt;
                
                // Cek apakah status sudah expired (> 24 jam)
                if (createdAt && (now - createdAt) > twentyFourHours) {
                    expiredStatuses.push({ userId, statusId, statusData });
                }
            }
        }
        
        // Hapus status yang expired
        for (const { userId, statusId, statusData } of expiredStatuses) {
            // Hapus gambar dari Supabase jika ada
            if (statusData.mediaUrl && statusData.mediaUrl.includes(SUPABASE_URL)) {
                const deleted = await deleteFromSupabase(statusData.mediaUrl);
                if (deleted) deletedCount++;
            }
            
            // Hapus dari Firebase
            await db.ref(`statuses/${userId}/${statusId}`).remove();
            console.log(`🗑️ Expired status deleted: ${userId}/${statusId}`);
        }
        
        if (deletedCount > 0) {
            console.log(`✅ Deleted ${deletedCount} expired status images from Supabase`);
        }
        
        if (expiredStatuses.length > 0) {
            console.log(`✅ Removed ${expiredStatuses.length} expired statuses from Firebase`);
        }
        
    } catch (error) {
        console.error('Error deleting expired statuses:', error);
    }
}

/**
 * Start auto-delete interval (setiap 1 jam)
 */
function startAutoDeleteExpiredStatus() {
    if (autoDeleteInterval) clearInterval(autoDeleteInterval);
    
    // Jalankan setiap 1 jam
    autoDeleteInterval = setInterval(() => {
        console.log('🕐 Running scheduled expired status cleanup...');
        deleteExpiredStatusImages();
    }, 60 * 60 * 1000); // 1 jam
    
    // Jalankan sekali saat startup (delay 5 detik)
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

// ======================= FALLBACK KE IMGBB =======================

/**
 * Upload ke ImgBB (fallback jika Supabase gagal)
 */
async function uploadToImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);
    
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
        method: 'POST',
        body: formData
    });
    
    const data = await response.json();
    if (!data.success) {
        throw new Error('ImgBB upload failed: ' + (data.error?.message || 'Unknown error'));
    }
    
    return data.data.image.url;
}

/**
 * Upload dengan fallback (coba Supabase dulu, gagal pakai ImgBB)
 * @param {File} file - File yang akan diupload
 * @param {string} folder - Folder tujuan
 * @param {string} userId - ID user (opsional)
 * @returns {Promise<{success: boolean, url: string, path: string|null, isFallback: boolean}>}
 */
async function uploadWithFallback(file, folder, userId = null) {
    if (supabaseAvailable) {
        try {
            const result = await uploadToSupabase(file, folder, userId);
            return { success: true, url: result.url, path: result.path, isFallback: false };
        } catch (error) {
            console.warn('Supabase failed, falling back to ImgBB:', error.message);
            supabaseAvailable = false;
            try {
                const url = await uploadToImgBB(file);
                return { success: true, url: url, path: null, isFallback: true };
            } catch (fallbackError) {
                console.error('ImgBB fallback also failed:', fallbackError);
                throw fallbackError;
            }
        }
    } else {
        console.log('Supabase not available, using ImgBB fallback');
        const url = await uploadToImgBB(file);
        return { success: true, url: url, path: null, isFallback: true };
    }
}

// ======================= FUNGSI UTILITY LAINNYA =======================

/**
 * Mendapatkan public URL dari path
 */
function getPublicUrl(filePath) {
    const { data } = supabaseClient.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
    return data.publicUrl;
}

/**
 * List semua file di folder tertentu
 */
async function listFilesInFolder(folderPath = '') {
    const { data, error } = await supabaseClient.storage
        .from(STORAGE_BUCKET)
        .list(folderPath, { limit: 100 });
    
    if (error) {
        console.error('List files error:', error);
        return [];
    }
    
    return data;
}

/**
 * Hapus folder dan isinya
 */
async function deleteFolder(folderPath) {
    const files = await listFilesInFolder(folderPath);
    if (files.length === 0) return true;
    
    const filePaths = files.map(file => `${folderPath}/${file.name}`);
    const { error } = await supabaseClient.storage
        .from(STORAGE_BUCKET)
        .remove(filePaths);
    
    if (error) {
        console.error('Delete folder error:', error);
        return false;
    }
    
    console.log(`✅ Folder deleted: ${folderPath} (${files.length} files)`);
    return true;
}

console.log('✅ supabase-config.js V2.1 loaded with bucket:', STORAGE_BUCKET);

// ======================= EKSPOR KE GLOBAL =======================
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.STORAGE_BUCKET = STORAGE_BUCKET;
window.supabaseClient = supabaseClient;
window.uploadToSupabase = uploadToSupabase;
window.deleteFromSupabase = deleteFromSupabase;
window.uploadProfilePhotoToSupabase = uploadProfilePhotoToSupabase;
window.uploadStatusImageToSupabase = uploadStatusImageToSupabase;
window.uploadSchoolLogoToSupabase = uploadSchoolLogoToSupabase;
window.uploadChatImageToSupabase = uploadChatImageToSupabase;
window.uploadWithFallback = uploadWithFallback;
window.deleteExpiredStatusImages = deleteExpiredStatusImages;
window.deleteOldProfilePhoto = deleteOldProfilePhoto;
window.deleteOldSchoolLogo = deleteOldSchoolLogo;
window.deleteStatusImage = deleteStatusImage;
window.startAutoDeleteExpiredStatus = startAutoDeleteExpiredStatus;
window.stopAutoDeleteExpiredStatus = stopAutoDeleteExpiredStatus;
window.extractPathFromUrl = extractPathFromUrl;
window.getPublicUrl = getPublicUrl;
window.listFilesInFolder = listFilesInFolder;
window.deleteFolder = deleteFolder;