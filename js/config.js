// ================== KONFIGURASI FIREBASE (AMAN) ==================
// Peringatan: API Key tetap terekspos di client-side.
// Untuk keamanan production, WAJIB mengaktifkan:
// 1. Firebase App Check (ReCaptcha v3)
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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// ================== FIREBASE APP CHECK (Keamanan) ==================
// Aktifkan App Check dengan ReCaptcha v3 (wajib di production)
// Daftar di: https://console.firebase.google.com/project/_/appcheck
if (typeof firebase.appCheck !== 'undefined') {
  const appCheck = firebase.appCheck();
  appCheck.activate('YOUR_RECAPTCHA_SITE_KEY', true);
}

// ================== VALIDASI KONEKSI ==================
// Cegah penggunaan di luar domain yang diizinkan (opsional)
const allowedDomains = ['absensi-4389a.web.app', 'localhost', '127.0.0.1'];
const origin = window.location.hostname;
if (!allowedDomains.includes(origin) && !origin.endsWith('.web.app')) {
  console.warn('⚠️ Domain tidak dikenal, beberapa fitur mungkin dibatasi');
  // Bisa juga redirect ke halaman error
  // window.location.href = '/error.html';
}

// ================== EXPORT GLOBAL (TIDAK ADA PERUBAHAN) ==================
// Tetap export ke global scope seperti semula
// (fungsi-fungsi lain tetap menggunakan auth dan db)