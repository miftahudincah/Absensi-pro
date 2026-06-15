// ai-assistant.js - VERSION 5.4 (BACKEND API PROXY + FIXED ACCESS)
// Asisten AI SUPER POWERFULL dengan backend proxy (AMAN)
// Semua panggilan AI melalui backend server, API Key tidak terekspos ke frontend
//
// PERUBAHAN V5.4:
// - FIX: Menambahkan role 'wakil_kepala' dan 'staff_tu' ke akses AI Assistant
// - FIX: Memastikan tombol AI Assistant muncul untuk semua role yang diizinkan
// - FIX: Menambahkan fallback tombol floating jika stats grid tidak ditemukan
// - Mengganti panggilan langsung ke Groq API dengan panggilan ke backend proxy
// - Menghapus GROQ_API_KEY dari frontend (keamanan meningkat)
// - Backend endpoint: https://backendtest-azure.vercel.app/api/ai/groq
// - Menambahkan fallback jika backend tidak tersedia
// ============================================================================

// ======================= KONFIGURASI BACKEND =======================
const BACKEND_URL = "https://backendtest-azure.vercel.app";

// State variables
let aiAssistantInitialized = false;
let aiAssistantModalOpen = false;
let currentAIContext = null;
let aiChatHistory = [];
let pendingDeleteConfirmation = null;
let pendingAction = null;

// ======================= ACCESS CONTROL FUNCTIONS =======================

/**
 * Cek akses SUPER ADMIN (Developer dan Kepala Sekolah/Admin)
 * SUPER ADMIN dapat mengubah pengaturan sistem (nama sekolah, delay, kelas, jurusan, dll)
 */
function hasSuperAdminAccess() {
    if (!currentUser) return false;
    return ['admin', 'developer'].includes(currentUser.role);
}

/**
 * Cek akses ADMIN/GURU/DEVELOPER (untuk CRUD siswa)
 * FIX: Menambahkan 'wakil_kepala' dan 'staff_tu' untuk akses AI Assistant
 */
function hasTeacherOrHigherAccess() {
    if (!currentUser) return false;
    // Sekarang semua role kecuali siswa dapat mengakses AI Assistant
    return ['admin', 'guru', 'developer', 'wakil_kepala', 'staff_tu'].includes(currentUser.role);
}

/**
 * Cek akses ADMIN/DEVELOPER (untuk kelola user)
 */
function hasAdminAccess() {
    if (!currentUser) return false;
    return ['admin', 'developer'].includes(currentUser.role);
}

/**
 * Cek apakah user dapat menghapus user (hanya super admin)
 */
function canDeleteUser() {
    if (!currentUser) return false;
    return ['admin', 'developer'].includes(currentUser.role);
}

/**
 * Cek apakah user dapat mengubah pengaturan sistem
 */
function canChangeSystemSettings() {
    if (!currentUser) return false;
    return ['admin', 'developer'].includes(currentUser.role);
}

/**
 * Cek apakah user dapat mengelola pengumuman
 */
function canManageAnnouncements() {
    if (!currentUser) return false;
    return ['admin', 'guru', 'developer', 'wakil_kepala'].includes(currentUser.role);
}

// ======================= UTILITY FUNCTIONS =======================

function getTimestamp() {
    return new Date().toLocaleTimeString('id-ID');
}

// Cache data sistem
let systemDataCache = {
    students: [],
    attendance: [],
    usersAuth: [],
    settings: {},
    schoolConfig: {},
    announcements: [],
    lastUpdate: 0
};

async function updateSystemDataCache() {
    const now = Date.now();
    if (now - systemDataCache.lastUpdate < 30000 && systemDataCache.students.length > 0) {
        return systemDataCache;
    }
    
    systemDataCache = {
        students: dbData?.users?.filter(s => s && s.nama && s.nama !== 'Tidak Diketahui' && s.nama.trim() !== '') || [],
        attendance: dbData?.attendance || [],
        usersAuth: dbData?.users_auth || [],
        settings: {},
        schoolConfig: window.currentSchoolConfig || { type: 'smp', classes: [], majors: [] },
        announcements: [],
        lastUpdate: now
    };
    
    // Ambil pengaturan global
    try {
        const delaySnapshot = await db.ref('settings/delayOut').once('value');
        systemDataCache.settings.delayOut = delaySnapshot.val() || 60;
        
        const lateSnapshot = await db.ref('school_config/attendance_settings/lateThreshold').once('value');
        systemDataCache.settings.lateThreshold = lateSnapshot.val() || '07:30';
        
        const minOutSnapshot = await db.ref('school_config/attendance_settings/minOutTime').once('value');
        systemDataCache.settings.minOutTime = minOutSnapshot.val() || '14:00';
        
        const schoolNameSnapshot = await db.ref('system_config/schoolName').once('value');
        systemDataCache.settings.schoolName = schoolNameSnapshot.val() || 'Sistem Absensi';
    } catch(e) { console.warn(e); }
    
    console.log(`🤖 AI Cache: ${systemDataCache.students.length} siswa, ${systemDataCache.attendance.length} absensi, ${systemDataCache.usersAuth.length} user`);
    return systemDataCache;
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function formatMarkdown(text) {
    if (!text) return '';
    text = String(text);
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    text = text.replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:4px;">$1</code>');
    text = text.replace(/\n/g, '<br>');
    text = text.replace(/^[•\-]\s+(.*?)$/gm, '<li>$1</li>');
    if (text.includes('<li>') && !text.includes('<ul>')) {
        text = text.replace(/(<li>.*?<\/li>)/s, '<ul style="margin:8px 0 8px 20px;">$1</ul>');
    }
    text = text.replace(/^(\d+)\.\s+(.*?)$/gm, '<li value="$1">$2</li>');
    return text;
}

// ======================= INTENT PARSING =======================

function parseProfessionalIntent(message) {
    const lowerMsg = message.toLowerCase();
    
    // Intent: Hapus siswa (delete_student)
    let match = lowerMsg.match(/hapus\s+siswa\s+id\s*(\d+)/i);
    if (match) {
        return { intent: 'delete_student', id: match[1], confidence: 0.95 };
    }
    match = lowerMsg.match(/delete\s+student\s+id\s*(\d+)/i);
    if (match) {
        return { intent: 'delete_student', id: match[1], confidence: 0.95 };
    }
    
    // Intent: Hapus user (delete_user)
    match = lowerMsg.match(/hapus\s+user\s+(\w+)/i);
    if (match && hasAdminAccess()) {
        return { intent: 'delete_user', userName: match[1], confidence: 0.9 };
    }
    match = lowerMsg.match(/delete\s+user\s+(\w+)/i);
    if (match && hasAdminAccess()) {
        return { intent: 'delete_user', userName: match[1], confidence: 0.9 };
    }
    
    // Intent: Tambah siswa (add_student)
    match = lowerMsg.match(/tambah\s+siswa\s+nama\s+([\w\s]+?)\s+id\s*(\d+)\s+kelas\s+([\w\s]+?)\s+jurusan\s+([\w\s]+)/i);
    if (match && hasTeacherOrHigherAccess()) {
        return { intent: 'add_student', nama: match[1].trim(), id: match[2], kelas: match[3].trim(), jurusan: match[4].trim(), confidence: 0.9 };
    }
    match = lowerMsg.match(/tambah\s+siswa\s+(\w+)\s+id\s*(\d+)\s+kelas\s+(\w+)\s+jurusan\s+(\w+)/i);
    if (match && hasTeacherOrHigherAccess()) {
        return { intent: 'add_student', nama: match[1], id: match[2], kelas: match[3], jurusan: match[4], confidence: 0.85 };
    }
    
    // Intent: Update siswa
    match = lowerMsg.match(/update\s+siswa\s+id\s*(\d+)\s+delay\s*(\d+)/i);
    if (match && hasTeacherOrHigherAccess()) {
        return { intent: 'update_student', id: match[1], delayOut: match[2], confidence: 0.9 };
    }
    match = lowerMsg.match(/ubah\s+delay\s+siswa\s+id\s*(\d+)\s+menjadi\s*(\d+)/i);
    if (match && hasTeacherOrHigherAccess()) {
        return { intent: 'update_student', id: match[1], delayOut: match[2], confidence: 0.9 };
    }
    
    // Intent: Cari data siswa (query_student)
    match = lowerMsg.match(/data\s+siswa\s+([\w\s]+)/i);
    if (match) {
        return { intent: 'query_student', name: match[1].trim(), confidence: 0.85 };
    }
    match = lowerMsg.match(/siswa\s+([\w\s]+)/i);
    if (match && !lowerMsg.includes('kelas') && !lowerMsg.includes('jurusan')) {
        return { intent: 'query_student', name: match[1].trim(), confidence: 0.75 };
    }
    
    // Intent: Cari siswa by ID
    match = lowerMsg.match(/id\s*(\d+)\s+siswa|siswa\s+id\s*(\d+)/i);
    if (match) {
        const id = match[1] || match[2];
        return { intent: 'query_student_by_id', id: id, confidence: 0.9 };
    }
    
    // Intent: Siswa per kelas
    match = lowerMsg.match(/siswa\s+kelas\s+([\w\s]+?)(?:\s+jurusan\s+([\w\s]+))?/i);
    if (match) {
        return { intent: 'students_by_class', kelas: match[1].trim(), jurusan: match[2] ? match[2].trim() : null, confidence: 0.85 };
    }
    
    // Intent: Rekap siswa
    match = lowerMsg.match(/rekap\s+([\w\s]+)/i);
    if (match) {
        return { intent: 'student_rekap', name: match[1].trim(), confidence: 0.85 };
    }
    match = lowerMsg.match(/absensi\s+([\w\s]+)/i);
    if (match) {
        return { intent: 'student_rekap', name: match[1].trim(), confidence: 0.8 };
    }
    
    // Intent: Top performers
    if (lowerMsg.match(/siswa\s+terbaik|top\s+(\d+)|peringkat|prestasi|teratas/i)) {
        const limit = lowerMsg.match(/top\s+(\d+)/i) ? parseInt(lowerMsg.match(/top\s+(\d+)/i)[1]) : 5;
        return { intent: 'top_students', limit: Math.min(limit, 10), confidence: 0.9 };
    }
    
    // Intent: Statistik umum
    if (lowerMsg.match(/statistik|ringkasan|gambaran\s+umum|dashboard/i)) {
        return { intent: 'general_stats', confidence: 0.9 };
    }
    
    // Intent: Prediksi tren
    if (lowerMsg.match(/prediksi|tren|perkiraan|akan\s+datang/i)) {
        return { intent: 'predict_trend', confidence: 0.85 };
    }
    
    // Intent: Perbandingan
    if (lowerMsg.match(/bandingkan|perbandingan|compare/i)) {
        return { intent: 'compare_attendance', confidence: 0.8 };
    }
    
    // Intent: Rekomendasi
    if (lowerMsg.match(/rekomendasi|saran|recommendation/i)) {
        return { intent: 'recommendations', confidence: 0.85 };
    }
    
    // Intent: Ubah role user (admin only)
    match = lowerMsg.match(/ubah\s+role\s+(\w+)\s+menjadi\s+(\w+)/i);
    if (match && hasAdminAccess()) {
        return { intent: 'change_user_role', userName: match[1], newRole: match[2], confidence: 0.9 };
    }
    
    // Intent: Ubah nama sekolah (super admin only)
    match = lowerMsg.match(/ubah\s+nama\s+sekolah\s+menjadi\s+(.+)/i);
    if (match && hasSuperAdminAccess()) {
        return { intent: 'change_school_name', newName: match[1].trim(), confidence: 0.95 };
    }
    
    // Intent: Update global delay (super admin only)
    match = lowerMsg.match(/ubah\s+delay\s+global\s+menjadi\s*(\d+)\s*(?:menit|jam)?/i);
    if (match && hasSuperAdminAccess()) {
        let delay = parseInt(match[1]);
        if (lowerMsg.includes('jam')) delay = delay * 60;
        return { intent: 'update_global_delay', delay: delay, confidence: 0.9 };
    }
    
    // Intent: Tambah kelas (super admin only)
    match = lowerMsg.match(/tambah\s+kelas\s+(\w+(?:\s+\w+)?)/i);
    if (match && hasSuperAdminAccess()) {
        return { intent: 'add_class', className: match[1].toUpperCase(), confidence: 0.9 };
    }
    
    // Intent: Tambah jurusan (super admin only)
    match = lowerMsg.match(/tambah\s+jurusan\s+(\w+(?:\s+\w+)?)/i);
    if (match && hasSuperAdminAccess() && (systemDataCache.schoolConfig.type === 'smk' || systemDataCache.schoolConfig.type === 'both')) {
        return { intent: 'add_major', majorName: match[1].toUpperCase(), confidence: 0.9 };
    }
    
    // Intent: Ubah tipe sekolah (super admin only)
    match = lowerMsg.match(/ubah\s+tipe\s+sekolah\s+menjadi\s+(smp|smk|both)/i);
    if (match && hasSuperAdminAccess()) {
        return { intent: 'change_school_type', schoolType: match[1], confidence: 0.95 };
    }
    
    // Intent: Reset password user (admin only)
    match = lowerMsg.match(/reset\s+password\s+(\w+)/i);
    if (match && hasAdminAccess()) {
        return { intent: 'reset_user_password', userName: match[1], confidence: 0.85 };
    }
    
    // Intent: Buat pengumuman
    match = lowerMsg.match(/buat\s+pengumuman\s+(.+?)\s+dengan\s+isi\s+(.+)/i);
    if (match && canManageAnnouncements()) {
        return { intent: 'create_announcement', title: match[1].trim(), message: match[2].trim(), confidence: 0.85 };
    }
    
    // Intent: Bantuan
    if (lowerMsg.match(/bantuan|help|tolong|perintah|command/i)) {
        return { intent: 'help', confidence: 1.0 };
    }
    
    // Intent: Salam
    if (lowerMsg.match(/halo|hai|hello|hy|hii?|selamat\s+(pagi|siang|sore|malam)/i)) {
        return { intent: 'greeting', confidence: 0.95 };
    }
    
    // Intent: Terima kasih
    if (lowerMsg.match(/terima\s+kasih|makasih|thanks/i)) {
        return { intent: 'thanks', confidence: 0.95 };
    }
    
    // Intent: Perkenalan
    if (lowerMsg.match(/siapa\s+kamu|kamu\s+siapa|perkenalan/i)) {
        return { intent: 'introduction', confidence: 0.95 };
    }
    
    // Intent: Tentang sistem
    if (lowerMsg.match(/tentang\s+sistem|about|info\s+sistem/i)) {
        return { intent: 'about_system', confidence: 0.9 };
    }
    
    // Intent: Waktu saat ini
    if (lowerMsg.match(/jam\s+berapa|waktu\s+sekarang|tanggal\s+berapa/i)) {
        return { intent: 'current_datetime', confidence: 0.95 };
    }
    
    return { intent: 'unknown', confidence: 0 };
}

// ======================= EXECUTE INTENT =======================

async function executeProfessionalIntent(intent) {
    switch(intent.intent) {
        case 'delete_student':
            return await deleteStudentViaAI(intent);
        case 'delete_user':
            return await deleteUserViaAI(intent);
        case 'add_student':
            return await addStudentViaAI(intent);
        case 'update_student':
            return await updateStudentViaAI(intent);
        case 'query_student':
            return await queryStudentProfessional(intent.name);
        case 'query_student_by_id':
            return await queryStudentByIdProfessional(intent.id);
        case 'students_by_class':
            return await getStudentsByClassProfessional(intent.kelas, intent.jurusan);
        case 'student_rekap':
            return await getStudentRekapProfessional(intent.name);
        case 'top_students':
            return await getTopStudentsProfessional(intent.limit || 5);
        case 'general_stats':
            return await getGeneralStatsProfessional();
        case 'predict_trend':
            return await predictTrendProfessional();
        case 'compare_attendance':
            return await compareAttendanceProfessional();
        case 'recommendations':
            return await getProfessionalRecommendations();
        case 'change_user_role':
            return await changeUserRoleAction(intent.userName, intent.newRole);
        case 'change_school_name':
            return await changeSchoolName(intent.newName);
        case 'update_global_delay':
            return await updateGlobalDelay(intent.delay);
        case 'add_class':
            return await addClassAction(intent.className);
        case 'add_major':
            return await addMajorAction(intent.majorName);
        case 'change_school_type':
            return await changeSchoolTypeAction(intent.schoolType);
        case 'reset_user_password':
            return await resetUserPasswordAction(intent.userName);
        case 'create_announcement':
            return await createAnnouncementAction(intent.title, intent.message);
        case 'help':
            return getProfessionalHelp();
        case 'greeting':
            return getProfessionalGreeting();
        case 'thanks':
            return getProfessionalThanks();
        case 'introduction':
            return getProfessionalIntroduction();
        case 'about_system':
            return getAboutSystem();
        case 'current_datetime':
            return getCurrentDateTime();
        default:
            return null;
    }
}

// ======================= RESPON PROFESIONAL =======================

function getProfessionalGreeting() {
    const hour = new Date().getHours();
    let greeting = "Selamat ";
    if (hour < 12) greeting += "pagi";
    else if (hour < 18) greeting += "siang";
    else greeting += "malam";
    
    return `**${greeting}!** 👋

Saya **Asisten AI Absensi**, siap membantu Anda mengelola data kehadiran.

📋 **Apa yang bisa saya bantu hari ini?**
• 🔍 Cari data siswa
• 📊 Lihat rekap absensi
• ✏️ Kelola data (tambah/edit/hapus)
• 📈 Analisis statistik
• ⚙️ Pengaturan sistem

💡 **Ketik "bantuan"** untuk melihat semua perintah yang tersedia!`;
}

function getProfessionalThanks() {
    return "✨ **Sama-sama!** Senang bisa membantu.\n\nJika ada yang perlu ditanyakan lagi, jangan ragu untuk menghubungi saya ya! 😊";
}

function getProfessionalIntroduction() {
    return `**🤖 Saya Asisten AI Absensi**

Saya adalah asisten cerdas yang terintegrasi dengan **Sistem Absensi Fingerprint** Anda.

**Kemampuan Saya:**
• 📊 **Analisis Data** - Melihat statistik kehadiran real-time
• 🔍 **Pencarian Data** - Mencari siswa berdasarkan nama/ID/kelas
• ✏️ **Manajemen Data** - Menambah/mengedit/menghapus data siswa (jika memiliki akses)
• 📈 **Prediksi & Rekomendasi** - Memberikan saran berbasis data
• ⚙️ **Pengaturan Sistem** - Mengubah konfigurasi (khusus Admin/Developer)

**Akses Anda:** ${currentUser?.role ? getRoleDisplayName(currentUser.role) : 'Guest'}

💬 **Ketik "bantuan"** untuk melihat daftar perintah lengkap!`;
}

function getAboutSystem() {
    return `**🏫 Tentang Sistem Absensi IoT**

**Teknologi yang Digunakan:**
• 🔐 **ESP32 Fingerprint Scanner** - Absensi berbasis sidik jari
• ☁️ **Firebase Realtime Database** - Penyimpanan data real-time
• 🤖 **AI Assistant** - Analisis cerdas dengan Groq AI
• 📱 **WhatsApp Gateway** - Notifikasi otomatis via Fonnte

**Statistik Sistem:**
• 👨‍🎓 Total siswa: ${systemDataCache.students.length}
• 📋 Total absensi: ${systemDataCache.attendance.length}
• 👥 Total user: ${systemDataCache.usersAuth.length}
• 🏫 Tipe sekolah: ${systemDataCache.schoolConfig.type === 'smp' ? 'SMP' : (systemDataCache.schoolConfig.type === 'smk' ? 'SMK' : 'SMP & SMK')}

**Fitur Unggulan:**
• ✅ Absensi real-time via fingerprint
• 📊 Rekap dan analisis kehadiran
• 📱 Notifikasi WhatsApp orang tua
• 🤖 AI Assistant untuk analisis data
• 👥 Sistem pertemanan dan chat
• 📸 Status update (24 jam)

Dikembangkan oleh **CV Haka Jaya** | Versi 6.1`;
}

function getCurrentDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    return `📅 **${now.toLocaleDateString('id-ID', options)}**\n\n⏰ Waktu server: ${now.toLocaleTimeString('id-ID')}\n📆 Hari: ${now.toLocaleDateString('id-ID', { weekday: 'long' })}`;
}

function getProfessionalHelp() {
    const role = currentUser?.role;
    const isAdminOrDev = hasSuperAdminAccess();
    const canManage = hasTeacherOrHigherAccess();
    
    let adminCommands = '';
    let superAdminCommands = '';
    
    if (isAdminOrDev) {
        superAdminCommands = `
**⚙️ Pengaturan Sistem (Admin/Developer):**
• "ubah nama sekolah menjadi SMK Taruna"
• "ubah delay global menjadi 90 menit"
• "tambah kelas XII IPA"
• "tambah jurusan RPL"
• "ubah tipe sekolah menjadi smk"
• "reset password Budi"
• "ubah role Budi menjadi admin"`;
    }
    
    if (canManage) {
        adminCommands = `
**✏️ Manajemen Data (Guru/Admin/Developer):**
• "tambah siswa nama Budi id 8 kelas X jurusan RPL"
• "update siswa id 8 delay 90"
• "hapus siswa id 8"
• "buat pengumuman Libur dengan isi ..."`;
    }
    
    return `**📋 Daftar Perintah AI Assistant**

**🔍 Pencarian Data:**
• "data siswa Budi" - Cari siswa berdasarkan nama
• "id 5 siapa?" - Cari siswa berdasarkan ID
• "siswa kelas X" - Lihat semua siswa di kelas X
• "siswa kelas X jurusan RPL" - Filter berdasarkan kelas dan jurusan

**📊 Rekap & Statistik:**
• "rekap Budi" - Lihat rekap absensi per siswa
• "siswa terbaik" - Top 5 siswa dengan kehadiran tertinggi
• "statistik" - Ringkasan umum kehadiran
• "prediksi tren" - Prediksi kehadiran 7 hari ke depan
• "rekomendasi" - Saran berbasis data

${adminCommands}
${superAdminCommands}

**💬 Umum:**
• "halo" / "terima kasih" / "siapa kamu"
• "tentang sistem" / "jam berapa"
• "bantuan" - Menampilkan panduan ini

💡 **Tips:** Gunakan bahasa alami, AI akan memahami maksud Anda!`;
}

// ======================= ACTION FUNCTIONS =======================

async function changeUserRoleAction(userName, newRole) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Admin dan Developer yang dapat mengubah role user.";
    }
    
    const users = systemDataCache.usersAuth || [];
    const targetUser = users.find(u => u.nama && u.nama.toLowerCase().includes(userName.toLowerCase()));
    
    if (!targetUser) {
        return `❌ **User "${userName}" tidak ditemukan.**`;
    }
    
    const validRoles = ['siswa', 'guru', 'wakil_kepala', 'staff_tu', 'admin'];
    if (!validRoles.includes(newRole.toLowerCase())) {
        return `❌ **Role "${newRole}" tidak valid.** Role yang tersedia: siswa, guru, wakil_kepala, staff_tu, admin`;
    }
    
    if (targetUser.role === 'developer') {
        return "⛔ **Tidak dapat mengubah role Developer!**";
    }
    
    try {
        await db.ref(`users_auth/${targetUser.uid}/role`).set(newRole.toLowerCase());
        
        if (typeof logActivity === 'function') {
            logActivity('update_user_role', `AI: Ubah role ${targetUser.nama} dari ${targetUser.role} menjadi ${newRole}`);
        }
        
        return `✅ **Berhasil mengubah role ${targetUser.nama}** dari ${targetUser.role.toUpperCase()} menjadi **${newRole.toUpperCase()}**.\n\n🔄 Perubahan akan segera berlaku.`;
    } catch (error) {
        console.error("Change role error:", error);
        return `❌ **Gagal mengubah role:** ${error.message}`;
    }
}

async function changeSchoolName(newName) {
    if (!hasSuperAdminAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Admin dan Developer yang dapat mengubah nama sekolah.";
    }
    
    if (!newName || newName.trim() === '') {
        return "❌ **Nama sekolah tidak boleh kosong!**";
    }
    
    try {
        await db.ref('system_config/schoolName').set(newName.trim());
        
        if (typeof logActivity === 'function') {
            logActivity('save_school_name', `AI: Ubah nama sekolah menjadi "${newName}"`);
        }
        
        return `✅ **Berhasil mengubah nama sekolah** menjadi **${newName}**.\n\n🏫 Nama baru akan langsung muncul di dashboard.`;
    } catch (error) {
        console.error("Change school name error:", error);
        return `❌ **Gagal mengubah nama sekolah:** ${error.message}`;
    }
}

async function updateGlobalDelay(delayMinutes) {
    if (!hasSuperAdminAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Admin dan Developer yang dapat mengubah delay global.";
    }
    
    if (!delayMinutes || delayMinutes < 1) {
        return "❌ **Delay harus lebih dari 0 menit!**";
    }
    
    const oldDelay = systemDataCache.settings.delayOut || 60;
    
    try {
        await db.ref('settings/delayOut').set(delayMinutes);
        
        if (typeof logActivity === 'function') {
            logActivity('update_global_delay', `AI: Ubah delay global dari ${oldDelay} menjadi ${delayMinutes} menit`);
        }
        
        const hours = Math.floor(delayMinutes / 60);
        const minutes = delayMinutes % 60;
        let delayText = '';
        if (hours > 0 && minutes > 0) delayText = `${hours} jam ${minutes} menit`;
        else if (hours > 0) delayText = `${hours} jam`;
        else delayText = `${minutes} menit`;
        
        return `✅ **Berhasil mengubah delay global** dari ${oldDelay} menit menjadi **${delayText}**.\n\n⏰ Pengaturan baru akan langsung berlaku.`;
    } catch (error) {
        console.error("Update global delay error:", error);
        return `❌ **Gagal mengubah delay global:** ${error.message}`;
    }
}

async function addClassAction(className) {
    if (!hasSuperAdminAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Admin dan Developer yang dapat menambah kelas.";
    }
    
    if (!className || className.trim() === '') {
        return "❌ **Nama kelas tidak boleh kosong!**";
    }
    
    className = className.toUpperCase().trim();
    const currentClasses = systemDataCache.schoolConfig.classes || [];
    
    if (currentClasses.includes(className)) {
        return `❌ **Kelas "${className}" sudah ada!**`;
    }
    
    const newClasses = [...currentClasses, className];
    
    try {
        await db.ref('school_config/classes').set(newClasses);
        
        if (typeof logActivity === 'function') {
            logActivity('save_classes', `AI: Tambah kelas "${className}"`);
        }
        
        return `✅ **Berhasil menambah kelas** "${className}".\n\n📚 Total kelas sekarang: ${newClasses.length} kelas.\n\n⚠️ **Jangan lupa klik "Simpan" di menu Pengaturan jika perlu.**`;
    } catch (error) {
        console.error("Add class error:", error);
        return `❌ **Gagal menambah kelas:** ${error.message}`;
    }
}

async function addMajorAction(majorName) {
    if (!hasSuperAdminAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Admin dan Developer yang dapat menambah jurusan.";
    }
    
    const schoolType = systemDataCache.schoolConfig.type;
    if (schoolType !== 'smk' && schoolType !== 'both') {
        return "⚠️ **Penambahan jurusan hanya tersedia untuk tipe sekolah SMK atau Both (SMP & SMK).**\n\n💡 Ubah tipe sekolah terlebih dahulu jika diperlukan.";
    }
    
    if (!majorName || majorName.trim() === '') {
        return "❌ **Nama jurusan tidak boleh kosong!**";
    }
    
    majorName = majorName.toUpperCase().trim();
    const currentMajors = systemDataCache.schoolConfig.majors || [];
    
    if (currentMajors.includes(majorName)) {
        return `❌ **Jurusan "${majorName}" sudah ada!**`;
    }
    
    const newMajors = [...currentMajors, majorName];
    
    try {
        await db.ref('school_config/majors').set(newMajors);
        
        if (typeof logActivity === 'function') {
            logActivity('save_majors', `AI: Tambah jurusan "${majorName}"`);
        }
        
        return `✅ **Berhasil menambah jurusan** "${majorName}".\n\n🎓 Total jurusan sekarang: ${newMajors.length} jurusan.\n\n⚠️ **Jangan lupa klik "Simpan" di menu Pengaturan jika perlu.**`;
    } catch (error) {
        console.error("Add major error:", error);
        return `❌ **Gagal menambah jurusan:** ${error.message}`;
    }
}

async function changeSchoolTypeAction(schoolType) {
    if (!hasSuperAdminAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Admin dan Developer yang dapat mengubah tipe sekolah.";
    }
    
    const validTypes = ['smp', 'smk', 'both'];
    if (!validTypes.includes(schoolType)) {
        return `❌ **Tipe sekolah tidak valid!** Pilihan: smp, smk, both`;
    }
    
    const oldType = systemDataCache.schoolConfig.type || 'smp';
    
    let newClasses;
    if (schoolType === 'both') {
        newClasses = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    } else if (schoolType === 'smp') {
        newClasses = ['VII', 'VIII', 'IX'];
    } else {
        newClasses = ['X', 'XI', 'XII'];
    }
    
    try {
        await db.ref('school_config').update({
            type: schoolType,
            classes: newClasses
        });
        
        if (typeof logActivity === 'function') {
            logActivity('update_school_type', `AI: Ubah tipe sekolah dari ${oldType} menjadi ${schoolType}`);
        }
        
        let typeText = schoolType === 'smp' ? 'SMP' : (schoolType === 'smk' ? 'SMK' : 'SMP & SMK');
        return `✅ **Berhasil mengubah tipe sekolah** dari ${oldType.toUpperCase()} menjadi **${typeText}**.\n\n📚 Kelas default telah disesuaikan.\n\n⚠️ **Refresh halaman untuk melihat perubahan penuh.**`;
    } catch (error) {
        console.error("Change school type error:", error);
        return `❌ **Gagal mengubah tipe sekolah:** ${error.message}`;
    }
}

async function resetUserPasswordAction(userName) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Admin dan Developer yang dapat mereset password user.";
    }
    
    const users = systemDataCache.usersAuth || [];
    const targetUser = users.find(u => u.nama && u.nama.toLowerCase().includes(userName.toLowerCase()));
    
    if (!targetUser) {
        return `❌ **User "${userName}" tidak ditemukan.**`;
    }
    
    if (targetUser.role === 'developer') {
        return "⛔ **Tidak dapat mereset password Developer!**";
    }
    
    try {
        await auth.sendPasswordResetEmail(targetUser.email);
        
        if (typeof logActivity === 'function') {
            logActivity('reset_user_password', `AI: Kirim link reset password ke ${targetUser.nama} (${targetUser.email})`);
        }
        
        return `✅ **Link reset password telah dikirim** ke email ${targetUser.email}.\n\n📧 Minta user untuk mengecek email dan mengikuti instruksi.`;
    } catch (error) {
        console.error("Reset password error:", error);
        if (error.code === 'auth/user-not-found') {
            return `❌ **Email user tidak terdaftar di sistem autentikasi!**`;
        }
        return `❌ **Gagal mereset password:** ${error.message}`;
    }
}

async function createAnnouncementAction(title, message) {
    if (!canManageAnnouncements()) {
        return "⛔ **Akses Ditolak!** Hanya Admin, Guru, dan Developer yang dapat membuat pengumuman.";
    }
    
    if (!title || !message) {
        return "❌ **Judul dan isi pengumuman harus diisi!**";
    }
    
    try {
        const announcementData = {
            title: title,
            message: message,
            priority: 'normal',
            createdBy: currentUser.nama || currentUser.email,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            isActive: true
        };
        
        await db.ref('announcements/active').push(announcementData);
        
        if (typeof logActivity === 'function') {
            logActivity('create_announcement', `AI: Buat pengumuman "${title}"`);
        }
        
        return `✅ **Pengumuman berhasil dibuat!**\n\n📢 **Judul:** ${title}\n📝 **Isi:** ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}\n\n🔄 Pengumuman akan langsung muncul di dashboard.`;
    } catch (error) {
        console.error("Create announcement error:", error);
        return `❌ **Gagal membuat pengumuman:** ${error.message}`;
    }
}

async function addStudentViaAI(intent) {
    if (!hasTeacherOrHigherAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Guru, Admin, dan Developer yang dapat menambah siswa.";
    }
    
    const { id, nama, kelas, jurusan } = intent;
    
    const existingStudent = systemDataCache.students.find(s => s.id == id);
    if (existingStudent) {
        return `❌ **Gagal menambah siswa!**\n\nID siswa **${id}** sudah terdaftar atas nama **${existingStudent.nama}**.`;
    }
    
    try {
        const studentData = {
            id: parseInt(id),
            nama: nama,
            kelas: kelas.toUpperCase(),
            jurusan: jurusan.toUpperCase(),
            delayOut: 60,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        await db.ref(`users/${id}`).set(studentData);
        
        if (typeof logActivity === 'function') {
            logActivity('add_student', `AI: Tambah siswa ${nama} (ID: ${id}, Kelas: ${kelas}, Jurusan: ${jurusan})`);
        }
        
        return `✅ **Berhasil menambah siswa!**\n\n📋 **Detail Siswa:**\n• Nama: ${nama}\n• ID: ${id}\n• Kelas: ${kelas}\n• Jurusan: ${jurusan}\n• Delay: 60 menit (default)\n\n🔄 Data akan langsung muncul di tabel siswa.`;
    } catch (error) {
        console.error("Add student error:", error);
        return `❌ **Gagal menambah siswa:** ${error.message}`;
    }
}

async function updateStudentViaAI(intent) {
    if (!hasTeacherOrHigherAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Guru, Admin, dan Developer yang dapat mengupdate siswa.";
    }
    
    const { id, delayOut } = intent;
    
    const student = systemDataCache.students.find(s => s.id == id);
    if (!student) {
        return `❌ **Siswa dengan ID ${id} tidak ditemukan.**`;
    }
    
    try {
        await db.ref(`users/${id}/delayOut`).set(parseInt(delayOut));
        
        if (typeof logActivity === 'function') {
            logActivity('edit_student', `AI: Update delay siswa ${student.nama} (ID: ${id}) menjadi ${delayOut} menit`);
        }
        
        const hours = Math.floor(delayOut / 60);
        const minutes = delayOut % 60;
        let delayText = '';
        if (hours > 0 && minutes > 0) delayText = `${hours} jam ${minutes} menit`;
        else if (hours > 0) delayText = `${hours} jam`;
        else delayText = `${minutes} menit`;
        
        return `✅ **Berhasil mengupdate data siswa!**\n\n📋 **Detail:**\n• Nama: ${student.nama}\n• ID: ${id}\n• Delay pulang: ${delayText}\n\n🔄 Perubahan akan langsung berlaku.`;
    } catch (error) {
        console.error("Update student error:", error);
        return `❌ **Gagal mengupdate siswa:** ${error.message}`;
    }
}

async function deleteStudentViaAI(intent) {
    if (!hasTeacherOrHigherAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Guru, Admin, dan Developer yang dapat menghapus siswa.";
    }
    
    const studentId = intent.id;
    const student = systemDataCache.students.find(s => s.id == studentId);
    
    if (!student) {
        return `❌ **Siswa dengan ID ${studentId} tidak ditemukan.**`;
    }
    
    pendingDeleteConfirmation = { id: student.id, nama: student.nama };
    
    return `⚠️ **Konfirmasi Hapus Siswa**\n\nAnda akan menghapus:\n• Nama: **${student.nama}**\n• ID: ${student.id}\n• Kelas: ${student.kelas || '-'}\n• Jurusan: ${student.jurusan || '-'}\n\n**Ketik "YA HAPUS"** untuk konfirmasi.\n_(Ketik "batal" untuk membatalkan)_`;
}

async function executeDeleteConfirmation(confirmationText) {
    if (!pendingDeleteConfirmation) return null;
    
    if (confirmationText.toLowerCase().includes('ya hapus')) {
        const { id, nama } = pendingDeleteConfirmation;
        
        try {
            const registeredUser = systemDataCache.usersAuth?.find(u => u.fpId == id);
            if (registeredUser) {
                await db.ref(`users_auth/${registeredUser.uid}`).remove();
            }
            
            await db.ref(`users/${id}`).remove();
            
            if (typeof logActivity === 'function') {
                logActivity('delete_student', `AI: Hapus siswa ${nama} (ID: ${id})`);
            }
            
            pendingDeleteConfirmation = null;
            return `✅ **Siswa "${nama}" berhasil dihapus!**\n\n${registeredUser ? 'Akun user yang terkait juga telah dihapus.' : ''}`;
        } catch (error) {
            console.error("Delete student error:", error);
            return `❌ **Gagal menghapus siswa:** ${error.message}`;
        }
    } else if (confirmationText.toLowerCase().includes('batal')) {
        pendingDeleteConfirmation = null;
        return "❌ **Penghapusan dibatalkan.**";
    }
    
    return null;
}

async function deleteUserViaAI(intent) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!** Hanya Admin dan Developer yang dapat menghapus user.";
    }
    
    const { userName } = intent;
    const users = systemDataCache.usersAuth || [];
    const targetUser = users.find(u => u.nama && u.nama.toLowerCase().includes(userName.toLowerCase()));
    
    if (!targetUser) {
        return `❌ **User "${userName}" tidak ditemukan.**`;
    }
    
    if (targetUser.role === 'developer') {
        return "⛔ **Tidak dapat menghapus user Developer!**";
    }
    
    if (targetUser.uid === currentUser?.uid) {
        return "❌ **Anda tidak dapat menghapus akun sendiri!**";
    }
    
    pendingAction = { type: 'delete_user', userName: targetUser.nama, userUid: targetUser.uid };
    
    return `⚠️ **Konfirmasi Hapus User**\n\nAnda akan menghapus:\n• Nama: **${targetUser.nama}**\n• Email: ${targetUser.email}\n• Role: ${targetUser.role.toUpperCase()}\n\n**Ketik "YA HAPUS ${targetUser.nama}"** untuk konfirmasi.\n_(Ketik "batal" untuk membatalkan)_`;
}

// ======================= QUERY FUNCTIONS =======================

async function queryStudentProfessional(name) {
    const students = systemDataCache.students;
    const matchedStudents = students.filter(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (matchedStudents.length === 0) {
        return `🔍 **Tidak ditemukan siswa dengan nama "${name}".**\n\n💡 Coba gunakan nama lain atau cek ejaan.`;
    }
    
    if (matchedStudents.length === 1) {
        const s = matchedStudents[0];
        
        const userAuth = systemDataCache.usersAuth?.find(u => u.fpId == s.id);
        const hasAccount = !!userAuth;
        
        return `**👨‍🎓 Detail Siswa**

• **Nama:** ${s.nama}
• **ID Fingerprint:** ${s.id}
• **Kelas:** ${s.kelas || '-'}
• **Jurusan:** ${s.jurusan || '-'}
• **Delay Pulang:** ${s.delayOut || 60} menit
• **Status Akun:** ${hasAccount ? '✅ Sudah memiliki akun' : '❌ Belum memiliki akun'}

${hasAccount ? `📧 **Email:** ${userAuth.email || '-'}` : '💡 **Tips:** Daftarkan akun siswa agar bisa login ke sistem.'}`;
    }
    
    let result = `**🔍 Ditemukan ${matchedStudents.length} siswa dengan nama "${name}":**\n\n`;
    matchedStudents.forEach((s, i) => {
        result += `${i+1}. **${s.nama}** (ID: ${s.id}) - Kelas ${s.kelas || '-'} / ${s.jurusan || '-'}\n`;
    });
    result += `\n💡 **Ketik "id [ID] siswa"** untuk melihat detail lengkap.`;
    return result;
}

async function queryStudentByIdProfessional(id) {
    const student = systemDataCache.students.find(s => s.id == id);
    
    if (!student) {
        return `🔍 **Tidak ditemukan siswa dengan ID ${id}.**`;
    }
    
    const userAuth = systemDataCache.usersAuth?.find(u => u.fpId == student.id);
    const hasAccount = !!userAuth;
    
    let attendanceRecords = systemDataCache.attendance.filter(a => a.studentId == id);
    const totalAttendance = attendanceRecords.length;
    const hadirCount = attendanceRecords.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    const persentase = totalAttendance > 0 ? ((hadirCount / totalAttendance) * 100).toFixed(1) : 0;
    
    return `**👨‍🎓 Detail Lengkap Siswa**

• **Nama:** ${student.nama}
• **ID Fingerprint:** ${student.id}
• **Kelas:** ${student.kelas || '-'}
• **Jurusan:** ${student.jurusan || '-'}
• **Delay Pulang:** ${student.delayOut || 60} menit

**📊 Statistik Kehadiran:**
• **Total Absensi:** ${totalAttendance} kali
• **Hadir:** ${hadirCount} kali
• **Persentase Kehadiran:** ${persentase}%

**👤 Status Akun:**
${hasAccount ? `✅ **Sudah memiliki akun**\n• Email: ${userAuth.email || '-'}` : '❌ **Belum memiliki akun** - Daftarkan untuk akses login'}

💡 **Ketik "rekap ${student.nama}"** untuk melihat detail absensi per hari.`;
}

async function getStudentsByClassProfessional(kelas, jurusan = null) {
    let students = systemDataCache.students.filter(s => s.kelas === kelas);
    
    if (jurusan) {
        students = students.filter(s => s.jurusan === jurusan);
    }
    
    if (students.length === 0) {
        if (jurusan) {
            return `🔍 **Tidak ditemukan siswa di kelas ${kelas} jurusan ${jurusan}.**`;
        }
        return `🔍 **Tidak ditemukan siswa di kelas ${kelas}.**`;
    }
    
    let result = `**📚 Daftar Siswa Kelas ${kelas}${jurusan ? ` (Jurusan ${jurusan})` : ''}**\n\n`;
    students.forEach((s, i) => {
        const userAuth = systemDataCache.usersAuth?.find(u => u.fpId == s.id);
        const hasAccount = userAuth ? '✓' : '○';
        result += `${i+1}. **${s.nama}** (ID: ${s.id}) ${hasAccount}\n`;
    });
    result += `\n**Total:** ${students.length} siswa\n`;
    result += `\n💡 **Ketik "id [ID] siswa"** untuk melihat detail lengkap.\n`;
    result += `\n*✓ = Sudah berakun | ○ = Belum berakun*`;
    return result;
}

async function getStudentRekapProfessional(name) {
    const student = systemDataCache.students.find(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (!student) {
        return `🔍 **Tidak ditemukan siswa dengan nama "${name}".**`;
    }
    
    const attendanceRecords = systemDataCache.attendance.filter(a => a.studentId == student.id);
    const dates = [...new Set(attendanceRecords.map(a => a.date))].sort();
    const last30Days = dates.slice(-30);
    
    const hadir = attendanceRecords.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    const terlambat = attendanceRecords.filter(a => a.timeIn && a.timeIn > '07:30').length;
    const alpha = attendanceRecords.filter(a => a.status === 'Alpha').length;
    const persentase = dates.length > 0 ? ((hadir / dates.length) * 100).toFixed(1) : 0;
    
    let statusGrade = '';
    let gradeColor = '';
    if (persentase >= 90) { statusGrade = '🌟 Sangat Baik'; gradeColor = '#4caf50'; }
    else if (persentase >= 75) { statusGrade = '✅ Baik'; gradeColor = '#8bc34a'; }
    else if (persentase >= 60) { statusGrade = '📊 Cukup'; gradeColor = '#ffc107'; }
    else if (persentase >= 40) { statusGrade = '⚠️ Kurang'; gradeColor = '#ff9800'; }
    else { statusGrade = '❌ Buruk'; gradeColor = '#f44336'; }
    
    let recentRecords = attendanceRecords
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
    
    let recentHtml = '';
    recentRecords.forEach(record => {
        const statusIcon = record.status === 'Hadir' ? '✅' : (record.status === 'Pulang' ? '🏠' : '📝');
        recentHtml += `• ${record.date}: ${statusIcon} ${record.status} ${record.timeIn ? `(${record.timeIn})` : ''}\n`;
    });
    
    return `**📊 Rekap Absensi ${student.nama} (ID: ${student.id})**

**📈 Statistik:**
• **Total Hari Absensi:** ${dates.length} hari
• **Hadir:** ${hadir} kali
• **Terlambat:** ${terlambat} kali
• **Alpha:** ${alpha} kali
• **Persentase Kehadiran:** ${persentase}%
• **Status:** <span style="color:${gradeColor}">${statusGrade}</span>

**📋 5 Absensi Terakhir:**
${recentHtml}

💡 **Tips:** ${persentase < 75 ? 'Tingkatkan kehadiran dengan lebih disiplin!' : 'Pertahankan prestasi kehadiran yang baik!'}`;
}

async function getTopStudentsProfessional(limit = 5) {
    const studentStats = [];
    
    for (const student of systemDataCache.students) {
        const attendanceRecords = systemDataCache.attendance.filter(a => a.studentId == student.id);
        const dates = [...new Set(attendanceRecords.map(a => a.date))];
        const hadir = attendanceRecords.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
        const persentase = dates.length > 0 ? (hadir / dates.length) * 100 : 0;
        
        studentStats.push({
            ...student,
            persentase: persentase,
            hadirCount: hadir,
            totalDays: dates.length
        });
    }
    
    const topStudents = studentStats
        .filter(s => s.totalDays > 0)
        .sort((a, b) => b.persentase - a.persentase)
        .slice(0, limit);
    
    if (topStudents.length === 0) {
        return "🏆 **Belum ada data kehadiran untuk menentukan peringkat.**";
    }
    
    let result = `**🏆 Top ${limit} Siswa dengan Kehadiran Terbaik**\n\n`;
    topStudents.forEach((s, i) => {
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : `${i+1}.`));
        result += `${medal} **${s.nama}** (Kelas ${s.kelas || '-'})\n`;
        result += `   📊 Kehadiran: ${s.persentase.toFixed(1)}% (${s.hadirCount}/${s.totalDays} hari)\n\n`;
    });
    
    return result;
}

async function getGeneralStatsProfessional() {
    const students = systemDataCache.students;
    const attendance = systemDataCache.attendance;
    const usersAuth = systemDataCache.usersAuth;
    
    const dates = [...new Set(attendance.map(a => a.date))];
    const totalHadir = attendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    const totalTerlambat = attendance.filter(a => a.timeIn && a.timeIn > '07:30').length;
    const totalAlpha = attendance.filter(a => a.status === 'Alpha').length;
    
    const persentaseRata = dates.length > 0 && students.length > 0 
        ? ((totalHadir / (dates.length * students.length)) * 100).toFixed(1) 
        : 0;
    
    const studentsWithAccount = usersAuth.filter(u => u.fpId).length;
    
    return `**📊 Statistik Umum Sistem Absensi**

**👥 Data Pengguna:**
• **Total Siswa:** ${students.length} orang
• **Total User Terdaftar:** ${usersAuth.length} orang
• **Siswa dengan Akun:** ${studentsWithAccount} orang
• **Siswa Belum Berakun:** ${students.length - studentsWithAccount} orang

**📋 Data Absensi:**
• **Total Transaksi Absensi:** ${attendance.length} kali
• **Total Hari Absensi:** ${dates.length} hari
• **Total Kehadiran:** ${totalHadir} kali
• **Total Keterlambatan:** ${totalTerlambat} kali
• **Total Alpha (Tidak Hadir):** ${totalAlpha} kali

**📊 Rata-rata Kehadiran:** ${persentaseRata}%

**🏫 Konfigurasi Sekolah:**
• **Tipe Sekolah:** ${systemDataCache.schoolConfig.type === 'smp' ? 'SMP' : (systemDataCache.schoolConfig.type === 'smk' ? 'SMK' : 'SMP & SMK')}
• **Jumlah Kelas:** ${systemDataCache.schoolConfig.classes?.length || 0}
• **Jumlah Jurusan:** ${systemDataCache.schoolConfig.majors?.length || 0}

💡 **Ketik "rekomendasi"** untuk saran peningkatan kehadiran.`;
}

async function predictTrendProfessional() {
    const attendance = systemDataCache.attendance;
    const dates = [...new Set(attendance.map(a => a.date))].sort();
    
    if (dates.length < 7) {
        return "📈 **Data tidak cukup untuk prediksi tren.**\n\nMinimal diperlukan 7 hari data kehadiran untuk analisis tren.";
    }
    
    const last7Days = dates.slice(-7);
    const lastWeekAttendance = last7Days.map(date => {
        const dayRecords = attendance.filter(a => a.date === date);
        const hadir = dayRecords.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
        return { date, hadir, total: dayRecords.length };
    });
    
    const avgAttendance = lastWeekAttendance.reduce((sum, day) => sum + day.hadir, 0) / lastWeekAttendance.length;
    const trend = avgAttendance > (systemDataCache.students.length * 0.7) ? 'meningkat' : 
                  (avgAttendance > (systemDataCache.students.length * 0.5) ? 'stabil' : 'menurun');
    
    let prediction = '';
    if (trend === 'meningkat') {
        prediction = "Dengan tren positif saat ini, diprediksi kehadiran akan tetap tinggi di minggu mendatang. Pertahankan strategi yang sudah berjalan!";
    } else if (trend === 'stabil') {
        prediction = "Kehadiran cenderung stabil. Sedikit peningkatan dapat mencapai target yang lebih baik. Fokus pada siswa dengan kehadiran rendah.";
    } else {
        prediction = "⚠️ **Peringatan!** Kehadiran menunjukkan tren menurun. Segera lakukan evaluasi dan intervensi untuk meningkatkan kehadiran siswa.";
    }
    
    let weeklyData = '';
    lastWeekAttendance.forEach(day => {
        const persen = (day.hadir / systemDataCache.students.length * 100).toFixed(1);
        weeklyData += `• ${day.date}: ${day.hadir}/${systemDataCache.students.length} siswa (${persen}%)\n`;
    });
    
    return `**🔮 Prediksi Tren Kehadiran (7 Hari ke Depan)**

**📊 Data 7 Hari Terakhir:**
${weeklyData}

**📈 Analisis Tren:** ${trend === 'meningkat' ? '📈 Meningkat' : (trend === 'stabil' ? '📊 Stabil' : '📉 Menurun')}
**📋 Rata-rata Kehadiran:** ${avgAttendance.toFixed(1)}/${systemDataCache.students.length} siswa (${(avgAttendance / systemDataCache.students.length * 100).toFixed(1)}%)

**🔮 Prediksi:** ${prediction}

💡 **Ketik "rekomendasi"** untuk mendapatkan saran strategis.`;
}

async function compareAttendanceProfessional() {
    const attendance = systemDataCache.attendance;
    const dates = [...new Set(attendance.map(a => a.date))].sort();
    
    if (dates.length < 14) {
        return "📊 **Data tidak cukup untuk perbandingan.**\n\nMinimal diperlukan 14 hari data untuk perbandingan antar periode.";
    }
    
    const lastWeek = dates.slice(-7);
    const prevWeek = dates.slice(-14, -7);
    
    const calcWeekStats = (weekDates) => {
        let hadir = 0;
        let total = 0;
        weekDates.forEach(date => {
            const dayRecords = attendance.filter(a => a.date === date);
            hadir += dayRecords.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
            total += dayRecords.length;
        });
        return { hadir, total, avg: hadir / weekDates.length };
    };
    
    const lastWeekStats = calcWeekStats(lastWeek);
    const prevWeekStats = calcWeekStats(prevWeek);
    
    const difference = lastWeekStats.avg - prevWeekStats.avg;
    const trend = difference > 0 ? 'meningkat' : (difference < 0 ? 'menurun' : 'stabil');
    const trendIcon = difference > 0 ? '📈' : (difference < 0 ? '📉' : '📊');
    
    let analysis = '';
    if (difference > 5) {
        analysis = "🎉 **Peningkatan signifikan!** Strategi yang diterapkan berhasil. Pertahankan dan tingkatkan lagi!";
    } else if (difference > 0) {
        analysis = "✅ **Peningkatan positif.** Terus pantau dan tingkatkan motivasi siswa.";
    } else if (difference < -5) {
        analysis = "⚠️ **Penurunan signifikan!** Segera evaluasi penyebab dan lakukan intervensi.";
    } else if (difference < 0) {
        analysis = "📊 **Sedikit penurunan.** Perhatikan faktor-faktor yang mempengaruhi kehadiran.";
    } else {
        analysis = "📊 **Kehadiran stabil.** Pertahankan konsistensi yang sudah baik.";
    }
    
    const lastWeekPersen = (lastWeekStats.avg / systemDataCache.students.length * 100).toFixed(1);
    const prevWeekPersen = (prevWeekStats.avg / systemDataCache.students.length * 100).toFixed(1);
    
    return `**📊 Perbandingan Kehadiran Antar Periode**

**📅 Minggu Ini (7 hari terakhir):**
• Rata-rata kehadiran: ${lastWeekStats.avg.toFixed(1)}/${systemDataCache.students.length} siswa
• Persentase: ${lastWeekPersen}%

**📅 Minggu Lalu (7 hari sebelumnya):**
• Rata-rata kehadiran: ${prevWeekStats.avg.toFixed(1)}/${systemDataCache.students.length} siswa
• Persentase: ${prevWeekPersen}%

**📈 Perubahan:** ${trendIcon} ${difference > 0 ? '+' : ''}${difference.toFixed(1)} poin

**🔍 Analisis:** ${analysis}

💡 **Ketik "rekomendasi"** untuk saran lebih lanjut.`;
}

async function getProfessionalRecommendations() {
    const students = systemDataCache.students;
    const attendance = systemDataCache.attendance;
    const dates = [...new Set(attendance.map(a => a.date))];
    
    if (students.length === 0 || dates.length === 0) {
        return "📭 **Data tidak mencukupi untuk memberikan rekomendasi.**\n\nPastikan ada data siswa dan absensi yang cukup.";
    }
    
    const studentStats = [];
    for (const student of students) {
        const records = attendance.filter(a => a.studentId == student.id);
        const hadir = records.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
        const persentase = dates.length > 0 ? (hadir / dates.length) * 100 : 0;
        const terlambat = records.filter(a => a.timeIn && a.timeIn > '07:30').length;
        
        studentStats.push({
            ...student,
            persentase,
            hadir,
            terlambat,
            totalDays: records.length
        });
    }
    
    const bottomPerformers = studentStats
        .filter(s => s.totalDays > 0)
        .sort((a, b) => a.persentase - b.persentase)
        .slice(0, 3);
    
    const avgAttendance = studentStats.reduce((sum, s) => sum + s.persentase, 0) / students.length;
    
    let recommendations = [];
    
    if (avgAttendance < 75) {
        recommendations.push("🔴 **Prioritas Tinggi:** Rata-rata kehadiran di bawah 75%. Lakukan evaluasi menyeluruh.");
        recommendations.push("📢 **Komunikasi:** Tingkatkan komunikasi dengan orang tua siswa melalui WhatsApp.");
        recommendations.push("🏆 **Motivasi:** Adakan program penghargaan untuk siswa dengan kehadiran sempurna.");
    } else if (avgAttendance < 85) {
        recommendations.push("🟡 **Prioritas Sedang:** Kehadiran cukup baik, masih ada ruang peningkatan.");
        recommendations.push("📊 **Monitoring:** Pantau siswa dengan kehadiran di bawah 60%.");
    } else {
        recommendations.push("🟢 **Pertahankan:** Kehadiran sudah sangat baik. Terus pertahankan motivasi siswa.");
    }
    
    if (bottomPerformers.length > 0) {
        recommendations.push(`⚠️ **Perhatian Khusus:** ${bottomPerformers.length} siswa memiliki kehadiran rendah.`);
        bottomPerformers.forEach(s => {
            recommendations.push(`   • ${s.nama} (${s.kelas || '-'}) - ${s.persentase.toFixed(1)}% kehadiran`);
        });
        recommendations.push("   💡 **Tindakan:** Lakukan pembinaan personal dan hubungi orang tua.");
    }
    
    const terlambatCount = studentStats.reduce((sum, s) => sum + s.terlambat, 0);
    if (terlambatCount > 0) {
        recommendations.push(`⏰ **Kedisiplinan:** Terdapat ${terlambatCount} catatan keterlambatan. Sosialisasikan pentingnya tepat waktu.`);
    }
    
    return `**🎯 Rekomendasi Strategis Peningkatan Kehadiran**

📊 **Ringkasan:**
• Rata-rata kehadiran: ${avgAttendance.toFixed(1)}%
• Target ideal: 85% ke atas
• ${students.length} siswa aktif

**📋 Rekomendasi:**

${recommendations.map((r, i) => `${i+1}. ${r}`).join('\n\n')}

💡 **Ketik "statistik"** untuk melihat data lebih detail.`;
}

// ======================= FALLBACK RESPONSE =======================

function generateFallbackProfessional(message) {
    const lowerMsg = String(message).toLowerCase();
    
    if (lowerMsg.match(/halo|hai|hello|hy|hii?/)) return getProfessionalGreeting();
    if (lowerMsg.match(/terima kasih|makasih|thanks/)) return getProfessionalThanks();
    if (lowerMsg.match(/siapa kamu|kamu siapa/)) return getProfessionalIntroduction();
    if (lowerMsg.match(/tentang sistem|about/i)) return getAboutSystem();
    if (lowerMsg.match(/jam berapa|waktu sekarang|tanggal berapa/i)) return getCurrentDateTime();
    if (lowerMsg.match(/bye|dadah|sampai jumpa/)) {
        return "👋 **Sampai jumpa!** Terima kasih telah menggunakan Sistem Absensi.";
    }
    
    return `🤔 **Maaf, saya belum bisa memproses perintah itu dengan baik.**

📋 **Perintah yang saya pahami:**
• 🔍 **Cari data** - "data siswa Budi", "id 5 siapa?"
• 📊 **Rekap** - "rekap absensi Ani", "statistik"
• ✏️ **Kelola** (Guru/Admin) - "tambah siswa ...", "hapus siswa id 5"
• 🏆 **Peringkat** - "siswa terbaik", "top 10"
• ⚙️ **Pengaturan** (Admin/Developer) - "ubah nama sekolah menjadi SMK Taruna"
• 👥 **User** (Admin/Developer) - "ubah role Budi menjadi admin"
• 📢 **Pengumuman** (Guru/Admin) - "buat pengumuman Libur dengan isi ..."

💬 **Ketik "bantuan"** untuk panduan lengkap.`;
}

// ======================= AI MESSAGE PROCESSING =======================

async function processAIMessage(message) {
    const messageStr = String(message || '').trim();
    
    if (!messageStr) {
        return "Silakan ketik pesan Anda.";
    }
    
    // Cek konfirmasi hapus yang pending
    if (pendingDeleteConfirmation) {
        if (messageStr.toLowerCase().includes('ya hapus')) {
            const result = await executeDeleteConfirmation(messageStr);
            if (result) return result;
        } else if (messageStr.toLowerCase().includes('batal')) {
            pendingDeleteConfirmation = null;
            return "❌ **Penghapusan dibatalkan.**";
        }
    }
    
    // Cek konfirmasi hapus user yang pending
    if (pendingAction && pendingAction.type === 'delete_user') {
        if (messageStr.toLowerCase().includes(`ya hapus ${pendingAction.userName.toLowerCase()}`)) {
            try {
                await db.ref(`users_auth/${pendingAction.userUid}`).remove();
                
                if (typeof logActivity === 'function') {
                    logActivity('delete_user', `AI: Hapus user ${pendingAction.userName}`);
                }
                
                pendingAction = null;
                return `✅ **User "${pendingAction?.userName}" berhasil dihapus!**`;
            } catch (error) {
                pendingAction = null;
                return `❌ **Gagal menghapus user:** ${error.message}`;
            }
        } else if (messageStr.toLowerCase().includes('batal')) {
            pendingAction = null;
            return "❌ **Penghapusan user dibatalkan.**";
        }
    }
    
    await updateSystemDataCache();
    
    const intent = parseProfessionalIntent(messageStr);
    console.log(`🤖 Intent: ${intent.intent} (confidence: ${intent.confidence})`);
    
    if (intent.confidence >= 0.7) {
        const result = await executeProfessionalIntent(intent);
        if (result) return result;
    }
    
    return await callGroqAPI(messageStr, currentAIContext);
}

// ======================= CALL BACKEND API =======================

async function callBackendAI(userMessage, systemPrompt = null, history = []) {
    try {
        const defaultSystemPrompt = `Anda adalah Asisten AI Profesional untuk Sistem Absensi Sekolah.

=== DATA SISTEM REAL-TIME ===
Total siswa: ${systemDataCache.students.length}
Total absensi: ${systemDataCache.attendance.length}
Total user: ${systemDataCache.usersAuth.length}
Role pengguna: ${currentUser?.role || 'unknown'}
Waktu: ${new Date().toLocaleString('id-ID')}
Nama Sekolah: ${systemDataCache.settings.schoolName || 'Sistem Absensi'}

=== PENGATURAN ===
Delay global: ${systemDataCache.settings.delayOut || 60} menit
Batas terlambat: ${systemDataCache.settings.lateThreshold || '07:30'}
Tipe sekolah: ${systemDataCache.schoolConfig.type || 'smp'}
Jumlah kelas: ${systemDataCache.schoolConfig.classes?.length || 0}
Jumlah jurusan: ${systemDataCache.schoolConfig.majors?.length || 0}

=== RESPONSIBILITAS ===
1. Berikan jawaban AKURAT, INFORMATIF, dan PROFESIONAL
2. Gunakan format markdown untuk data
3. Jika tidak tahu, akui dengan jujur
4. Jangan pernah memberikan informasi palsu
5. Prioritaskan data sistem di atas pengetahuan umum

=== GAYA BAHASA ===- Bahasa Indonesia formal namun ramah
- Gunakan emoji secukupnya (✅, 📊, 👤, dll)
- Untuk data, gunakan bullet points`;

        const finalSystemPrompt = systemPrompt || defaultSystemPrompt;
        
        const formattedHistory = history.map(msg => ({
            role: msg.role,
            content: msg.content
        }));
        
        const response = await fetch(`${BACKEND_URL}/api/ai/groq`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: userMessage,
                systemPrompt: finalSystemPrompt,
                history: formattedHistory,
                temperature: 0.75,
                maxTokens: 2000
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Backend error ${response.status}: ${errorData.error || 'Unknown error'}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.response) {
            return data.response;
        } else {
            throw new Error(data.error || 'Invalid response from backend');
        }
        
    } catch (error) {
        console.error("Backend AI error:", error);
        return generateFallbackProfessional(userMessage);
    }
}

async function callGroqAPI(userMessage, contextData = null) {
    await updateSystemDataCache();
    return await callBackendAI(userMessage);
}

// ======================= UI FUNCTIONS =======================

function addAIAssistantButton() {
    if (!hasTeacherOrHigherAccess()) {
        console.log("🔒 AI Assistant: Tidak ada akses untuk role:", currentUser?.role);
        return;
    }
    
    // Cek apakah tombol sudah ada
    if (document.getElementById('aiAssistantBtn')) {
        console.log("✅ AI Assistant button already exists");
        return;
    }
    
    // Coba cari stats grid
    let statsGrid = document.getElementById('dashboardStatsGrid');
    if (!statsGrid) {
        statsGrid = document.querySelector('.stats-grid');
    }
    
    if (statsGrid) {
        // Tambahkan tombol ke stats grid
        const aiButton = document.createElement('div');
        aiButton.className = 'stat-card-new';
        aiButton.id = 'aiAssistantBtn';
        aiButton.style.cssText = `
            cursor: pointer;
            background: linear-gradient(135deg, #667eea, #764ba2);
            transition: transform 0.2s;
            border-radius: 20px;
            padding: 20px;
            text-align: center;
        `;
        aiButton.onclick = () => openAIAssistantModal();
        aiButton.onmouseenter = () => aiButton.style.transform = 'scale(1.02)';
        aiButton.onmouseleave = () => aiButton.style.transform = 'scale(1)';
        aiButton.innerHTML = `
            <div class="stat-title-new" style="color: white;">🤖 AI Assistant</div>
            <div class="stat-number" style="color: white; font-size: 1.1rem;">Tanya Apa Saja</div>
            <div class="stat-percent" style="color: rgba(255,255,255,0.8);">Chat dengan AI</div>
        `;
        statsGrid.appendChild(aiButton);
        console.log("✅ AI Assistant button added to stats grid");
    } else {
        // Fallback: tambahkan tombol floating
        const floatingBtn = document.createElement('button');
        floatingBtn.id = 'aiAssistantBtn';
        floatingBtn.innerHTML = '🤖';
        floatingBtn.title = 'AI Assistant - Tanya Apa Saja';
        floatingBtn.onclick = () => openAIAssistantModal();
        floatingBtn.style.cssText = `
            position: fixed;
            bottom: 100px;
            right: 20px;
            width: 56px;
            height: 56px;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            cursor: pointer;
            font-size: 28px;
            z-index: 999;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            transition: transform 0.2s;
        `;
        floatingBtn.onmouseenter = () => floatingBtn.style.transform = 'scale(1.1)';
        floatingBtn.onmouseleave = () => floatingBtn.style.transform = 'scale(1)';
        document.body.appendChild(floatingBtn);
        console.log("✅ AI Assistant floating button added as fallback");
    }
}

function openAIAssistantModal() {
    if (!hasTeacherOrHigherAccess()) {
        if (typeof showToast === 'function') {
            showToast("🔒 AI Assistant hanya untuk Admin, Guru, dan Developer", "error");
        }
        return;
    }
    
    let modal = document.getElementById('modal-ai-assistant');
    
    if (!modal) {
        // Buat modal jika belum ada
        const modalHtml = `
            <div id="modal-ai-assistant" class="modal-overlay">
                <div class="modal-box" style="max-width: 600px; width: 90%; height: 80vh; display: flex; flex-direction: column; padding: 0;">
                    <div class="modal-title" style="padding: 15px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                        <span>🤖 AI Assistant <small style="font-size: 11px; color: #888;" id="aiProviderBadge">Groq AI</small></span>
                        <span onclick="closeAIAssistantModal()" style="cursor: pointer; font-size: 24px;">✖</span>
                    </div>
                    <div id="aiChatMessages" style="flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px;">
                        <div class="ai-message ai-bot">
                            <div class="ai-avatar">🤖</div>
                            <div class="ai-bubble">
                                Halo! Saya asisten AI untuk sistem absensi.<br><br>
                                Saya bisa membantu:<br>
                                • 🔍 Mencari data siswa<br>
                                • 📊 Melihat rekap absensi<br>
                                • 📈 Menampilkan statistik<br>
                                • ✏️ Membantu operasional (tambah/edit/hapus data)<br>
                                • ⚙️ Pengaturan sistem (untuk Admin/Developer)<br><br>
                                <strong>Ketik "bantuan" untuk melihat semua perintah!</strong>
                            </div>
                        </div>
                    </div>
                    <div style="padding: 15px; border-top: 1px solid var(--border); display: flex; gap: 10px;">
                        <input type="text" id="aiChatInput" placeholder="Tanyakan sesuatu... misal: 'data siswa kelas X'" style="flex: 1; padding: 12px; border-radius: 30px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary);">
                        <button id="aiSendBtn" style="padding: 12px 20px; border-radius: 30px; background: linear-gradient(135deg, #667eea, #764ba2); border: none; color: white; cursor: pointer;">📤 Kirim</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('modal-ai-assistant');
    }
    
    // Reset chat history untuk sesi baru
    aiChatHistory = [];
    const messagesContainer = document.getElementById('aiChatMessages');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div class="ai-message ai-bot">
                <div class="ai-avatar">🤖</div>
                <div class="ai-bubble">
                    Halo! Saya asisten AI untuk sistem absensi.<br><br>
                    Saya bisa membantu:<br>
                    • 🔍 Mencari data siswa<br>
                    • 📊 Melihat rekap absensi<br>
                    • 📈 Menampilkan statistik<br>
                    • ✏️ Membantu operasional (tambah/edit/hapus data)<br>
                    • ⚙️ Pengaturan sistem (untuk Admin/Developer)<br><br>
                    <strong>Ketik "bantuan" untuk melihat semua perintah!</strong>
                </div>
            </div>
        `;
    }
    
    modal.classList.add('open');
    aiAssistantModalOpen = true;
    
    // Setup event listeners
    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiSendBtn');
    
    const sendMessage = async () => {
        const message = input.value.trim();
        if (!message) return;
        
        // Tampilkan pesan user
        const messagesDiv = document.getElementById('aiChatMessages');
        const userMessageDiv = document.createElement('div');
        userMessageDiv.className = 'ai-message ai-user';
        userMessageDiv.innerHTML = `
            <div class="ai-avatar">👤</div>
            <div class="ai-bubble">${escapeHtml(message)}</div>
        `;
        messagesDiv.appendChild(userMessageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        input.value = '';
        sendBtn.disabled = true;
        sendBtn.innerHTML = '⏳';
        
        // Tampilkan loading
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'ai-message ai-bot';
        loadingDiv.id = 'ai-loading';
        loadingDiv.innerHTML = `
            <div class="ai-avatar">🤖</div>
            <div class="ai-bubble">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;
        messagesDiv.appendChild(loadingDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        // Proses pesan
        const response = await processAIMessage(message);
        
        // Hapus loading
        const loading = document.getElementById('ai-loading');
        if (loading) loading.remove();
        
        // Tampilkan respons
        const responseDiv = document.createElement('div');
        responseDiv.className = 'ai-message ai-bot';
        responseDiv.innerHTML = `
            <div class="ai-avatar">🤖</div>
            <div class="ai-bubble">${formatMarkdown(response)}</div>
        `;
        messagesDiv.appendChild(responseDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        
        sendBtn.disabled = false;
        sendBtn.innerHTML = '📤 Kirim';
        
        // Simpan ke history
        aiChatHistory.push({ role: 'user', content: message });
        aiChatHistory.push({ role: 'assistant', content: response });
        if (aiChatHistory.length > 20) {
            aiChatHistory = aiChatHistory.slice(-20);
        }
    };
    
    // Hapus listener lama
    const newSendBtn = sendBtn.cloneNode(true);
    sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);
    
    newSendBtn.onclick = sendMessage;
    newInput.onkeypress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };
    
    newInput.focus();
}

function closeAIAssistantModal() {
    const modal = document.getElementById('modal-ai-assistant');
    if (modal) {
        modal.classList.remove('open');
    }
    aiAssistantModalOpen = false;
    pendingDeleteConfirmation = null;
    pendingAction = null;
}

// ======================= INISIALISASI =======================

function initAIAssistant() {
    if (aiAssistantInitialized) {
        console.log("🤖 AI Assistant already initialized");
        return;
    }
    
    // AI Assistant tersedia untuk Admin, Guru, Developer, Wakil Kepala, Staff TU
    if (!currentUser || !hasTeacherOrHigherAccess()) {
        console.log("🔒 AI Assistant: Akses ditolak untuk role:", currentUser?.role);
        return;
    }
    
    aiAssistantInitialized = true;
    console.log("🤖 AI Assistant v5.4 initialized - Backend Proxy Mode (AMAN)");
    console.log("   - Backend URL:", BACKEND_URL);
    console.log("   - Akses untuk role:", currentUser?.role);
    console.log("   - Super Admin (Admin/Developer): akses penuh termasuk pengaturan sistem");
    console.log("   - Guru/Wakil Kepala/Staff TU: akses CRUD siswa, pengumuman, dan data");
    
    // Tambahkan tombol AI Assistant
    setTimeout(() => addAIAssistantButton(), 500);
    
    // Update cache secara periodik
    setInterval(() => updateSystemDataCache(), 30000);
    setInterval(() => {
        if (aiAssistantModalOpen) updateSystemDataCache();
    }, 15000);
}

// Event listeners
window.addEventListener('uiReady', (e) => {
    console.log("📡 AI Assistant: uiReady event received");
    if (e.detail?.currentUser) {
        setTimeout(() => initAIAssistant(), 500);
    }
});

window.addEventListener('dataReady', () => {
    console.log("📡 AI Assistant: dataReady event received");
    if (currentUser && hasTeacherOrHigherAccess() && !aiAssistantInitialized) {
        initAIAssistant();
    }
});

// Auto init jika currentUser sudah ada
if (typeof currentUser !== 'undefined' && currentUser && hasTeacherOrHigherAccess()) {
    setTimeout(() => initAIAssistant(), 1000);
}

// Ekspor fungsi ke global
window.initAIAssistant = initAIAssistant;
window.openAIAssistantModal = openAIAssistantModal;
window.closeAIAssistantModal = closeAIAssistantModal;
window.hasSuperAdminAccess = hasSuperAdminAccess;
window.hasTeacherOrHigherAccess = hasTeacherOrHigherAccess;
window.hasAdminAccess = hasAdminAccess;
window.processAIMessage = processAIMessage;

// Helper function untuk mendapatkan role display name (jika belum ada)
if (typeof window.getRoleDisplayName === 'undefined') {
    window.getRoleDisplayName = function(role) {
        const names = {
            developer: 'Developer',
            admin: 'Kepala Sekolah',
            wakil_kepala: 'Wakil Kepala Sekolah',
            staff_tu: 'Staff TU',
            guru: 'Guru',
            siswa: 'Siswa'
        };
        return names[role] || role.toUpperCase();
    };
}

console.log("✅ ai-assistant.js V5.4 loaded - BACKEND PROXY MODE (API Key aman di server)!");
console.log("   🔒 Semua panggilan AI melalui backend:", BACKEND_URL);
console.log("   👥 Role yang memiliki akses: Admin, Guru, Developer, Wakil Kepala, Staff TU");