// ai-assistant.js - VERSION 5.1 (FIXED: CHANGE USER ROLE - REAL ACTION)
// Asisten AI SUPER POWERFULL dengan Groq API + Action Executor
// Fitur LENGKAP dengan aksi nyata ke database:
// - CRUD siswa lengkap (tambah, edit, hapus via chat) - REAL
// - Manajemen pengaturan sekolah (nama, tipe, kelas, jurusan) - REAL
// - Manajemen delay global - REAL
// - Manajemen user (ubah role, hapus user, reset password) - REAL (khusus admin/dev)
// - Dan masih banyak lagi!
// ============================================================================

// ======================= KONFIGURASI API =======================
const GROQ_API_KEY = "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";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// Konfigurasi AI
const AI_CONFIG = {
    temperature: 0.75,
    maxTokens: 2000,
    topP: 0.95,
    contextMemoryMinutes: 30,
    maxContextMessages: 15
};

// State AI
let aiAssistantInitialized = false;
let aiAssistantModalOpen = false;
let conversationHistory = [];
let longTermMemory = {};
let lastActivityTimestamp = null;
let currentAIContext = null;

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

// Pending actions untuk konfirmasi
let pendingDeleteConfirmation = null;
let pendingAction = null;

// ======================= UTILITY FUNCTIONS =======================

function getTimestamp() {
    return new Date().toLocaleTimeString('id-ID');
}

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

function hasAdminAccess() {
    if (!currentUser) return false;
    return ['admin', 'guru', 'developer'].includes(currentUser.role);
}

function canDeleteUser() {
    if (!currentUser) return false;
    return ['admin', 'developer'].includes(currentUser.role);
}

// ======================= INTENT PARSING =======================

function parseProfessionalIntent(command) {
    const lowerCommand = String(command).toLowerCase();
    
    // SAPAAN
    if (lowerCommand.match(/^(hai|halo|hello|hey|selamat|pagi|siang|malam|apa kabar|how are you|hy|hii?|assalamualaikum)/i)) {
        return { intent: 'greeting', confidence: 0.99 };
    }
    
    // TERIMA KASIH
    if (lowerCommand.match(/terima kasih|makasih|thanks|thank you|thx|tq/i)) {
        return { intent: 'thanks', confidence: 0.99 };
    }
    
    // PERKENALAN
    if (lowerCommand.match(/siapa kamu|kamu siapa|perkenalan|tell me about yourself|fitur apa|bisa apa aja|keahlian/i)) {
        return { intent: 'introduction', confidence: 0.98 };
    }
    
    // BANTUAN
    if (lowerCommand.match(/bantuan|help|tolong|perintah|fitur|bisa apa|command|guide|panduan|list perintah|daftar perintah/i)) {
        return { intent: 'help', confidence: 0.99 };
    }
    
    // MANAJEMEN USER - UBAH ROLE (khusus admin/dev) - DIPERBAIKI
    const roleMatch = command.match(/(?:ubah role|set role|change role|ubah peran|ganti role)\s+(?:akun|user)?\s*["']?([A-Za-z0-9@.]+)["']?\s+(?:menjadi|jadi|to)\s+["']?([A-Za-z]+)["']?/i);
    if (roleMatch && (currentUser?.role === 'admin' || currentUser?.role === 'developer')) {
        console.log("🔧 Detected role change intent:", roleMatch[1], "->", roleMatch[2]);
        return { intent: 'change_user_role', userIdentifier: roleMatch[1], newRole: roleMatch[2].toLowerCase(), confidence: 0.95 };
    }
    
    // MANAJEMEN SISWA - TAMBAH
    const addMatch = command.match(/(?:tambah|buat|input|simpan|add)\s+(?:siswa|data siswa|student)\s+(?:nama|name)?\s*["']?([A-Za-z\s]+)["']?\s*(?:id|ID)?\s*(\d+)\s*(?:kelas|class)?\s*["']?([A-Z0-9\s]+)["']?\s*(?:jurusan|major)?\s*["']?([A-Za-z0-9\s]+)["']?\s*(?:delay)?\s*(\d+)?/i);
    if (lowerCommand.match(/tambah|buat|input|simpan|add/) && lowerCommand.match(/siswa|student/)) {
        if (addMatch && addMatch[1] && addMatch[2] && addMatch[3]) {
            return { intent: 'add_student', nama: addMatch[1].trim(), id: parseInt(addMatch[2]), kelas: addMatch[3].trim().toUpperCase(), jurusan: addMatch[4]?.trim().toUpperCase() || 'UMUM', delay: addMatch[5] ? parseInt(addMatch[5]) : 60, confidence: 0.95 };
        }
        return { intent: 'add_student', need_data: true };
    }
    
    // MANAJEMEN SISWA - UPDATE
    const updateMatch = command.match(/(?:update|edit|ubah|ganti)\s+(?:siswa|data siswa)\s+(?:id|ID)?\s*(\d+)\s*(?:delay|kelas|jurusan)?\s*(\d+|[A-Z0-9]+)?/i);
    if (lowerCommand.match(/update|edit|ubah|ganti/) && lowerCommand.match(/siswa/)) {
        if (updateMatch && updateMatch[1]) {
            return { intent: 'update_student', id: parseInt(updateMatch[1]), value: updateMatch[2] || null, confidence: 0.93 };
        }
        return { intent: 'update_student', need_data: true };
    }
    
    // MANAJEMEN SISWA - HAPUS
    const deleteMatch = command.match(/(?:hapus|delete|remove|padam)\s+(?:siswa|data siswa)\s+(?:id|ID)?\s*(\d+)/i);
    if (lowerCommand.match(/hapus|delete|remove|padam/) && lowerCommand.match(/siswa/)) {
        if (deleteMatch && deleteMatch[1]) {
            return { intent: 'delete_student', id: parseInt(deleteMatch[1]), confidence: 0.98 };
        }
        return { intent: 'delete_student', need_id: true };
    }
    
    // MANAJEMEN NAMA SEKOLAH
    if (lowerCommand.match(/ubah nama sekolah|ganti nama sekolah|set nama sekolah|nama sekolah menjadi|nama sekolah baru/i)) {
        const newNameMatch = command.match(/(?:menjadi|jadi|menjadi)\s+["']?([A-Za-z0-9\s]+)["']?/i);
        if (newNameMatch && newNameMatch[1]) {
            return { intent: 'change_school_name', newName: newNameMatch[1].trim(), confidence: 0.95 };
        }
        return { intent: 'change_school_name', need_name: true };
    }
    
    // MANAJEMEN DELAY GLOBAL
    if (lowerCommand.match(/delay global|ubah delay global|set delay global|global delay/i)) {
        const delayMatch = command.match(/(\d+)\s*(?:menit|minute|minutes|jam|hour|hours)?/i);
        if (delayMatch) {
            let delay = parseInt(delayMatch[1]);
            if (lowerCommand.includes('jam') || lowerCommand.includes('hour')) delay = delay * 60;
            return { intent: 'update_global_delay', delay: delay, confidence: 0.95 };
        }
        return { intent: 'update_global_delay', need_value: true };
    }
    
    // MANAJEMEN KELAS
    if (lowerCommand.match(/tambah kelas|buat kelas|add class|tambah kelas baru/i)) {
        const classNameMatch = command.match(/(?:kelas|class)\s+["']?([A-Z0-9\s]+)["']?/i);
        if (classNameMatch && classNameMatch[1]) {
            return { intent: 'add_class', className: classNameMatch[1].trim().toUpperCase(), confidence: 0.93 };
        }
        return { intent: 'add_class', need_name: true };
    }
    
    if (lowerCommand.match(/hapus kelas|remove class|delete class/i)) {
        const classNameMatch = command.match(/(?:kelas|class)\s+["']?([A-Z0-9\s]+)["']?/i);
        if (classNameMatch && classNameMatch[1]) {
            return { intent: 'remove_class', className: classNameMatch[1].trim().toUpperCase(), confidence: 0.93 };
        }
        return { intent: 'remove_class', need_name: true };
    }
    
    // MANAJEMEN JURUSAN
    if (lowerCommand.match(/tambah jurusan|buat jurusan|add major|tambah jurusan baru/i)) {
        const majorMatch = command.match(/(?:jurusan|major)\s+["']?([A-Za-z0-9\s]+)["']?/i);
        if (majorMatch && majorMatch[1]) {
            return { intent: 'add_major', majorName: majorMatch[1].trim().toUpperCase(), confidence: 0.93 };
        }
        return { intent: 'add_major', need_name: true };
    }
    
    if (lowerCommand.match(/hapus jurusan|remove major|delete major/i)) {
        const majorMatch = command.match(/(?:jurusan|major)\s+["']?([A-Za-z0-9\s]+)["']?/i);
        if (majorMatch && majorMatch[1]) {
            return { intent: 'remove_major', majorName: majorMatch[1].trim().toUpperCase(), confidence: 0.93 };
        }
        return { intent: 'remove_major', need_name: true };
    }
    
    // MANAJEMEN TIPE SEKOLAH
    if (lowerCommand.match(/tipe sekolah|ubah tipe sekolah|set tipe sekolah|school type/i)) {
        const typeMatch = command.match(/(smp|smk|both)/i);
        if (typeMatch) {
            return { intent: 'change_school_type', schoolType: typeMatch[1].toLowerCase(), confidence: 0.95 };
        }
        return { intent: 'change_school_type', need_type: true };
    }
    
    // MANAJEMEN BATAS TERLAMBAT
    if (lowerCommand.match(/batas terlambat|ubah batas terlambat|late threshold/i)) {
        const timeMatch = command.match(/(\d{1,2}):(\d{2})/);
        if (timeMatch) {
            return { intent: 'update_late_threshold', time: `${timeMatch[1]}:${timeMatch[2]}`, confidence: 0.95 };
        }
        return { intent: 'update_late_threshold', need_time: true };
    }
    
    // RESET PASSWORD USER (khusus admin/dev)
    const resetPassMatch = command.match(/(?:reset password|reset pass)\s+(?:user|akun)?\s*["']?([A-Za-z0-9@.]+)["']?/i);
    if (resetPassMatch && (currentUser?.role === 'admin' || currentUser?.role === 'developer')) {
        return { intent: 'reset_user_password', email: resetPassMatch[1], confidence: 0.94 };
    }
    
    // HAPUS USER (khusus admin/dev)
    const deleteUserMatch = command.match(/(?:hapus user|delete user|remove user)\s+["']?([A-Za-z\s]+)["']?/i);
    if (deleteUserMatch && (currentUser?.role === 'admin' || currentUser?.role === 'developer')) {
        return { intent: 'delete_user', userName: deleteUserMatch[1].trim(), confidence: 0.92 };
    }
    
    // BUAT PENGUMUMAN
    const announcementMatch = command.match(/(?:buat pengumuman|tambah pengumuman|add announcement)\s+["']?([^"']+)["']?\s+(?:dengan isi|isi|content)?\s+["']?([^"']+)["']?/i);
    if (announcementMatch && lowerCommand.match(/pengumuman|announcement/)) {
        return { intent: 'create_announcement', title: announcementMatch[1], message: announcementMatch[2] || '', confidence: 0.91 };
    }
    
    // CARI DATA SISWA
    const nameMatch = command.match(/(?:data|info|detail|cari|lihat|tampilkan|show)\s+(?:siswa|student)?\s*["']?([A-Za-z\s]+)["']?(?:\s|$)/i);
    const idMatch = command.match(/(?:id|ID|fingerprint|fp)\s*[:#]?\s*(\d+)/i);
    
    if (nameMatch && nameMatch[1] && nameMatch[1].length > 2 && !lowerCommand.match(/kelas|jurusan|rekap/)) {
        return { intent: 'query_student', name: nameMatch[1].trim(), confidence: 0.96 };
    }
    if (idMatch) {
        return { intent: 'query_student_by_id', id: idMatch[1], confidence: 0.98 };
    }
    
    // SISWA PER KELAS
    const kelasMatch = command.match(/(?:siswa|student|data)\s+(?:kelas|class)\s+["']?([A-Z0-9\s]+)["']?/i);
    if (kelasMatch) {
        return { intent: 'students_by_class', kelas: kelasMatch[1].trim().toUpperCase(), confidence: 0.94 };
    }
    
    // REKAP ABSENSI SISWA
    const rekapMatch = command.match(/(?:rekap|absensi|kehadiran|lihat absen|riwayat)\s+(?:siswa)?\s*["']?([A-Za-z\s]+)["']?/i);
    if (lowerCommand.match(/rekap|absensi|kehadiran|riwayat|lihat absen/i)) {
        if (rekapMatch && rekapMatch[1] && rekapMatch[1].length > 2) {
            return { intent: 'rekap_student', name: rekapMatch[1].trim(), confidence: 0.94 };
        }
        return { intent: 'general_stats', confidence: 0.96 };
    }
    
    // STATISTIK & METRIK
    if (lowerCommand.match(/statistik|stat|ringkasan|summary|dashboard|gambaran|total|berapa|jumlah/i)) {
        return { intent: 'general_stats', confidence: 0.95 };
    }
    
    // TOP/PERINGKAT SISWA
    if (lowerCommand.match(/terbaik|tertinggi|teratas|juara|ranking|top|paling rajin|paling baik|pintar/i)) {
        const limitMatch = command.match(/(\d+)/);
        const limit = limitMatch ? Math.min(parseInt(limitMatch[1]), 20) : 5;
        return { intent: 'top_students', limit, confidence: 0.94 };
    }
    
    // PREDIKSI TREN
    if (lowerCommand.match(/prediksi|tren|forecast|proyeksi|ke depan|mendatang|akan datang/i)) {
        return { intent: 'predict_trend', confidence: 0.9 };
    }
    
    // PERBANDINGAN
    if (lowerCommand.match(/bandingkan|perbandingan|vs|dibanding|lebih|kurang|naik|turun/i)) {
        return { intent: 'compare', confidence: 0.88 };
    }
    
    // REKOMENDASI
    if (lowerCommand.match(/rekomendasi|saran|advice|tips|solusi|how to|bagaimana cara|strategi/i)) {
        return { intent: 'recommendations', confidence: 0.92 };
    }
    
    // INFORMASI SISTEM/WEB
    if (lowerCommand.match(/tentang|about|web ini|aplikasi|sistem absensi|fingerprint|esp32|fitur apa saja/i)) {
        return { intent: 'about_system', confidence: 0.92 };
    }
    
    // INFORMASI WAKTU
    if (lowerCommand.match(/jam berapa|waktu|tanggal|hari ini|sekarang|date|time/i)) {
        return { intent: 'datetime', confidence: 0.97 };
    }
    
    return { intent: 'general_chat', message: command, confidence: 0.65 };
}

// ======================= EKSEKUSI INTENT =======================

async function executeProfessionalIntent(intent) {
    await updateSystemDataCache();
    
    switch(intent.intent) {
        case 'greeting': return getProfessionalGreeting();
        case 'thanks': return getProfessionalThanks();
        case 'introduction': return getProfessionalIntroduction();
        case 'help': return getProfessionalHelp();
        case 'about_system': return getAboutSystem();
        case 'datetime': return getCurrentDateTime();
        
        case 'add_student': return await addStudentViaAI(intent);
        case 'update_student': return await updateStudentViaAI(intent);
        case 'delete_student': return await deleteStudentViaAI(intent);
        
        case 'query_student': return await queryStudentProfessional(intent.name);
        case 'query_student_by_id': return await queryStudentByIdProfessional(intent.id);
        case 'students_by_class': return await getStudentsByClassProfessional(intent.kelas);
        case 'rekap_student': return await getStudentRekapProfessional(intent.name);
        case 'top_students': return await getTopStudentsProfessional(intent.limit);
        case 'general_stats': return await getGeneralStatsProfessional();
        case 'predict_trend': return await predictTrendProfessional();
        case 'compare': return await compareAttendanceProfessional();
        case 'recommendations': return await getProfessionalRecommendations();
        
        case 'change_school_name': return await changeSchoolName(intent);
        case 'update_global_delay': return await updateGlobalDelay(intent);
        case 'add_class': return await addClassAction(intent);
        case 'remove_class': return await removeClassAction(intent);
        case 'add_major': return await addMajorAction(intent);
        case 'remove_major': return await removeMajorAction(intent);
        case 'change_school_type': return await changeSchoolTypeAction(intent);
        case 'update_late_threshold': return await updateLateThreshold(intent);
        
        case 'change_user_role': return await changeUserRoleAction(intent);
        case 'reset_user_password': return await resetUserPasswordAction(intent);
        case 'delete_user': return await deleteUserAction(intent);
        
        case 'create_announcement': return await createAnnouncementAction(intent);
        
        default: return null;
    }
}

// ======================= RESPON PROFESIONAL =======================

function getProfessionalGreeting() {
    const hour = new Date().getHours();
    let greeting = "Selamat";
    if (hour < 12) greeting += " Pagi 🌅";
    else if (hour < 15) greeting += " Siang ☀️";
    else if (hour < 19) greeting += " Sore 🌤️";
    else greeting += " Malam 🌙";
    
    const userName = currentUser?.nama || 'Pengguna';
    let roleText = '';
    switch(currentUser?.role) {
        case 'admin': roleText = 'Administrator'; break;
        case 'guru': roleText = 'Guru'; break;
        case 'developer': roleText = 'Developer'; break;
        default: roleText = 'Siswa';
    }
    
    const schoolName = systemDataCache.settings.schoolName || 'Sekolah';
    
    return `👋 **${greeting}, ${escapeHtml(userName)}!**\n\nSaya adalah **Asisten AI Super Powerfull** sistem absensi **${escapeHtml(schoolName)}**.\n\n` +
           `📋 **Yang bisa saya bantu hari ini:**\n` +
           `• 🔍 **Cari data siswa** - "data siswa Budi" atau "id 123 siapa?"\n` +
           `• 📊 **Lihat rekap absensi** - "rekap Ani" atau "statistik kehadiran"\n` +
           `• ✏️ **Kelola data siswa** - "tambah siswa nama Toni id 7 kelas X jurusan RPL"\n` +
           `• 🏆 **Lihat peringkat** - "siapa siswa terbaik?"\n` +
           `• ⚙️ **Kelola pengaturan** - "ubah nama sekolah menjadi SMK Taruna" atau "tambah kelas X A"\n` +
           `• 👥 **Kelola user** (Admin/Developer) - "ubah role zaki5go@gmail.com menjadi siswa"\n` +
           `• 📢 **Buat pengumuman** - "buat pengumuman Libur dengan isi Besok libur nasional"\n\n` +
           `💬 Ada yang bisa saya bantu, ${roleText} ${escapeHtml(userName)}?`;
}

function getProfessionalThanks() {
    return "🙏 **Sama-sama!** Senang dapat membantu.\n\nAda yang lain bisa saya bantu? 😊";
}

function getProfessionalIntroduction() {
    return `## 🤖 **Tentang Saya - AI Super Powerfull**\n\n` +
           `Saya adalah **Asisten AI Super Powerfull** untuk Sistem Absensi Berbasis Fingerprint ESP32.\n\n` +
           `**⚡ Kemampuan Utama (REAL ACTION):**\n` +
           `✅ **Manajemen Data Siswa** - Tambah, edit, hapus, cari data siswa (Langsung ke database)\n` +
           `✅ **Manajemen Pengaturan** - Nama sekolah, delay global, kelas, jurusan (Langsung ke database)\n` +
           `✅ **Manajemen User** (Admin/Developer) - Ubah role, reset password, hapus user\n` +
           `✅ **Manajemen Pengumuman** - Buat dan kelola pengumuman\n` +
           `✅ **Analisis Absensi** - Rekap, statistik, perbandingan, prediksi tren\n` +
           `✅ **Rekomendasi Cerdas** - Saran berbasis data untuk peningkatan\n\n` +
           `💡 **Ketik "bantuan"** untuk melihat semua perintah yang tersedia!`;
}

function getAboutSystem() {
    return `## 🏫 **Tentang Sistem Absensi**\n\n` +
           `**Nama Sekolah:** ${escapeHtml(systemDataCache.settings.schoolName || 'Sistem Absensi')}\n\n` +
           `**📋 Fitur Sistem:**\n` +
           `1. **Absensi Fingerprint ESP32** - Real-time scan sidik jari\n` +
           `2. **Dashboard Interaktif** - Visualisasi data kehadiran\n` +
           `3. **Manajemen Siswa** - CRUD data siswa dengan delay pulang\n` +
           `4. **Rekap Absensi** - Laporan lengkap per periode\n` +
           `5. **Pengumuman** - Broadcast informasi dengan timer\n` +
           `6. **Sosial Media Internal** - Status, Chat, Teman\n` +
           `7. **Multi-role User** - Admin, Guru, Developer, Siswa\n` +
           `8. **Log Aktivitas** - Audit trail semua operasi\n` +
           `9. **AI Assistant** - Saya! Yang siap membantu kapan saja\n\n` +
           `**📊 Data Real-time:**\n` +
           `• ${systemDataCache.students.length} Siswa terdaftar\n` +
           `• ${systemDataCache.attendance.length} Catatan absensi\n` +
           `• ${systemDataCache.usersAuth.length} Pengguna aktif\n\n` +
           `💡 Ada yang ingin ditanyakan tentang fitur tertentu?`;
}

function getCurrentDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return `🕐 **Informasi Waktu & Tanggal**\n\n` +
           `📅 **Hari/Tanggal:** ${now.toLocaleDateString('id-ID', options)}\n` +
           `⏰ **Pukul:** ${now.toLocaleTimeString('id-ID')}\n\n` +
           `💡 Butuh bantuan terkait absensi? Ketik "bantuan" untuk panduan!`;
}

function getProfessionalHelp() {
    return `## 📚 **PANDUAN LENGKAP ASISTEN AI**\n\n` +
           `### 🔹 MANAJEMEN USER (KHUSUS ADMIN/DEVELOPER)\n` +
           `| Perintah | Contoh |\n` +
           `|----------|--------|\n` +
           `| Ubah role | "ubah role zaki5go@gmail.com menjadi siswa" |\n` +
           `| Ubah role | "ubah role Budi menjadi admin" |\n` +
           `| Reset password | "reset password budi@sekolah.sch.id" |\n` +
           `| Hapus user | "hapus user Budi" |\n\n` +
           
           `### 🔹 MANAJEMEN SISWA (CRUD - REAL ACTION)\n` +
           `| Perintah | Contoh |\n` +
           `|----------|--------|\n` +
           `| Tambah siswa | "tambah siswa nama Budi id 5 kelas X jurusan RPL" |\n` +
           `| Edit siswa | "update siswa id 5 delay 90" |\n` +
           `| Hapus siswa | "hapus siswa id 5" |\n` +
           `| Cari siswa | "data siswa Budi" atau "id 5 siapa?" |\n\n` +
           
           `### 🔹 PENGATURAN SEKOLAH (REAL ACTION)\n` +
           `| Perintah | Contoh |\n` +
           `|----------|--------|\n` +
           `| Ubah nama sekolah | "ubah nama sekolah menjadi SMK Taruna" |\n` +
           `| Delay global | "ubah delay global menjadi 90 menit" |\n` +
           `| Tambah kelas | "tambah kelas X A" |\n` +
           `| Hapus kelas | "hapus kelas IX" |\n` +
           `| Tambah jurusan | "tambah jurusan RPL" |\n` +
           `| Hapus jurusan | "hapus jurusan TKJ" |\n` +
           `| Tipe sekolah | "ubah tipe sekolah menjadi smk" |\n` +
           `| Batas terlambat | "ubah batas terlambat menjadi 07:15" |\n\n` +
           
           `### 🔹 PENGUMUMAN (REAL ACTION)\n` +
           `| Perintah | Contoh |\n` +
           `|----------|--------|\n` +
           `| Buat pengumuman | "buat pengumuman Libur dengan isi Besok libur nasional" |\n\n` +
           
           `### 🔹 DATA & STATISTIK\n` +
           `| Perintah | Contoh |\n` +
           `|----------|--------|\n` +
           `| Rekap siswa | "rekap Budi" |\n` +
           `| Statistik umum | "statistik sistem" |\n` +
           `| Siswa per kelas | "siswa kelas X" |\n` +
           `| Peringkat | "top 10 siswa" |\n\n` +
           
           `✨ **Tips:** Gunakan bahasa natural, AI akan memahami maksud Anda!`;
}

// ======================= MANAJEMEN USER (KHUSUS ADMIN/DEVELOPER) =======================

async function changeUserRoleAction(data) {
    // Cek akses
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        return "⛔ **Akses Ditolak!**\n\nFitur ubah role user hanya untuk **Admin dan Developer**.\n\nRole Anda saat ini: " + (currentUser?.role || 'tidak diketahui');
    }
    
    if (data.need_data) {
        return "📝 **Format Ubah Role User:**\n\n`ubah role [email atau nama user] menjadi [role baru]`\n\n**Contoh:**\n• `ubah role zaki5go@gmail.com menjadi siswa`\n• `ubah role Budi menjadi admin`\n\nRole yang tersedia: **siswa, guru, admin**\n\n⚠️ **Catatan:** Role Developer tidak dapat diubah!";
    }
    
    if (!data.userIdentifier) {
        return "❌ User identifier tidak boleh kosong! Contoh: `ubah role zaki5go@gmail.com menjadi siswa`";
    }
    
    if (!data.newRole) {
        return "❌ Role baru tidak boleh kosong! Pilih salah satu: **siswa, guru, admin**";
    }
    
    // Validasi role
    const validRoles = ['siswa', 'guru', 'admin'];
    if (!validRoles.includes(data.newRole)) {
        return `❌ Role "${data.newRole}" tidak valid! Pilih salah satu: ${validRoles.join(', ')}`;
    }
    
    // Cari user berdasarkan email atau nama
    const users = systemDataCache.usersAuth || [];
    let targetUser = null;
    let searchTerm = data.userIdentifier.toLowerCase();
    
    // Cari berdasarkan email
    targetUser = users.find(u => u.email && u.email.toLowerCase() === searchTerm);
    
    // Jika tidak ditemukan, cari berdasarkan nama (partial match)
    if (!targetUser) {
        targetUser = users.find(u => u.nama && u.nama.toLowerCase().includes(searchTerm));
    }
    
    if (!targetUser) {
        return `❌ **User "${data.userIdentifier}" tidak ditemukan!**\n\nDaftar user yang terdaftar:\n${users.slice(0, 10).map(u => `• ${u.nama || 'Tanpa nama'} (${u.email || 'tanpa email'}) - ${u.role}`).join('\n')}\n\nGunakan email yang tepat atau nama lengkap.`;
    }
    
    // Cek role developer (tidak bisa diubah)
    if (targetUser.role === 'developer') {
        return "⛔ **Role Developer tidak dapat diubah!**\n\nAkun developer adalah akun khusus yang dilindungi.";
    }
    
    // Cek apakah mencoba mengubah role sendiri
    if (currentUser.uid === targetUser.uid) {
        return "❌ **Anda tidak dapat mengubah role sendiri!**\n\nMinta admin lain untuk mengubah role Anda.";
    }
    
    const oldRole = targetUser.role;
    const roleNames = { siswa: 'Siswa', guru: 'Guru', admin: 'Admin' };
    
    try {
        // Update role di Firebase
        await db.ref(`users_auth/${targetUser.uid}/role`).set(data.newRole);
        
        // Update cache
        targetUser.role = data.newRole;
        const index = systemDataCache.usersAuth.findIndex(u => u.uid === targetUser.uid);
        if (index !== -1) {
            systemDataCache.usersAuth[index].role = data.newRole;
        }
        
        // Log aktivitas
        if (typeof logActivity === 'function') {
            logActivity('change_user_role', `Mengubah role ${targetUser.nama} (${targetUser.email}) dari ${oldRole} menjadi ${data.newRole} via AI Assistant`);
        }
        
        return `✅ **BERHASIL!**\n\nRole **${targetUser.nama}** (${targetUser.email}) berhasil diubah dari **${roleNames[oldRole] || oldRole}** menjadi **${roleNames[data.newRole]}**.\n\nPerubahan akan langsung berlaku.`;
        
    } catch (error) {
        console.error("Change role error:", error);
        return `❌ **Gagal mengubah role!**\n\nError: ${error.message}\n\nSilakan coba lagi atau lakukan melalui halaman Manajemen User.`;
    }
}

// ======================= MANAJEMEN PENGATURAN =======================

async function changeSchoolName(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ubah nama sekolah hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_name) {
        return "📝 **Format Ubah Nama Sekolah:**\n\n`ubah nama sekolah menjadi [Nama Sekolah Baru]`\n\n**Contoh:** `ubah nama sekolah menjadi SMK Taruna`";
    }
    
    if (!data.newName) {
        return "❌ Nama sekolah baru tidak boleh kosong!";
    }
    
    const oldName = systemDataCache.settings.schoolName || 'Sistem Absensi';
    
    try {
        await db.ref('system_config/schoolName').set(data.newName);
        
        const schoolNameElement = document.getElementById('schoolNameDisplay');
        if (schoolNameElement) {
            schoolNameElement.textContent = data.newName;
            if (typeof restartSchoolNameAnimation === 'function') {
                restartSchoolNameAnimation();
            }
        }
        
        const inputField = document.getElementById('inputSchoolName');
        if (inputField) inputField.value = data.newName;
        
        systemDataCache.settings.schoolName = data.newName;
        
        if (typeof logActivity === 'function') {
            logActivity('change_school_name', `Mengubah nama sekolah dari "${oldName}" menjadi "${data.newName}" via AI Assistant`);
        }
        
        return `✅ **BERHASIL!**\n\nNama sekolah berhasil diubah dari **${oldName}** menjadi **${data.newName}** secara permanen.`;
        
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function updateGlobalDelay(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ini hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_value) {
        return "📝 **Format Ubah Delay Global:**\n\n`ubah delay global menjadi [nilai] menit`\n\n**Contoh:** `ubah delay global menjadi 90 menit` atau `ubah delay global menjadi 2 jam`";
    }
    
    if (!data.delay || data.delay <= 0) {
        return "❌ Delay harus lebih dari 0 menit!";
    }
    
    const oldDelay = systemDataCache.settings.delayOut || 60;
    const delayText = data.delay >= 60 ? `${Math.floor(data.delay / 60)} jam ${data.delay % 60 > 0 ? data.delay % 60 + ' menit' : ''}` : `${data.delay} menit`;
    
    try {
        await db.ref('settings/delayOut').set(data.delay);
        
        const displaySpan = document.getElementById('globalDelayDisplay');
        if (displaySpan) displaySpan.textContent = delayText;
        
        systemDataCache.settings.delayOut = data.delay;
        
        if (typeof logActivity === 'function') {
            logActivity('update_global_delay', `Mengubah delay global dari ${oldDelay} menjadi ${data.delay} menit via AI Assistant`);
        }
        
        return `✅ **BERHASIL!**\n\nDelay pulang global berhasil diubah menjadi **${delayText}**.`;
        
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function addClassAction(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ini hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_name) {
        return "📝 **Format Tambah Kelas:**\n\n`tambah kelas [Nama Kelas]`\n\n**Contoh:** `tambah kelas X A` atau `tambah kelas XII RPL`";
    }
    
    if (!data.className) {
        return "❌ Nama kelas tidak boleh kosong!";
    }
    
    let currentClasses = [];
    try {
        const snapshot = await db.ref('school_config/classes').once('value');
        currentClasses = snapshot.val() || [];
    } catch(e) {
        currentClasses = systemDataCache.schoolConfig.classes || [];
    }
    
    if (currentClasses.includes(data.className)) {
        return `⚠️ **Kelas ${data.className} sudah ada!**\n\nDaftar kelas saat ini: ${currentClasses.join(', ')}`;
    }
    
    currentClasses.push(data.className);
    currentClasses.sort();
    
    try {
        await db.ref('school_config/classes').set(currentClasses);
        
        systemDataCache.schoolConfig.classes = currentClasses;
        if (window.currentSchoolConfig) {
            window.currentSchoolConfig.classes = currentClasses;
        }
        
        if (typeof logActivity === 'function') {
            logActivity('add_class', `Menambah kelas ${data.className} via AI Assistant`);
        }
        
        setTimeout(() => {
            if (typeof populateKelasOptions === 'function') populateKelasOptions();
            if (typeof populateStudentFilters === 'function') populateStudentFilters();
            if (typeof populateFilters === 'function') populateFilters();
            if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
            if (typeof renderClassesList === 'function') renderClassesList();
        }, 500);
        
        return `✅ **BERHASIL!**\n\nKelas **${data.className}** berhasil ditambahkan ke database.\n\n📚 **Daftar kelas saat ini:** ${currentClasses.join(', ')}`;
        
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function removeClassAction(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ini hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_name) {
        return "📝 **Format Hapus Kelas:**\n\n`hapus kelas [Nama Kelas]`\n\n**Contoh:** `hapus kelas IX`";
    }
    
    if (!data.className) {
        return "❌ Nama kelas tidak boleh kosong!";
    }
    
    let currentClasses = [];
    try {
        const snapshot = await db.ref('school_config/classes').once('value');
        currentClasses = snapshot.val() || [];
    } catch(e) {
        currentClasses = systemDataCache.schoolConfig.classes || [];
    }
    
    if (!currentClasses.includes(data.className)) {
        return `⚠️ **Kelas ${data.className} tidak ditemukan!**\n\nDaftar kelas saat ini: ${currentClasses.join(', ')}`;
    }
    
    const index = currentClasses.indexOf(data.className);
    currentClasses.splice(index, 1);
    
    try {
        await db.ref('school_config/classes').set(currentClasses);
        
        systemDataCache.schoolConfig.classes = currentClasses;
        if (window.currentSchoolConfig) {
            window.currentSchoolConfig.classes = currentClasses;
        }
        
        if (typeof logActivity === 'function') {
            logActivity('remove_class', `Menghapus kelas ${data.className} via AI Assistant`);
        }
        
        setTimeout(() => {
            if (typeof populateKelasOptions === 'function') populateKelasOptions();
            if (typeof renderClassesList === 'function') renderClassesList();
        }, 500);
        
        return `✅ **BERHASIL!**\n\nKelas **${data.className}** berhasil dihapus.\n\n📚 **Daftar kelas saat ini:** ${currentClasses.join(', ')}`;
        
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function addMajorAction(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ini hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_name) {
        return "📝 **Format Tambah Jurusan:**\n\n`tambah jurusan [Nama Jurusan]`\n\n**Contoh:** `tambah jurusan RPL`";
    }
    
    if (!data.majorName) {
        return "❌ Nama jurusan tidak boleh kosong!";
    }
    
    let currentMajors = [];
    try {
        const snapshot = await db.ref('school_config/majors').once('value');
        currentMajors = snapshot.val() || [];
    } catch(e) {
        currentMajors = systemDataCache.schoolConfig.majors || [];
    }
    
    if (currentMajors.includes(data.majorName)) {
        return `⚠️ **Jurusan ${data.majorName} sudah ada!**\n\nDaftar jurusan saat ini: ${currentMajors.join(', ')}`;
    }
    
    currentMajors.push(data.majorName);
    currentMajors.sort();
    
    try {
        await db.ref('school_config/majors').set(currentMajors);
        
        systemDataCache.schoolConfig.majors = currentMajors;
        if (window.currentSchoolConfig) {
            window.currentSchoolConfig.majors = currentMajors;
        }
        
        if (typeof logActivity === 'function') {
            logActivity('add_major', `Menambah jurusan ${data.majorName} via AI Assistant`);
        }
        
        setTimeout(() => {
            if (typeof populateJurusanOptions === 'function') populateJurusanOptions();
            if (typeof renderMajorsList === 'function') renderMajorsList();
        }, 500);
        
        return `✅ **BERHASIL!**\n\nJurusan **${data.majorName}** berhasil ditambahkan.\n\n🎓 **Daftar jurusan saat ini:** ${currentMajors.join(', ')}`;
        
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function removeMajorAction(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ini hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_name) {
        return "📝 **Format Hapus Jurusan:**\n\n`hapus jurusan [Nama Jurusan]`\n\n**Contoh:** `hapus jurusan TKJ`";
    }
    
    if (!data.majorName) {
        return "❌ Nama jurusan tidak boleh kosong!";
    }
    
    let currentMajors = [];
    try {
        const snapshot = await db.ref('school_config/majors').once('value');
        currentMajors = snapshot.val() || [];
    } catch(e) {
        currentMajors = systemDataCache.schoolConfig.majors || [];
    }
    
    if (!currentMajors.includes(data.majorName)) {
        return `⚠️ **Jurusan ${data.majorName} tidak ditemukan!**\n\nDaftar jurusan saat ini: ${currentMajors.join(', ')}`;
    }
    
    const index = currentMajors.indexOf(data.majorName);
    currentMajors.splice(index, 1);
    
    try {
        await db.ref('school_config/majors').set(currentMajors);
        
        systemDataCache.schoolConfig.majors = currentMajors;
        if (window.currentSchoolConfig) {
            window.currentSchoolConfig.majors = currentMajors;
        }
        
        if (typeof logActivity === 'function') {
            logActivity('remove_major', `Menghapus jurusan ${data.majorName} via AI Assistant`);
        }
        
        setTimeout(() => {
            if (typeof populateJurusanOptions === 'function') populateJurusanOptions();
            if (typeof renderMajorsList === 'function') renderMajorsList();
        }, 500);
        
        return `✅ **BERHASIL!**\n\nJurusan **${data.majorName}** berhasil dihapus.\n\n🎓 **Daftar jurusan saat ini:** ${currentMajors.join(', ')}`;
        
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function changeSchoolTypeAction(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ini hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_type) {
        return "📝 **Format Ubah Tipe Sekolah:**\n\n`ubah tipe sekolah menjadi [smp/smk/both]`\n\n**Contoh:** `ubah tipe sekolah menjadi smk`";
    }
    
    const validTypes = ['smp', 'smk', 'both'];
    if (!validTypes.includes(data.schoolType)) {
        return `❌ Tipe sekolah tidak valid! Pilih salah satu: smp, smk, both.`;
    }
    
    const oldType = systemDataCache.schoolConfig.type || 'smp';
    
    let newClasses;
    if (data.schoolType === 'both') {
        newClasses = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    } else if (data.schoolType === 'smp') {
        newClasses = ['VII', 'VIII', 'IX'];
    } else {
        newClasses = ['X', 'XI', 'XII'];
    }
    
    try {
        await db.ref('school_config').update({
            type: data.schoolType,
            classes: newClasses
        });
        
        systemDataCache.schoolConfig.type = data.schoolType;
        systemDataCache.schoolConfig.classes = newClasses;
        
        if (typeof logActivity === 'function') {
            logActivity('change_school_type', `Mengubah tipe sekolah dari ${oldType} menjadi ${data.schoolType} via AI Assistant`);
        }
        
        return `✅ **BERHASIL!**\n\nTipe sekolah berhasil diubah dari **${oldType.toUpperCase()}** menjadi **${data.schoolType.toUpperCase()}**.\n\n📚 Kelas disesuaikan menjadi: ${newClasses.join(', ')}.`;
        
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function updateLateThreshold(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ini hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_time) {
        return "📝 **Format Ubah Batas Terlambat:**\n\n`ubah batas terlambat menjadi [HH:MM]`\n\n**Contoh:** `ubah batas terlambat menjadi 07:15`";
    }
    
    if (!data.time || !data.time.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)) {
        return "❌ Format waktu tidak valid! Gunakan format HH:MM (contoh: 07:30)";
    }
    
    const oldThreshold = systemDataCache.settings.lateThreshold || '07:30';
    
    try {
        await db.ref('school_config/attendance_settings/lateThreshold').set(data.time);
        
        systemDataCache.settings.lateThreshold = data.time;
        
        if (typeof logActivity === 'function') {
            logActivity('update_late_threshold', `Mengubah batas terlambat dari ${oldThreshold} menjadi ${data.time} via AI Assistant`);
        }
        
        return `✅ **BERHASIL!**\n\nBatas waktu terlambat berhasil diubah dari **${oldThreshold}** menjadi **${data.time}**.\n\nSiswa yang scan setelah jam ${data.time} akan dianggap TERLAMBAT.`;
        
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function resetUserPasswordAction(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ini hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    const email = data.email;
    if (!email || !email.includes('@')) {
        return "❌ Email tidak valid! Contoh: `reset password budi@sekolah.sch.id`";
    }
    
    try {
        await auth.sendPasswordResetEmail(email);
        
        if (typeof logActivity === 'function') {
            logActivity('reset_user_password', `Mengirim link reset password ke ${email} via AI Assistant`);
        }
        
        return `✅ **BERHASIL!**\n\nLink reset password telah dikirim ke **${email}**.`;
        
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            return `❌ **Email ${email} tidak terdaftar!**`;
        }
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function deleteUserAction(data) {
    if (!canDeleteUser()) {
        return "⛔ **Akses Ditolak!**\n\nFitur hapus user hanya untuk **Admin dan Developer**.";
    }
    
    const users = systemDataCache.usersAuth || [];
    let targetUser = users.find(u => 
        u.nama && u.nama.toLowerCase().includes(data.userName.toLowerCase())
    );
    
    if (!targetUser) {
        return `❌ **User "${data.userName}" tidak ditemukan!**`;
    }
    
    if (targetUser.role === 'developer') {
        return "⛔ **Akun Developer tidak dapat dihapus!**";
    }
    
    if (currentUser.uid === targetUser.uid) {
        return "❌ **Anda tidak dapat menghapus akun sendiri!**";
    }
    
    return `⚠️ **Konfirmasi Hapus User**\n\nAnda akan menghapus:\n• Nama: **${targetUser.nama}**\n• Email: ${targetUser.email}\n• Role: ${targetUser.role.toUpperCase()}\n\n**Ketik "YA HAPUS ${targetUser.nama}"** untuk konfirmasi.\n_(Ketik "batal" untuk membatalkan)_`;
}

async function createAnnouncementAction(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur ini hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (!data.title) {
        return "📝 **Format Buat Pengumuman:**\n\n`buat pengumuman [Judul] dengan isi [Isi Pengumuman]`\n\n**Contoh:** `buat pengumuman Libur dengan isi Besok libur nasional`";
    }
    
    const announcementData = {
        title: data.title,
        message: data.message || 'Tidak ada isi',
        priority: 'normal',
        createdBy: currentUser.nama || currentUser.email,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        isActive: true
    };
    
    try {
        await db.ref('announcements/active').push(announcementData);
        
        if (typeof logActivity === 'function') {
            logActivity('create_announcement', `Membuat pengumuman "${data.title}" via AI Assistant`);
        }
        
        return `✅ **BERHASIL!**\n\nPengumuman **"${data.title}"** berhasil dibuat.\n\n📢 **Isi:** ${data.message}`;
        
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

// ======================= CRUD SISWA VIA AI =======================

async function addStudentViaAI(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**\n\nFitur tambah siswa hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_data) {
        return "📝 **Format Tambah Siswa:**\n\n`tambah siswa nama [Nama] id [ID] kelas [Kelas] jurusan [Jurusan] delay [menit]`\n\n**Contoh:** `tambah siswa nama Budi id 5 kelas X jurusan RPL delay 60`";
    }
    
    const existing = systemDataCache.students.find(s => s.id == data.id);
    if (existing) {
        return `⚠️ **Gagal!** Siswa dengan ID **${data.id}** sudah ada (${existing.nama}).`;
    }
    
    const studentData = {
        id: data.id,
        nama: data.nama,
        kelas: data.kelas,
        jurusan: data.jurusan || 'UMUM',
        delayOut: data.delay || 60,
        createdAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    try {
        await db.ref(`users/${data.id}`).set(studentData);
        if (typeof logActivity === 'function') {
            logActivity('add_student', `Menambah siswa: ${data.nama} (ID: ${data.id}) via AI`);
        }
        await updateSystemDataCache();
        return `✅ **BERHASIL!** Siswa **${data.nama}** (ID: ${data.id}) berhasil ditambahkan.`;
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function updateStudentViaAI(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**";
    }
    
    if (data.need_data) {
        return "📝 **Format Update:** `update siswa id [ID] delay [menit]`\n\nContoh: `update siswa id 5 delay 90`";
    }
    
    const student = systemDataCache.students.find(s => s.id == data.id);
    if (!student) {
        return `❌ **Siswa dengan ID ${data.id} tidak ditemukan.**`;
    }
    
    if (!data.value) {
        return `📋 **Data ${student.nama}** (ID: ${student.id})\n• Kelas: ${student.kelas}\n• Delay: ${student.delayOut || 60} menit\n\nApa yang ingin diubah? Contoh: "update siswa id ${data.id} delay 90"`;
    }
    
    try {
        await db.ref(`users/${data.id}`).update({ delayOut: parseInt(data.value) });
        await updateSystemDataCache();
        return `✅ **BERHASIL!** Delay pulang ${student.nama} diubah menjadi ${data.value} menit.`;
    } catch (error) {
        return `❌ **Gagal!** ${error.message}`;
    }
}

async function deleteStudentViaAI(data) {
    if (!hasAdminAccess()) {
        return "⛔ **Akses Ditolak!**";
    }
    
    if (data.need_id) {
        return "📝 **Format Hapus:** `hapus siswa id [ID]`\n\nContoh: `hapus siswa id 5`\n\n⚠️ **Peringatan:** Tindakan ini tidak dapat dibatalkan!";
    }
    
    const student = systemDataCache.students.find(s => s.id == data.id);
    if (!student) {
        return `❌ **Siswa dengan ID ${data.id} tidak ditemukan.**`;
    }
    
    const hasAccount = systemDataCache.usersAuth.some(u => u.fpId == student.id);
    const warning = hasAccount ? `\n\n⚠️ Siswa ini memiliki akun yang juga akan dihapus.` : '';
    
    return `⚠️ **Konfirmasi Hapus**\n\nAnda akan menghapus: **${student.nama}** (ID: ${student.id})${warning}\n\n**Ketik "YA HAPUS ${student.id}"** untuk konfirmasi.\n_(Ketik "batal" untuk membatalkan)_`;
}

// ======================= QUERY FUNCTIONS =======================

async function queryStudentProfessional(name) {
    await updateSystemDataCache();
    const students = systemDataCache.students.filter(s => 
        s.nama && s.nama.toLowerCase().includes(String(name).toLowerCase())
    );
    
    if (students.length === 0) {
        return `📭 **Siswa "${escapeHtml(name)}" tidak ditemukan.**\n\n💡 Coba gunakan ID: "id 123 siapa?"`;
    }
    
    if (students.length === 1) {
        const s = students[0];
        const hasAccount = systemDataCache.usersAuth.some(u => u.fpId == s.id);
        return `## 👤 **DETAIL SISWA**\n\n` +
               `**📌 Nama:** ${escapeHtml(s.nama)}\n` +
               `**🆔 ID:** ${s.id}\n` +
               `**📚 Kelas:** ${s.kelas || '-'}\n` +
               `**🎓 Jurusan:** ${s.jurusan || '-'}\n` +
               `**⏰ Delay Pulang:** ${s.delayOut || 60} menit\n` +
               `**🔐 Akun:** ${hasAccount ? '✅ Sudah memiliki akun' : '⏳ Belum memiliki akun'}\n\n` +
               `💡 **Perintah:** "rekap ${s.nama}" - lihat detail absensi`;
    }
    
    let result = `🔍 **${students.length} Siswa Ditemukan:**\n\n`;
    students.slice(0, 10).forEach((s, idx) => {
        result += `${idx+1}. **${escapeHtml(s.nama)}** (ID: ${s.id}) - Kelas ${s.kelas || '-'}\n`;
    });
    return result;
}

async function queryStudentByIdProfessional(id) {
    await updateSystemDataCache();
    const student = systemDataCache.students.find(s => s.id == id);
    if (!student) {
        return `📭 **Siswa dengan ID ${id} tidak ditemukan.**`;
    }
    const hasAccount = systemDataCache.usersAuth.some(u => u.fpId == student.id);
    return `## 👤 **DETAIL SISWA**\n\n` +
           `**📌 Nama:** ${escapeHtml(student.nama)}\n` +
           `**🆔 ID:** ${student.id}\n` +
           `**📚 Kelas:** ${student.kelas || '-'}\n` +
           `**🎓 Jurusan:** ${student.jurusan || '-'}\n` +
           `**⏰ Delay Pulang:** ${student.delayOut || 60} menit\n` +
           `**🔐 Akun:** ${hasAccount ? '✅ Sudah memiliki akun' : '⏳ Belum memiliki akun'}`;
}

async function getStudentsByClassProfessional(kelas) {
    await updateSystemDataCache();
    const students = systemDataCache.students.filter(s => s.kelas === kelas);
    
    if (students.length === 0) {
        return `📭 **Tidak ada siswa di kelas ${kelas}.**`;
    }
    
    let result = `## 📚 **SISWA KELAS ${kelas}**\n\n`;
    students.forEach((s, idx) => {
        result += `${idx+1}. ${escapeHtml(s.nama)} (ID: ${s.id})\n`;
    });
    return result;
}

async function getStudentRekapProfessional(name) {
    await updateSystemDataCache();
    
    const student = systemDataCache.students.find(s => 
        s.nama && s.nama.toLowerCase().includes(String(name).toLowerCase())
    );
    
    if (!student) {
        return `📭 **Siswa "${escapeHtml(name)}" tidak ditemukan.**`;
    }
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
    let schoolDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(thisYear, thisMonth, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) schoolDays++;
    }
    
    const attendanceRecords = systemDataCache.attendance.filter(a => 
        a.studentId == student.id && 
        a.date && new Date(a.date).getMonth() === thisMonth
    );
    
    const hadir = attendanceRecords.filter(r => r.status === 'Hadir' || r.status === 'Pulang').length;
    const persentase = schoolDays > 0 ? ((hadir / schoolDays) * 100).toFixed(1) : 0;
    
    let grade = '';
    if (persentase >= 90) grade = '🏆 Sangat Baik';
    else if (persentase >= 75) grade = '👍 Baik';
    else if (persentase >= 60) grade = '📊 Cukup';
    else grade = '⚠️ Perlu Perhatian';
    
    return `## 📊 **REKAP ABSENSI ${escapeHtml(student.nama)}**\n\n` +
           `📅 **Periode:** ${now.toLocaleString('id-ID', { month: 'long' })} ${thisYear}\n` +
           `✅ **Hadir:** ${hadir} dari ${schoolDays} hari (${persentase}%)\n` +
           `⭐ **Status:** ${grade}\n\n` +
           `💡 ${persentase >= 75 ? 'Pertahankan prestasi Anda!' : 'Tingkatkan kehadiran Anda!'}`;
}

async function getTopStudentsProfessional(limit = 5) {
    await updateSystemDataCache();
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
    let schoolDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(thisYear, thisMonth, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) schoolDays++;
    }
    
    const monthAttendance = systemDataCache.attendance.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });
    
    const studentStats = systemDataCache.students.map(student => {
        const records = monthAttendance.filter(a => a.studentId == student.id);
        const hadir = records.filter(r => r.status === 'Hadir' || r.status === 'Pulang').length;
        const persen = schoolDays > 0 ? (hadir / schoolDays * 100).toFixed(1) : 0;
        return { ...student, hadir, persen };
    });
    
    const topStudents = studentStats.sort((a, b) => b.hadir - a.hadir).slice(0, limit);
    
    let result = `## 🏆 **TOP ${limit} SISWA TERBAIK**\n*${now.toLocaleString('id-ID', { month: 'long' })} ${thisYear}*\n\n`;
    topStudents.forEach((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📌';
        result += `${medal} **${escapeHtml(s.nama)}** (${s.kelas || '-'}) - ${s.hadir}/${schoolDays} hari (${s.persen}%)\n`;
    });
    return result;
}

async function getGeneralStatsProfessional() {
    await updateSystemDataCache();
    
    const totalSiswa = systemDataCache.students.length;
    const totalAkun = systemDataCache.usersAuth.length || 0;
    const totalAbsensi = systemDataCache.attendance.length;
    
    const today = new Date().toISOString().split('T')[0];
    const todayAbsensi = systemDataCache.attendance.filter(a => a.date === today);
    const hadirToday = todayAbsensi.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    
    const delayGlobal = systemDataCache.settings.delayOut || 60;
    const lateThreshold = systemDataCache.settings.lateThreshold || '07:30';
    const schoolName = systemDataCache.settings.schoolName || 'Sistem Absensi';
    
    return `## 📊 **STATISTIK SISTEM**\n\n` +
           `**🏫 Nama Sekolah:** ${escapeHtml(schoolName)}\n\n` +
           `### 👥 **Data Siswa**\n` +
           `• Total siswa: **${totalSiswa}**\n` +
           `• Sudah berakun: ${totalAkun}\n` +
           `• Belum berakun: ${totalSiswa - totalAkun}\n\n` +
           `### 📋 **Absensi Hari Ini (${today})**\n` +
           `• ✅ Sudah masuk: **${hadirToday}** siswa\n` +
           `• 📊 Total transaksi: ${todayAbsensi.length}\n\n` +
           `### ⚙️ **Pengaturan**\n` +
           `• ⏰ Delay pulang global: ${delayGlobal} menit\n` +
           `• 🕒 Batas terlambat: ${lateThreshold}\n` +
           `• 📚 Jumlah kelas: ${systemDataCache.schoolConfig.classes?.length || 0}\n` +
           `• 🎓 Jumlah jurusan: ${systemDataCache.schoolConfig.majors?.length || 0}\n\n` +
           `💡 Total catatan absensi di database: **${totalAbsensi}** transaksi.`;
}

async function predictTrendProfessional() {
    await updateSystemDataCache();
    
    const now = new Date();
    const weeklyAttendance = [];
    
    for (let w = 0; w < 4; w++) {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - (w * 7 + 7));
        const weekEnd = new Date(now);
        weekEnd.setDate(now.getDate() - (w * 7 + 1));
        
        const weekData = systemDataCache.attendance.filter(a => {
            const date = new Date(a.date);
            return date >= weekStart && date <= weekEnd;
        });
        
        const hadir = weekData.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
        weeklyAttendance.unshift({ week: 4 - w, hadir });
    }
    
    let trend = 0;
    if (weeklyAttendance.length >= 2) {
        const lastWeek = weeklyAttendance[weeklyAttendance.length - 1]?.hadir || 0;
        const prevWeek = weeklyAttendance[weeklyAttendance.length - 2]?.hadir || 0;
        trend = lastWeek - prevWeek;
    }
    
    let prediction = "";
    let recommendation = "";
    if (trend > 10) {
        prediction = "📈 **Tren Meningkat Signifikan** - Kehadiran naik drastis!";
        recommendation = "👍 Pertahankan strategi yang berhasil. Berikan apresiasi pada siswa dan guru.";
    } else if (trend > 0) {
        prediction = "📊 **Tren Stabil Meningkat** - Kehadiran membaik.";
        recommendation = "📌 Terus pantau dan beri motivasi tambahan untuk hasil lebih baik.";
    } else if (trend < -10) {
        prediction = "📉 **Tren Menurun Kritis** - Perlu perhatian khusus segera!";
        recommendation = "🚨 Segera evaluasi: cek faktor musiman (hujan, ujian) atau masalah tertentu.";
    } else if (trend < 0) {
        prediction = "📉 **Tren Menurun** - Kehadiran berkurang.";
        recommendation = "🔍 Identifikasi penyebab dan lakukan intervensi ringan (pengingat, teguran).";
    } else {
        prediction = "📊 **Tren Stabil** - Kehadiran konsisten.";
        recommendation = "✅ Pertahankan kondisi yang baik saat ini.";
    }
    
    return `## 🔮 **PREDIKSI TREN KEHADIRAN**\n\n` +
           `### 📅 **4 Minggu Terakhir**\n` +
           `Minggu 4: ${weeklyAttendance[0]?.hadir || 0} kehadiran\n` +
           `Minggu 3: ${weeklyAttendance[1]?.hadir || 0} kehadiran\n` +
           `Minggu 2: ${weeklyAttendance[2]?.hadir || 0} kehadiran\n` +
           `Minggu 1: ${weeklyAttendance[3]?.hadir || 0} kehadiran\n\n` +
           `### ${prediction}\n\n` +
           `### 💡 **Rekomendasi**\n${recommendation}`;
}

async function compareAttendanceProfessional() {
    await updateSystemDataCache();
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonth = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastYear = thisMonth === 0 ? thisYear - 1 : thisYear;
    
    const thisMonthAttendance = systemDataCache.attendance.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });
    
    const lastMonthAttendance = systemDataCache.attendance.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === lastYear && d.getMonth() === lastMonth;
    });
    
    const thisMonthHadir = thisMonthAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    const lastMonthHadir = lastMonthAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    
    const diff = thisMonthHadir - lastMonthHadir;
    const diffPercent = lastMonthHadir > 0 ? ((diff / lastMonthHadir) * 100).toFixed(1) : 0;
    const trendIcon = diff > 0 ? '📈' : diff < 0 ? '📉' : '📊';
    const trendText = diff > 0 ? `meningkat ${diff} kehadiran (${diffPercent}%)` : diff < 0 ? `menurun ${Math.abs(diff)} kehadiran (${Math.abs(diffPercent)}%)` : 'stabil';
    
    return `## 📊 **PERBANDINGAN KEHADIRAN**\n\n` +
           `| Periode | Jumlah Kehadiran |\n` +
           `|---------|------------------|\n` +
           `| ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })} | **${thisMonthHadir}** |\n` +
           `| ${new Date(lastYear, lastMonth).toLocaleString('id-ID', { month: 'long', year: 'numeric' })} | ${lastMonthHadir} |\n` +
           `| **Perubahan** | ${trendIcon} **${trendText}** |`;
}

async function getProfessionalRecommendations() {
    await updateSystemDataCache();
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const monthAttendance = systemDataCache.attendance.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });
    
    const studentStats = systemDataCache.students.map(student => {
        const records = monthAttendance.filter(a => a.studentId == student.id);
        const hadir = records.filter(r => r.status === 'Hadir' || r.status === 'Pulang').length;
        return { ...student, hadir };
    });
    
    const worstStudents = studentStats.sort((a, b) => a.hadir - b.hadir).slice(0, 3);
    const worstNames = worstStudents.map(s => s.nama).join(', ');
    const bestStudents = studentStats.sort((a, b) => b.hadir - a.hadir).slice(0, 3);
    const bestNames = bestStudents.map(s => s.nama).join(', ');
    
    let result = `## 💡 **REKOMENDASI CERDAS**\n\n`;
    
    if (worstStudents.length > 0) {
        result += `### 🚨 **Prioritas Tinggi (Perlu Perhatian)**\n`;
        result += `Siswa dengan kehadiran terendah: **${worstNames}**\n`;
        result += `💡 **Saran:** Lakukan pendekatan personal, komunikasi dengan orang tua, dan cari tahu penyebab absen.\n\n`;
    }
    
    if (bestStudents.length > 0) {
        result += `### 🏆 **Apresiasi (Role Model)**\n`;
        result += `Siswa dengan kehadiran terbaik: **${bestNames}**\n`;
        result += `💡 **Saran:** Berikan penghargaan/pujian, jadikan mereka duta kehadiran.\n\n`;
    }
    
    const attendanceByDay = { Senin: 0, Selasa: 0, Rabu: 0, Kamis: 0, Jumat: 0 };
    systemDataCache.attendance.forEach(a => {
        const date = new Date(a.date);
        const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        const dayName = dayNames[date.getDay()];
        if (attendanceByDay[dayName] !== undefined) {
            attendanceByDay[dayName]++;
        }
    });
    
    const lowestDay = Object.entries(attendanceByDay)
        .sort((a, b) => a[1] - b[1])[0];
    
    if (lowestDay && lowestDay[1] > 0) {
        result += `### 📅 **Pola Kehadiran**\n`;
        result += `Hari **${lowestDay[0]}** memiliki kehadiran terendah.\n`;
        result += `💡 **Saran:** Evaluasi jadwal pelajaran di hari ${lowestDay[0]}, mungkin ada faktor tertentu.\n\n`;
    }
    
    result += `---\n📌 **Kesimpulan:** ${bestStudents.length > 0 ? `Pertahankan prestasi siswa-siswa terbaik.` : ''} ${worstStudents.length > 0 ? `Segera tindak lanjuti ${worstStudents.length} siswa dengan kehadiran rendah.` : 'Semua siswa menunjukkan kehadiran baik!'}`;
    
    return result;
}

// ======================= CALL GROQ API =======================

async function callGroqAPI(userMessage, contextData = null) {
    if (pendingDeleteConfirmation) {
        const confirmResult = await executeDeleteConfirmation(userMessage, pendingDeleteConfirmation);
        if (confirmResult) {
            pendingDeleteConfirmation = null;
            pendingAction = null;
            return confirmResult;
        }
    }
    
    if (pendingAction && pendingAction.type === 'delete_user') {
        const confirmPattern = new RegExp(`YA HAPUS ${pendingAction.userName}`, 'i');
        if (confirmPattern.test(userMessage)) {
            try {
                await db.ref(`users_auth/${pendingAction.userUid}`).remove();
                if (typeof logActivity === 'function') {
                    logActivity('delete_user', `Menghapus user ${pendingAction.userName} via AI Assistant`);
                }
                const userName = pendingAction.userName;
                pendingAction = null;
                return `✅ **BERHASIL DIHAPUS!**\n\nUser **${userName}** telah dihapus dari database.`;
            } catch (error) {
                pendingAction = null;
                return `❌ **Gagal Hapus!** ${error.message}`;
            }
        }
        if (String(userMessage).toLowerCase().includes('batal')) {
            pendingAction = null;
            return `✅ **Penghapusan dibatalkan.** Data user tetap aman.`;
        }
        return null;
    }
    
    const messageStr = String(userMessage || '');
    
    const systemPrompt = `Anda adalah Asisten AI Profesional untuk Sistem Absensi Sekolah.

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

=== GAYA BAHASA ===
- Bahasa Indonesia formal namun ramah
- Gunakan emoji secukupnya (✅, 📊, 👤, dll)
- Untuk data, gunakan bullet points`;

    const messages = [
        { role: "system", content: String(systemPrompt) },
        { role: "user", content: messageStr }
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: messages,
                temperature: AI_CONFIG.temperature,
                max_tokens: AI_CONFIG.maxTokens
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || 'Unknown error'}`);
        }

        const result = await response.json();
        const aiResponse = result.choices[0]?.message?.content || "Maaf, saya tidak dapat memproses permintaan Anda saat ini.";
        
        conversationHistory.push(
            { role: "user", content: messageStr },
            { role: "assistant", content: String(aiResponse) }
        );
        
        if (conversationHistory.length > AI_CONFIG.maxContextMessages * 2) {
            conversationHistory = conversationHistory.slice(-AI_CONFIG.maxContextMessages * 2);
        }
        
        lastActivityTimestamp = Date.now();
        return aiResponse;

    } catch (error) {
        clearTimeout(timeoutId);
        console.error("Groq API error:", error);
        
        if (error.name === 'AbortError') {
            return "⏰ **Request timeout**\n\nPermintaan terlalu lama. Silakan coba lagi dengan pertanyaan yang lebih spesifik.";
        }
        
        return generateFallbackProfessional(messageStr);
    }
}

function generateFallbackProfessional(message) {
    const lowerMsg = String(message).toLowerCase();
    
    if (lowerMsg.match(/halo|hai|hello|hy|hii?/)) return getProfessionalGreeting();
    if (lowerMsg.match(/terima kasih|makasih|thanks/)) return getProfessionalThanks();
    if (lowerMsg.match(/siapa kamu|kamu siapa/)) return getProfessionalIntroduction();
    if (lowerMsg.match(/bye|dadah|sampai jumpa/)) {
        return "👋 **Sampai jumpa!** Terima kasih telah menggunakan Sistem Absensi.";
    }
    
    return `🤔 **Maaf, saya belum bisa memproses perintah itu dengan baik.**

📋 **Perintah yang saya pahami:**
• 🔍 **Cari data** - "data siswa Budi", "id 5 siapa?"
• 📊 **Rekap** - "rekap absensi Ani", "statistik"
• ✏️ **Kelola** - "tambah siswa ...", "hapus siswa id 5"
• 🏆 **Peringkat** - "siswa terbaik", "top 10"
• ⚙️ **Pengaturan** - "ubah nama sekolah menjadi SMK Taruna"
• 👥 **User** (Admin/Dev) - "ubah role Budi menjadi admin"
• 📢 **Pengumuman** - "buat pengumuman Libur dengan isi ..."

💬 **Ketik "bantuan"** untuk panduan lengkap.`;
}

async function executeDeleteConfirmation(message, pendingDelete) {
    if (!pendingDelete) return null;
    
    const confirmPattern = new RegExp(`YA HAPUS ${pendingDelete.id}`, 'i');
    if (confirmPattern.test(message)) {
        try {
            const userAccount = systemDataCache.usersAuth.find(u => u.fpId == pendingDelete.id);
            if (userAccount) {
                await db.ref(`users_auth/${userAccount.uid}`).remove();
            }
            await db.ref(`users/${pendingDelete.id}`).remove();
            await updateSystemDataCache();
            if (typeof logActivity === 'function') {
                logActivity('delete_student', `Menghapus siswa: ${pendingDelete.nama} (ID: ${pendingDelete.id}) via AI Assistant`);
            }
            return `✅ **BERHASIL DIHAPUS!**\n\nSiswa **${pendingDelete.nama}** (ID: ${pendingDelete.id}) telah dihapus dari database.`;
        } catch (error) {
            return `❌ **Gagal Hapus!** ${error.message}`;
        }
    }
    
    if (String(message).toLowerCase().includes('batal')) {
        pendingDeleteConfirmation = null;
        return `✅ **Penghapusan dibatalkan.** Data siswa **${pendingDelete.nama}** tetap aman.`;
    }
    
    return null;
}

async function processAIMessage(message) {
    const messageStr = String(message || '');
    await updateSystemDataCache();
    
    const intent = parseProfessionalIntent(messageStr);
    console.log(`🤖 Intent: ${intent.intent} (confidence: ${intent.confidence})`);
    
    if (intent.confidence >= 0.8) {
        const result = await executeProfessionalIntent(intent);
        if (result) return result;
    }
    
    if (intent.intent === 'delete_student' && intent.id) {
        const student = systemDataCache.students.find(s => s.id == intent.id);
        if (student) {
            pendingDeleteConfirmation = { id: student.id, nama: student.nama };
            return await deleteStudentViaAI(intent);
        }
    }
    
    if (intent.intent === 'delete_user' && intent.userName && canDeleteUser()) {
        const users = systemDataCache.usersAuth || [];
        const targetUser = users.find(u => 
            u.nama && u.nama.toLowerCase().includes(intent.userName.toLowerCase())
        );
        if (targetUser && targetUser.role !== 'developer' && targetUser.uid !== currentUser?.uid) {
            pendingAction = { type: 'delete_user', userName: targetUser.nama, userUid: targetUser.uid };
            return `⚠️ **Konfirmasi Hapus User**\n\nAnda akan menghapus:\n• Nama: **${targetUser.nama}**\n• Email: ${targetUser.email}\n• Role: ${targetUser.role.toUpperCase()}\n\n**Ketik "YA HAPUS ${targetUser.nama}"** untuk konfirmasi.\n_(Ketik "batal" untuk membatalkan)_`;
        }
        return `❌ **User "${intent.userName}" tidak ditemukan atau tidak dapat dihapus.**`;
    }
    
    return await callGroqAPI(messageStr, currentAIContext);
}

// ======================= UI KOMPONEN =======================

function addAIAssistantButton() {
    if (document.getElementById('aiAssistantBtn')) return;
    
    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'aiAssistantBtn';
    floatingBtn.innerHTML = '🤖';
    floatingBtn.title = 'AI Assistant Super Powerfull';
    floatingBtn.onclick = () => openAIAssistantModal();
    floatingBtn.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #00bcd4, #2196f3);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 998;
        border: none;
        font-size: 28px;
        transition: all 0.2s;
    `;
    
    floatingBtn.addEventListener('mouseenter', () => {
        floatingBtn.style.transform = 'scale(1.1)';
        floatingBtn.style.boxShadow = '0 6px 20px rgba(0,188,212,0.4)';
    });
    floatingBtn.addEventListener('mouseleave', () => {
        floatingBtn.style.transform = 'scale(1)';
        floatingBtn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    });
    
    document.body.appendChild(floatingBtn);
}

function openAIAssistantModal() {
    if (aiAssistantModalOpen) return;
    
    let modal = document.getElementById('modal-ai-assistant');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-ai-assistant" class="modal-overlay">
                <div class="modal-box" style="max-width: 650px; width: 90%; height: 85vh; display: flex; flex-direction: column; padding: 0;">
                    <div class="modal-title" style="padding: 15px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                        <span>🤖 <strong>AI Assistant Super Powerfull</strong> <small style="font-size: 11px; color: #00bcd4;">Powered by Groq Llama 3.3 70B</small></span>
                        <span onclick="closeAIAssistantModal()" style="cursor: pointer; font-size: 24px;">✖</span>
                    </div>
                    <div id="aiChatMessages" style="flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px;">
                        <div class="ai-message ai-bot">
                            <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #00bcd4, #2196f3); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
                            <div class="ai-bubble" style="background: var(--bg-hover); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5;">
                                ${formatMarkdown(getProfessionalGreeting())}
                            </div>
                        </div>
                    </div>
                    <div style="padding: 15px; border-top: 1px solid var(--border); display: flex; gap: 10px;">
                        <input type="text" id="aiChatInput" placeholder="Tanyakan sesuatu... misal: 'tambah kelas X A' atau 'ubah nama sekolah menjadi SMK Taruna'" 
                               style="flex: 1; padding: 12px; border-radius: 30px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary);">
                        <button id="aiSendBtn" style="padding: 12px 20px; border-radius: 30px; background: linear-gradient(135deg, #00bcd4, #2196f3); border: none; color: white; cursor: pointer;">📤 Kirim</button>
                    </div>
                </div>
            </div>
        `);
        modal = document.getElementById('modal-ai-assistant');
    }
    
    modal.classList.add('open');
    aiAssistantModalOpen = true;
    
    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiSendBtn');
    const messagesContainer = document.getElementById('aiChatMessages');
    
    const sendMessage = async () => {
        const message = input.value.trim();
        if (!message) return;
        
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'ai-message ai-user';
        userMsgDiv.innerHTML = `
            <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 20px;">👤</div>
            <div class="ai-bubble" style="background: var(--primary); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5;">${escapeHtml(message)}</div>
        `;
        messagesContainer.appendChild(userMsgDiv);
        
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'aiTypingIndicator';
        loadingDiv.className = 'ai-message ai-bot';
        loadingDiv.innerHTML = `
            <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #00bcd4, #2196f3); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
            <div class="ai-bubble" style="background: var(--bg-hover); padding: 12px 18px; border-radius: 18px;">
                <span class="typing-dot">●</span><span class="typing-dot">●</span><span class="typing-dot">●</span>
            </div>
        `;
        messagesContainer.appendChild(loadingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        
        try {
            const response = await processAIMessage(message);
            document.getElementById('aiTypingIndicator')?.remove();
            
            const botMsgDiv = document.createElement('div');
            botMsgDiv.className = 'ai-message ai-bot';
            botMsgDiv.innerHTML = `
                <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #00bcd4, #2196f3); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
                <div class="ai-bubble" style="background: var(--bg-hover); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5;">${formatMarkdown(response)}</div>
            `;
            messagesContainer.appendChild(botMsgDiv);
        } catch (error) {
            document.getElementById('aiTypingIndicator')?.remove();
            const errorDiv = document.createElement('div');
            errorDiv.className = 'ai-message ai-bot';
            errorDiv.innerHTML = `
                <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #00bcd4, #2196f3); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
                <div class="ai-bubble" style="background: rgba(244, 67, 54, 0.2); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5; color: #f44336;">
                    ❌ Maaf, terjadi kesalahan. Silakan coba lagi nanti.
                </div>
            `;
            messagesContainer.appendChild(errorDiv);
        } finally {
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    };
    
    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => {
        if (e.key === 'Enter') sendMessage();
    };
    
    input.focus();
}

function closeAIAssistantModal() {
    const modal = document.getElementById('modal-ai-assistant');
    if (modal) {
        modal.classList.remove('open');
        aiAssistantModalOpen = false;
    }
}

// ======================= INISIALISASI =======================

function initAIAssistant() {
    if (aiAssistantInitialized) return;
    
    if (!currentUser || !hasAdminAccess()) {
        console.log("🔒 AI Assistant: Akses ditolak untuk role:", currentUser?.role);
        return;
    }
    
    aiAssistantInitialized = true;
    console.log("🤖 AI Assistant v5.1 initialized - Super Powerfull with REAL ACTIONS!");
    
    addAIAssistantButton();
    setInterval(() => updateSystemDataCache(), 30000);
    setInterval(() => {
        if (aiAssistantModalOpen) updateSystemDataCache();
    }, 15000);
}

window.addEventListener('uiReady', (e) => {
    if (e.detail?.currentUser) setTimeout(() => initAIAssistant(), 500);
});

window.addEventListener('dataReady', () => {
    if (currentUser && hasAdminAccess() && !aiAssistantInitialized) initAIAssistant();
});

window.initAIAssistant = initAIAssistant;
window.openAIAssistantModal = openAIAssistantModal;
window.closeAIAssistantModal = closeAIAssistantModal;

console.log("✅ ai-assistant.js V5.1 loaded - SUPER POWERFULL AI with REAL DATABASE ACTIONS!");