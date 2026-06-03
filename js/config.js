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

// Ekspor ke global
window.WHATSAPP_CONFIG = WHATSAPP_CONFIG;
window.IZIN_CONFIG = IZIN_CONFIG;
window.IMGBB_KEY = IMGBB_KEY;
window.firebaseConfig = firebaseConfig;

console.log("✅ config.js loaded - Firebase, WhatsApp Gateway (API Key: 2VoL53ZrVsDPxwDTNPdY), dan Izin Online siap digunakan");