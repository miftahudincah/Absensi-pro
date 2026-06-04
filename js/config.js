// ================== KONFIGURASI FIREBASE (AMAN) ==================
// Peringatan: API Key tetap terekspos di client-side.
// Untuk keamanan production, WAJIB mengaktifkan:
// 1. Firebase App Check (ReCaptcha v3) - tapi jangan gunakan kunci dummy!
// 2. Security Rules yang ketat
// 3. Cloud Functions untuk operasi sensitif (registrasi, hapus data)

const firebaseConfig = {
  apiKey: "AIzaSyBZg9NpbBAg8dKHkCbYf4J_2bpHH2ZJWWI",
  authDomain: "absensi-4389a-default-rtdb.firebaseapp.com",
  databaseURL: "https://absensi-4389a-default-rtdb.firebaseio.com",
  projectId: "absensi-4389a-default-rtdb",
  storageBucket: "absensi-4389a-default-rtdb.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

// API Key ImgBB - Hanya untuk upload gambar profile/status
// PERINGATAN: Di production, pindahkan upload ke Cloud Function
const IMGBB_KEY = "67650d8ee67ebb8bba94f3bb2c72eb4f";

// ==================== WHATSAPP GATEWAY CONFIG ====================
// Gunakan Fonnte API: https://fonnte.com (daftar gratis, 100 pesan/hari)
// Cara setup:
// 1. Daftar di https://fonnte.com
// 2. Verifikasi nomor WhatsApp
// 3. Dapatkan API Key dari dashboard
// 4. API Key sudah diisi dengan key asli Anda
const WHATSAPP_CONFIG = {
    gateway: 'fonnte',           // 'fonnte', 'waba', 'wati'
    fonnteApiKey: '2VoL53ZrVsDPxwDTNPdY', // API Key asli dari Fonnte
    enabled: true,               // Aktifkan/nonaktifkan notifikasi WA
    sendOnCheckIn: true,         // Notifikasi saat masuk
    sendOnCheckOut: true,        // Notifikasi saat pulang
    sendOnLate: true,            // Notifikasi jika terlambat
    sendOnAbsent: true,          // Notifikasi jika alpha (tidak hadir)
    senderNumber: ''             // Nomor pengirim (opsional, kosongkan jika pakai default)
};

// ==================== KONFIGURASI IZIN ONLINE ====================
const IZIN_CONFIG = {
    enabled: true,               // Aktifkan fitur izin online
    maxFileSize: 2 * 1024 * 1024, // Maksimal 2MB untuk lampiran
    allowedFileTypes: ['pdf', 'jpg', 'jpeg', 'png'],
    autoApprove: false,          // True jika izin otomatis disetujui (tanpa review)
    notificationOnApprove: true, // Kirim notifikasi saat izin disetujui
    notificationOnReject: true   // Kirim notifikasi saat izin ditolak
};

// ==================== ROLE DISPLAY NAMES ====================
// Mapping role internal ke tampilan nama yang ramah pengguna
const ROLE_DISPLAY_NAMES = {
    admin: 'Kepala Sekolah',
    wakil_kepala: 'Wakil Kepala Sekolah',
    staff_tu: 'Staff TU',
    guru: 'Guru',
    developer: 'Developer',
    siswa: 'Siswa'
};

// ==================== ROLE ICONS ====================
const ROLE_ICONS = {
    admin: '👑',
    wakil_kepala: '👔',
    staff_tu: '📋',
    guru: '👨‍🏫',
    developer: '👨‍💻',
    siswa: '👨‍🎓'
};

// ==================== ROLE PERMISSIONS ====================
// Definisi akses untuk setiap role
const ROLE_PERMISSIONS = {
    // Role dengan akses penuh (super admin)
    full_access: ['admin', 'developer'],
    
    // Role yang bisa mengelola data (tambah/edit/hapus siswa, staff, dll)
    management_access: ['admin', 'developer', 'wakil_kepala', 'guru'],
    
    // Role yang bisa membaca semua data (tanpa bisa edit)
    read_all_access: ['admin', 'developer', 'wakil_kepala', 'guru', 'staff_tu'],
    
    // Role yang bisa mengelola pengumuman
    announcement_access: ['admin', 'developer', 'wakil_kepala', 'guru'],
    
    // Role yang bisa mengelola user (tambah/edit/hapus akun)
    user_management_access: ['admin', 'developer'],
    
    // Role yang bisa melihat log aktivitas
    log_access: ['admin', 'developer', 'wakil_kepala'],
    
    // Role yang bisa mengelola pengaturan sistem
    config_access: ['admin', 'developer', 'wakil_kepala'],
    
    // Role yang bisa mengelola staff (guru/karyawan)
    staff_management_access: ['admin', 'developer', 'wakil_kepala', 'guru'],
    
    // Role yang bisa mengelola izin online
    izin_management_access: ['admin', 'developer', 'wakil_kepala', 'guru', 'staff_tu'],
    
    // Role yang bisa mengakses rekap absensi
    rekap_access: ['admin', 'developer', 'wakil_kepala', 'guru', 'staff_tu'],
    
    // Role yang bisa mengakses AI Summary
    ai_summary_access: ['admin', 'developer', 'wakil_kepala', 'guru'],
    
    // Role yang bisa mengakses dashboard penuh
    full_dashboard_access: ['admin', 'developer', 'wakil_kepala', 'guru', 'staff_tu']
};

// ==================== FUNGSI UTILITY ROLE ====================

/**
 * Mendapatkan display name untuk suatu role
 * @param {string} role - Role internal (admin, guru, dll)
 * @returns {string} Nama tampilan yang ramah pengguna
 */
function getRoleDisplayName(role) {
    return ROLE_DISPLAY_NAMES[role] || role.toUpperCase();
}

/**
 * Mendapatkan icon untuk suatu role
 * @param {string} role - Role internal
 * @returns {string} Emoji icon
 */
function getRoleIcon(role) {
    return ROLE_ICONS[role] || '👤';
}

/**
 * Cek apakah suatu role memiliki permission tertentu
 * @param {string} role - Role yang akan dicek
 * @param {string} permissionType - Jenis permission (full_access, management_access, dll)
 * @returns {boolean} True jika memiliki akses
 */
function hasPermission(role, permissionType) {
    if (!role) return false;
    const allowedRoles = ROLE_PERMISSIONS[permissionType];
    return allowedRoles ? allowedRoles.includes(role) : false;
}

/**
 * Mendapatkan daftar semua role yang tersedia (untuk dropdown)
 * @returns {Array} Daftar role dengan display name dan icon
 */
function getAllRoles() {
    return [
        { value: 'admin', label: 'Kepala Sekolah', icon: '👑' },
        { value: 'wakil_kepala', label: 'Wakil Kepala Sekolah', icon: '👔' },
        { value: 'staff_tu', label: 'Staff TU', icon: '📋' },
        { value: 'guru', label: 'Guru', icon: '👨‍🏫' },
        { value: 'developer', label: 'Developer', icon: '👨‍💻' },
        { value: 'siswa', label: 'Siswa', icon: '👨‍🎓' }
    ];
}

/**
 * Validasi apakah role valid
 * @param {string} role - Role yang divalidasi
 * @returns {boolean}
 */
function isValidRole(role) {
    const validRoles = ['admin', 'wakil_kepala', 'staff_tu', 'guru', 'developer', 'siswa'];
    return validRoles.includes(role);
}

/**
 * Mendapatkan priority level role (untuk sorting)
 * @param {string} role - Role
 * @returns {number} Priority (1 tertinggi)
 */
function getRolePriority(role) {
    const priorities = {
        developer: 1,
        admin: 2,
        wakil_kepala: 3,
        guru: 4,
        staff_tu: 5,
        siswa: 6
    };
    return priorities[role] || 99;
}

// ==================== INISIALISASI FIREBASE ====================

// Pastikan Firebase SDK sudah dimuat sebelum inisialisasi
if (typeof firebase === 'undefined') {
  console.error("❌ Firebase SDK tidak dimuat! Periksa koneksi internet dan urutan script.");
} else {
  console.log("🔥 Firebase SDK terdeteksi, menginisialisasi...");
}

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
  console.log("✅ Firebase berhasil diinisialisasi");
} catch (err) {
  console.error("❌ Gagal initialize Firebase:", err);
}

const auth = firebase.auth();
const db = firebase.database();
console.log("📡 auth dan db siap:", { auth: !!auth, db: !!db });

// ================== FIREBASE APP CHECK (Keamanan) ==================
// PERINGATAN: Jangan aktifkan App Check dengan kunci palsu!
// Jika ingin mengaktifkan, daftar di https://console.firebase.google.com/project/_/appcheck
// dan gunakan site key yang valid. Untuk sementara, nonaktifkan dulu.
/*
if (typeof firebase.appCheck !== 'undefined') {
  try {
    const appCheck = firebase.appCheck();
    appCheck.activate('YOUR_RECAPTCHA_SITE_KEY', true);
    console.log("✅ App Check diaktifkan");
  } catch (e) {
    console.warn("⚠️ App Check gagal diaktifkan:", e);
  }
}
*/

// ================== VALIDASI KONEKSI ==================
// Cegah penggunaan di luar domain yang diizinkan (opsional)
const allowedDomains = ['absensi-4389a.web.app', 'localhost', '127.0.0.1'];
const origin = window.location.hostname;
if (!allowedDomains.includes(origin) && !origin.endsWith('.web.app')) {
  console.warn('⚠️ Domain tidak dikenal, beberapa fitur mungkin dibatasi');
  // Bisa juga redirect ke halaman error
  // window.location.href = '/error.html';
} else {
  console.log(`✅ Domain diizinkan: ${origin}`);
}

// ==================== EKSPOR KE GLOBAL ====================
window.WHATSAPP_CONFIG = WHATSAPP_CONFIG;
window.IZIN_CONFIG = IZIN_CONFIG;
window.IMGBB_KEY = IMGBB_KEY;
window.firebaseConfig = firebaseConfig;

// Ekspor role management functions
window.ROLE_DISPLAY_NAMES = ROLE_DISPLAY_NAMES;
window.ROLE_ICONS = ROLE_ICONS;
window.ROLE_PERMISSIONS = ROLE_PERMISSIONS;
window.getRoleDisplayName = getRoleDisplayName;
window.getRoleIcon = getRoleIcon;
window.hasPermission = hasPermission;
window.getAllRoles = getAllRoles;
window.isValidRole = isValidRole;
window.getRolePriority = getRolePriority;

console.log("✅ config.js loaded - Firebase, WhatsApp Gateway, Role Management (Kepala Sekolah, Wakil Kepala Sekolah, Staff TU, Guru, Developer, Siswa) siap digunakan");