// ai-assistant.js - VERSION 3.0 (ULTRA PROFESSIONAL AI ASSISTANT)
// Asisten AI SUPER PROFESIONAL dengan Groq API (Llama 3.3 70B)
// Fitur LENGKAP:
// - CRUD siswa lengkap (tambah, edit, hapus via chat)
// - Analisis data absensi mendalam
// - Jawab pertanyaan apapun tentang web absensi
// - Memory konteks jangka panjang (30 menit)
// - Multi-intent parsing canggih
// - Rekomendasi profesional berbasis data
// - Fallback cerdas dengan pengetahuan umum
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
    lastUpdate: 0
};

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
        lastUpdate: now
    };
    console.log(`🤖 AI Cache: ${systemDataCache.students.length} siswa, ${systemDataCache.attendance.length} absensi`);
    return systemDataCache;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function formatMarkdown(text) {
    if (!text) return '';
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

function getMemoryKey() {
    return currentUser?.uid || 'anonymous';
}

function saveToMemory(key, value) {
    const userKey = getMemoryKey();
    if (!longTermMemory[userKey]) longTermMemory[userKey] = {};
    longTermMemory[userKey][key] = { value, timestamp: Date.now() };
}

function getFromMemory(key) {
    const userKey = getMemoryKey();
    const mem = longTermMemory[userKey]?.[key];
    if (mem && Date.now() - mem.timestamp < 3600000) return mem.value;
    return null;
}

// ======================= INTENT PARSING SUPER CERDAS =======================

function parseProfessionalIntent(command) {
    const lowerCommand = command.toLowerCase();
    
    // 1. SAPAAN & BASABASI
    if (lowerCommand.match(/^(hai|halo|hello|hey|selamat|pagi|siang|malam|apa kabar|how are you|hy|hii?|assalamualaikum|wr?\.?wb?\.?)/i)) {
        return { intent: 'greeting', confidence: 0.99 };
    }
    
    // 2. TERIMA KASIH
    if (lowerCommand.match(/terima kasih|makasih|thanks|thank you|thx|tq/i)) {
        return { intent: 'thanks', confidence: 0.99 };
    }
    
    // 3. PERKENALAN
    if (lowerCommand.match(/siapa kamu|kamu siapa|perkenalan|tell me about yourself|fitur apa|bisa apa aja|keahlian/i)) {
        return { intent: 'introduction', confidence: 0.98 };
    }
    
    // 4. BANTUAN
    if (lowerCommand.match(/bantuan|help|tolong|perintah|fitur|bisa apa|command|guide|panduan|list perintah|daftar perintah/i)) {
        return { intent: 'help', confidence: 0.99 };
    }
    
    // 5. TAMBAH SISWA BARU (CRUD)
    const addMatch = command.match(/(?:tambah|buat|input|simpan|add)\s+(?:siswa|data siswa|student)\s+(?:nama|name)?\s*["']?([A-Za-z\s]+)["']?\s*(?:id|ID)?\s*(\d+)\s*(?:kelas|class)?\s*["']?([A-Z0-9\s]+)["']?\s*(?:jurusan|major)?\s*["']?([A-Za-z0-9\s]+)["']?\s*(?:delay)?\s*(\d+)?/i);
    const addSimpleMatch = command.match(/tambah\s+(\w+)\s+id\s+(\d+)\s+kelas\s+(\w+)/i);
    
    if (lowerCommand.match(/tambah|buat|input|simpan|add/) && lowerCommand.match(/siswa|student/)) {
        if (addMatch) {
            const nama = (addMatch[1] || '').trim();
            const id = addMatch[2];
            const kelas = (addMatch[3] || '').trim().toUpperCase();
            const jurusan = (addMatch[4] || '').trim().toUpperCase() || 'UMUM';
            const delay = addMatch[5] ? parseInt(addMatch[5]) : 60;
            if (nama && id && kelas) {
                return { intent: 'add_student', nama, id: parseInt(id), kelas, jurusan, delay, confidence: 0.95 };
            }
        }
        if (addSimpleMatch) {
            return { intent: 'add_student', nama: addSimpleMatch[1], id: parseInt(addSimpleMatch[2]), kelas: addSimpleMatch[3].toUpperCase(), jurusan: 'UMUM', delay: 60, confidence: 0.9 };
        }
        return { intent: 'add_student', need_data: true };
    }
    
    // 6. UPDATE/EDIT SISWA
    const updateMatch = command.match(/(?:update|edit|ubah|ganti)\s+(?:siswa|data siswa)\s+(?:id|ID)?\s*(\d+)\s*(?:delay)?\s*(\d+)?/i);
    const updateNameMatch = command.match(/(?:update|edit|ubah)\s+siswa\s+["']?([A-Za-z\s]+)["']?\s+(?:kelas|jurusan|delay)\s+(.+)/i);
    
    if (lowerCommand.match(/update|edit|ubah|ganti/) && lowerCommand.match(/siswa/)) {
        if (updateMatch) {
            return { intent: 'update_student', id: parseInt(updateMatch[1]), delay: updateMatch[2] ? parseInt(updateMatch[2]) : null, confidence: 0.93 };
        }
        if (updateNameMatch) {
            return { intent: 'update_student_by_name', name: updateNameMatch[1].trim(), field: updateNameMatch[2], confidence: 0.85 };
        }
        return { intent: 'update_student', need_data: true };
    }
    
    // 7. HAPUS SISWA
    const deleteMatch = command.match(/(?:hapus|delete|remove|padam)\s+(?:siswa|data siswa)\s+(?:id|ID)?\s*(\d+)/i);
    const deleteNameMatch = command.match(/(?:hapus|delete|remove)\s+siswa\s+["']?([A-Za-z\s]+)["']?/i);
    
    if (lowerCommand.match(/hapus|delete|remove|padam/) && lowerCommand.match(/siswa/)) {
        if (deleteMatch) {
            return { intent: 'delete_student', id: parseInt(deleteMatch[1]), confidence: 0.98 };
        }
        if (deleteNameMatch && deleteNameMatch[1]) {
            return { intent: 'delete_student_by_name', name: deleteNameMatch[1].trim(), confidence: 0.92 };
        }
        return { intent: 'delete_student', need_id: true };
    }
    
    // 8. CARI DATA SISWA
    const nameMatch = command.match(/(?:data|info|detail|cari|lihat|tampilkan|show)\s+(?:siswa|student)?\s*["']?([A-Za-z\s]+)["']?(?:\s|$)/i);
    const idMatch = command.match(/(?:id|ID|fingerprint|fp)\s*[:#]?\s*(\d+)/i);
    
    if (nameMatch && nameMatch[1] && nameMatch[1].length > 2 && !lowerCommand.match(/kelas|jurusan|rekap/)) {
        return { intent: 'query_student', name: nameMatch[1].trim(), confidence: 0.96 };
    }
    if (idMatch) {
        return { intent: 'query_student_by_id', id: idMatch[1], confidence: 0.98 };
    }
    
    // 9. SISWA PER KELAS
    const kelasMatch = command.match(/(?:siswa|student|data)\s+(?:kelas|class)\s+["']?([A-Z0-9\s]+)["']?/i);
    if (kelasMatch) {
        let kelas = kelasMatch[1].trim().toUpperCase();
        const jurusanMatch = command.match(/jurusan\s+["']?([A-Za-z0-9\s]+)["']?/i);
        return { intent: 'students_by_class', kelas, jurusan: jurusanMatch ? jurusanMatch[1].trim().toUpperCase() : null, confidence: 0.94 };
    }
    
    // 10. REKAP ABSENSI SISWA
    const rekapMatch = command.match(/(?:rekap|absensi|kehadiran|lihat absen|riwayat)\s+(?:siswa)?\s*["']?([A-Za-z\s]+)["']?/i);
    if (lowerCommand.match(/rekap|absensi|kehadiran|riwayat|lihat absen/i)) {
        if (rekapMatch && rekapMatch[1] && rekapMatch[1].length > 2 && !lowerCommand.match(/^rekap$/)) {
            return { intent: 'rekap_student', name: rekapMatch[1].trim(), confidence: 0.94 };
        }
        return { intent: 'general_stats', confidence: 0.96 };
    }
    
    // 11. STATISTIK & METRIK
    if (lowerCommand.match(/statistik|stat|ringkasan|summary|dashboard|gambaran|total|berapa|jumlah/i)) {
        return { intent: 'general_stats', confidence: 0.95 };
    }
    
    // 12. TOP/PERINGKAT SISWA
    if (lowerCommand.match(/terbaik|tertinggi|teratas|juara|ranking|top|paling rajin|paling baik|pintar/i)) {
        const limitMatch = command.match(/(\d+)/);
        const limit = limitMatch ? Math.min(parseInt(limitMatch[1]), 20) : 5;
        return { intent: 'top_students', limit, confidence: 0.94 };
    }
    
    // 13. PREDIKSI TREN
    if (lowerCommand.match(/prediksi|tren|forecast|proyeksi|ke depan|mendatang|akan datang/i)) {
        return { intent: 'predict_trend', confidence: 0.9 };
    }
    
    // 14. PERBANDINGAN
    if (lowerCommand.match(/bandingkan|perbandingan|vs|dibanding|lebih|kurang|naik|turun/i)) {
        return { intent: 'compare', confidence: 0.88 };
    }
    
    // 15. REKOMENDASI
    if (lowerCommand.match(/rekomendasi|saran|advice|tips|solusi|how to|bagaimana cara|strategi/i)) {
        return { intent: 'recommendations', confidence: 0.92 };
    }
    
    // 16. INFORMASI SISTEM/WEB
    if (lowerCommand.match(/tentang|about|web ini|aplikasi|sistem absensi|fingerprint|esp32|fitur apa saja/i)) {
        return { intent: 'about_system', confidence: 0.92 };
    }
    
    // 17. INFORMASI WAKTU
    if (lowerCommand.match(/jam berapa|waktu|tanggal|hari ini|sekarang|date|time/i)) {
        return { intent: 'datetime', confidence: 0.97 };
    }
    
    // 18. CHAT UMUM (fallback ke AI)
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
        
        // CRUD SISWA
        case 'add_student': return await addStudentViaAI(intent);
        case 'update_student': return await updateStudentViaAI(intent);
        case 'update_student_by_name': return await updateStudentByNameViaAI(intent);
        case 'delete_student': return await deleteStudentViaAI(intent);
        case 'delete_student_by_name': return await deleteStudentByNameViaAI(intent);
        
        // QUERY
        case 'query_student': return await queryStudentProfessional(intent.name);
        case 'query_student_by_id': return await queryStudentByIdProfessional(intent.id);
        case 'students_by_class': return await getStudentsByClassProfessional(intent.kelas, intent.jurusan);
        case 'rekap_student': return await getStudentRekapProfessional(intent.name);
        case 'top_students': return await getTopStudentsProfessional(intent.limit);
        case 'general_stats': return await getGeneralStatsProfessional();
        case 'predict_trend': return await predictTrendProfessional();
        case 'compare': return await compareAttendanceProfessional();
        case 'recommendations': return await getProfessionalRecommendations();
        
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
    
    return `👋 **${greeting}, ${escapeHtml(userName)}!**\n\nSaya adalah **Asisten AI Profesional** sistem absensi **${escapeHtml(document.getElementById('schoolNameDisplay')?.innerText || 'Sekolah')}**.\n\n` +
           `📋 **Yang bisa saya bantu hari ini:**\n` +
           `• 🔍 **Cari data siswa** - "data siswa Budi" atau "id 123 siapa?"\n` +
           `• 📊 **Lihat rekap absensi** - "rekap Ani" atau "statistik kehadiran"\n` +
           `• ✏️ **Kelola data siswa** - "tambah siswa nama Toni id 7 kelas X" atau "hapus siswa id 5"\n` +
           `• 🏆 **Lihat peringkat** - "siapa siswa terbaik?" atau "top 10 siswa"\n` +
           `• 💡 **Dapatkan rekomendasi** - "saran untuk meningkatkan kehadiran"\n\n` +
           `💬 Ada yang bisa saya bantu, ${roleText} ${escapeHtml(userName)}?`;
}

function getProfessionalThanks() {
    return "🙏 **Sama-sama!** Senang dapat membantu.\n\nJika ada pertanyaan lain atau butuh bantuan lebih lanjut, jangan ragu untuk bertanya. Saya siap membantu kapan saja! 😊";
}

function getProfessionalIntroduction() {
    return `## 🤖 **Tentang Saya**\n\n` +
           `Saya adalah **Asisten AI Profesional** untuk Sistem Absensi Berbasis Fingerprint ESP32.\n\n` +
           `**🎓 Identitas:**\n` +
           `• Nama: **Sahabat Absensi AI**\n` +
           `• Developer: CV Haka Jaya\n` +
           `• Model AI: Groq Llama 3.3 70B (State-of-the-art)\n\n` +
           `**⚡ Kemampuan Utama:**\n` +
           `✅ **Manajemen Data Siswa** - Tambah, edit, hapus, cari data siswa\n` +
           `✅ **Analisis Absensi** - Rekap, statistik, perbandingan, prediksi tren\n` +
           `✅ **Rekomendasi Cerdas** - Saran berbasis data untuk peningkatan\n` +
           `✅ **Laporan & Export** - Bantu generate laporan ke Excel/PDF\n` +
           `✅ **Informasi Umum** - Waktu, tanggal, pengetahuan umum\n\n` +
           `**📊 Data Real-time:**\n` +
           `• ${systemDataCache.students.length} Siswa terdaftar\n` +
           `• ${systemDataCache.attendance.length} Catatan absensi\n` +
           `• ${systemDataCache.usersAuth.length} Pengguna aktif\n\n` +
           `💡 **Ketik "bantuan"** untuk melihat semua perintah yang tersedia!`;
}

function getAboutSystem() {
    return `## 🏫 **Tentang Sistem Absensi**\n\n` +
           `**Nama Sekolah:** ${escapeHtml(document.getElementById('schoolNameDisplay')?.innerText || 'Sistem Absensi')}\n\n` +
           `**📋 Fitur Sistem:**\n` +
           `1. **Absensi Fingerprint ESP32** - Real-time scan sidik jari\n` +
           `2. **Dashboard Interaktif** - Visualisasi data kehadiran\n` +
           `3. **Manajemen Siswa** - CRUD data siswa dengan delay pulang\n` +
           `4. **Rekap Absensi** - Laporan lengkap per periode\n` +
           `5. **Pengumuman** - Broadcast informasi dengan timer\n` +
           `6. **Sosial Media Internal** - Status, Chat, Teman\n` +
           `7. **Multi-role User** - Admin, Guru, Developer, Siswa\n` +
           `8. **Log Aktivitas** - Audit trail semua operasi\n` +
           `9. **Export Data** - Excel & PDF untuk laporan\n` +
           `10. **AI Assistant** - Saya! Yang siap membantu kapan saja\n\n` +
           `**🔧 Teknologi:** Firebase, Supabase, Groq AI, ESP32\n\n` +
           `💡 Ada yang ingin ditanyakan tentang fitur tertentu?`;
}

function getCurrentDateTime() {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return `🕐 **Informasi Waktu & Tanggal**\n\n` +
           `📅 **Hari/Tanggal:** ${now.toLocaleDateString('id-ID', options)}\n` +
           `⏰ **Pukul:** ${now.toLocaleTimeString('id-ID')}\n` +
           `📆 **Minggu ke-${Math.ceil(now.getDate() / 7)}** bulan ${now.toLocaleString('id-ID', { month: 'long' })}\n\n` +
           `💡 Butuh bantuan terkait absensi? Ketik "bantuan" untuk panduan!`;
}

function getProfessionalHelp() {
    return `## 📚 **PANDUAN LENGKAP ASISTEN AI**\n\n` +
           `### 🔹 MANAJEMEN SISWA (CRUD)\n` +
           `| Perintah | Contoh |\n` +
           `|----------|--------|\n` +
           `| Tambah siswa | "tambah siswa nama Budi id 5 kelas X jurusan RPL delay 60" |\n` +
           `| Edit siswa | "update siswa id 5 delay 90" atau "edit siswa Budi kelas XI" |\n` +
           `| Hapus siswa | "hapus siswa id 5" atau "delete siswa Budi" |\n` +
           `| Cari siswa | "data siswa Budi" atau "id 5 siapa?" |\n\n` +
           
           `### 🔹 DATA & STATISTIK\n` +
           `| Perintah | Contoh |\n` +
           `|----------|--------|\n` +
           `| Rekap siswa | "rekap absensi Budi" atau "kehadiran Ani" |\n` +
           `| Statistik umum | "statistik sistem" atau "ringkasan absensi" |\n` +
           `| Siswa per kelas | "siswa kelas X" atau "data kelas XII jurusan RPL" |\n` +
           `| Peringkat | "siswa terbaik" atau "top 10 siswa paling rajin" |\n\n` +
           
           `### 🔹 ANALISIS & PREDIKSI\n` +
           `| Perintah | Contoh |\n` +
           `|----------|--------|\n` +
           `| Prediksi tren | "prediksi kehadiran minggu depan" |\n` +
           `| Perbandingan | "bandingkan kehadiran bulan ini vs bulan lalu" |\n` +
           `| Rekomendasi | "saran untuk meningkatkan kehadiran" |\n\n` +
           
           `### 🔹 INFORMASI UMUM\n` +
           `| Perintah | Contoh |\n` +
           `|----------|--------|\n` +
           `| Tentang sistem | "tentang aplikasi ini" atau "fitur apa saja?" |\n` +
           `| Waktu | "jam berapa?" atau "tanggal berapa hari ini?" |\n` +
           `| Bantuan | "bantuan" atau "help" atau "bisa apa?" |\n\n` +
           
           `✨ **Tips:** Gunakan bahasa natural, AI akan memahami maksud Anda! ` +
           `Contoh: "Tolong tambahkan siswa baru bernama Siti dengan ID 10 di kelas XI"`;
}

// ======================= CRUD SISWA VIA AI =======================

async function addStudentViaAI(data) {
    if (!currentUser || !['admin', 'guru', 'developer'].includes(currentUser.role)) {
        return "⛔ **Akses Ditolak!**\n\nFitur tambah siswa hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_data) {
        return "📝 **Format Tambah Siswa:**\n\n" +
               "`tambah siswa nama [Nama] id [ID] kelas [Kelas] jurusan [Jurusan] delay [menit]`\n\n" +
               "**Contoh:**\n" +
               "• `tambah siswa nama Budi id 5 kelas X jurusan RPL delay 60`\n" +
               "• `tambah siswa Ani id 8 kelas XI` (jurusan default UMUM, delay 60)\n\n" +
               "Silakan lengkapi data siswa yang ingin ditambahkan.";
    }
    
    const existing = systemDataCache.students.find(s => s.id == data.id);
    if (existing) {
        return `⚠️ **Gagal Menambahkan!**\n\nSiswa dengan ID **${data.id}** sudah ada:\n• Nama: ${existing.nama}\n• Kelas: ${existing.kelas}\n\nGunakan perintah **"update siswa id ${data.id}"** untuk mengubah data.`;
    }
    
    const studentData = {
        id: data.id,
        nama: data.nama,
        kelas: data.kelas,
        jurusan: data.jurusan || 'UMUM',
        delayOut: data.delay || 60,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    try {
        await db.ref(`users/${data.id}`).set(studentData);
        
        if (typeof logActivity === 'function') {
            logActivity('add_student', `Menambah siswa: ${data.nama} (ID: ${data.id}, Kelas: ${data.kelas}, Jurusan: ${data.jurusan}) via AI Assistant`);
        }
        
        await updateSystemDataCache();
        
        return `✅ **BERHASIL!**\n\nSiswa **${data.nama}** berhasil ditambahkan ke database.\n\n` +
               `📋 **Detail Siswa:**\n` +
               `• 🆔 ID Fingerprint: ${data.id}\n` +
               `• 📚 Kelas: ${data.kelas}\n` +
               `• 🎓 Jurusan: ${data.jurusan || 'UMUM'}\n` +
               `• ⏰ Delay Pulang: ${data.delay || 60} menit\n\n` +
               `💡 Ketik **"rekap ${data.nama}"** untuk melihat data absensinya nanti.`;
    } catch (error) {
        return `❌ **Gagal Menambahkan!**\n\nTerjadi kesalahan: ${error.message}\n\nSilakan coba lagi atau hubungi administrator.`;
    }
}

async function updateStudentViaAI(data) {
    if (!currentUser || !['admin', 'guru', 'developer'].includes(currentUser.role)) {
        return "⛔ **Akses Ditolak!**\n\nFitur update siswa hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_data) {
        return "📝 **Format Update Siswa:**\n\n" +
               "`update siswa id [ID] delay [menit]`\n\n" +
               "**Contoh:**\n" +
               "• `update siswa id 5 delay 90` (ubah delay pulang)\n" +
               "• `edit siswa id 8 kelas XI jurusan TKJ`\n\n" +
               "Silakan tentukan ID siswa yang ingin diupdate.";
    }
    
    const student = systemDataCache.students.find(s => s.id == data.id);
    if (!student) {
        return `❌ **Siswa Tidak Ditemukan!**\n\nTidak ada siswa dengan ID **${data.id}**. Cek kembali ID atau gunakan perintah **"data siswa [nama]"** untuk mencari.`;
    }
    
    let updateMessage = '';
    const updates = {};
    
    if (data.delay) {
        updates.delayOut = data.delay;
        updateMessage += `• Delay pulang: ${student.delayOut || 60} → ${data.delay} menit\n`;
    }
    
    if (Object.keys(updates).length === 0) {
        return `📋 **Data Siswa ${student.nama}** (ID: ${student.id})\n\n` +
               `Informasi saat ini:\n• Kelas: ${student.kelas}\n• Jurusan: ${student.jurusan}\n• Delay: ${student.delayOut || 60} menit\n\n` +
               `Apa yang ingin diubah? Contoh: "update siswa id ${data.id} delay 90"`;
    }
    
    updates.updatedAt = firebase.database.ServerValue.TIMESTAMP;
    
    try {
        await db.ref(`users/${data.id}`).update(updates);
        
        if (typeof logActivity === 'function') {
            logActivity('edit_student', `Update siswa: ${student.nama} (ID: ${student.id}) - ${updateMessage.replace(/\n/g, ', ')} via AI Assistant`);
        }
        
        await updateSystemDataCache();
        
        return `✅ **BERHASIL DIPERBARUI!**\n\nData siswa **${student.nama}** (ID: ${student.id}) berhasil diupdate:\n${updateMessage}\n\nData lainnya tetap seperti sebelumnya.`;
    } catch (error) {
        return `❌ **Gagal Update!**\n\n${error.message}`;
    }
}

async function updateStudentByNameViaAI(data) {
    if (!currentUser || !['admin', 'guru', 'developer'].includes(currentUser.role)) {
        return "⛔ **Akses Ditolak!**";
    }
    
    const students = systemDataCache.students.filter(s => 
        s.nama && s.nama.toLowerCase().includes(data.name.toLowerCase())
    );
    
    if (students.length === 0) {
        return `❌ **Siswa "${escapeHtml(data.name)}" tidak ditemukan.** Coba gunakan ID atau nama lengkap.`;
    }
    
    if (students.length > 1) {
        let result = `⚠️ **Ditemukan ${students.length} siswa** dengan nama mirip:\n\n`;
        students.forEach((s, idx) => {
            result += `${idx+1}. ${s.nama} (ID: ${s.id}) - Kelas ${s.kelas}\n`;
        });
        result += `\n💡 Gunakan ID untuk lebih spesifik: **"update siswa id [ID] ..."**`;
        return result;
    }
    
    const student = students[0];
    return await updateStudentViaAI({ id: student.id, delay: data.delay, need_data: false });
}

async function deleteStudentViaAI(data) {
    if (!currentUser || !['admin', 'guru', 'developer'].includes(currentUser.role)) {
        return "⛔ **Akses Ditolak!**\n\nFitur hapus siswa hanya untuk **Admin, Guru, dan Developer**.";
    }
    
    if (data.need_id) {
        return "📝 **Format Hapus Siswa:**\n\n" +
               "`hapus siswa id [ID]` atau `hapus siswa [Nama]`\n\n" +
               "**Contoh:**\n" +
               "• `hapus siswa id 5`\n" +
               "• `delete siswa Budi`\n\n" +
               "⚠️ **Peringatan:** Tindakan ini tidak dapat dibatalkan!";
    }
    
    const student = systemDataCache.students.find(s => s.id == data.id);
    if (!student) {
        return `❌ **Siswa dengan ID ${data.id} tidak ditemukan.**`;
    }
    
    // Cek apakah siswa memiliki akun
    const hasAccount = systemDataCache.usersAuth.some(u => u.fpId == student.id);
    const accountWarning = hasAccount ? `\n\n⚠️ **Peringatan:** Siswa ini memiliki akun (${systemDataCache.usersAuth.find(u => u.fpId == student.id)?.email}). Akunnya juga akan dihapus.` : '';
    
    return `⚠️ **Konfirmasi Hapus Siswa**\n\n` +
           `Anda akan menghapus:\n` +
           `• Nama: **${student.nama}**\n` +
           `• ID: ${student.id}\n` +
           `• Kelas: ${student.kelas}${accountWarning}\n\n` +
           `**Ketik "YA HAPUS ${student.id}"** untuk mengonfirmasi penghapusan permanen.\n\n` +
           `_(Ketik "batal" untuk membatalkan)_`;
}

async function executeDeleteConfirmation(message, pendingDelete) {
    if (!pendingDelete) return null;
    
    const confirmPattern = new RegExp(`YA HAPUS ${pendingDelete.id}`, 'i');
    if (confirmPattern.test(message)) {
        try {
            // Hapus akun jika ada
            const userAccount = systemDataCache.usersAuth.find(u => u.fpId == pendingDelete.id);
            if (userAccount) {
                await db.ref(`users_auth/${userAccount.uid}`).remove();
            }
            await db.ref(`users/${pendingDelete.id}`).remove();
            
            if (typeof logActivity === 'function') {
                logActivity('delete_student', `Menghapus siswa: ${pendingDelete.nama} (ID: ${pendingDelete.id}) via AI Assistant`);
            }
            
            await updateSystemDataCache();
            return `✅ **BERHASIL DIHAPUS!**\n\nSiswa **${pendingDelete.nama}** (ID: ${pendingDelete.id}) telah dihapus dari database.`;
        } catch (error) {
            return `❌ **Gagal Hapus!**\n\n${error.message}`;
        }
    }
    
    if (message.toLowerCase().includes('batal')) {
        return `✅ **Penghapusan dibatalkan.** Data siswa **${pendingDelete.nama}** tetap aman.`;
    }
    
    return null;
}

async function deleteStudentByNameViaAI(data) {
    if (!currentUser || !['admin', 'guru', 'developer'].includes(currentUser.role)) {
        return "⛔ **Akses Ditolak!**";
    }
    
    const students = systemDataCache.students.filter(s => 
        s.nama && s.nama.toLowerCase().includes(data.name.toLowerCase())
    );
    
    if (students.length === 0) {
        return `❌ **Siswa "${escapeHtml(data.name)}" tidak ditemukan.**`;
    }
    
    if (students.length > 1) {
        let result = `⚠️ **Ditemukan ${students.length} siswa** dengan nama mirip:\n\n`;
        students.forEach((s, idx) => {
            result += `${idx+1}. ${s.nama} (ID: ${s.id}) - Kelas ${s.kelas}\n`;
        });
        result += `\n💡 Gunakan ID untuk lebih spesifik: **"hapus siswa id [ID]"**`;
        return result;
    }
    
    const student = students[0];
    return await deleteStudentViaAI({ id: student.id, need_id: false });
}

// ======================= QUERY FUNCTIONS PROFESIONAL =======================

async function queryStudentProfessional(name) {
    await updateSystemDataCache();
    const students = systemDataCache.students.filter(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (students.length === 0) {
        return `📭 **Siswa Tidak Ditemukan**\n\nTidak ada siswa dengan nama "${escapeHtml(name)}" di database.\n\n💡 **Tips:**\n• Coba gunakan nama lengkap\n• Atau cari berdasarkan ID: "id 123 siapa?"\n• Ketik "bantuan" untuk panduan lengkap`;
    }
    
    if (students.length === 1) {
        const s = students[0];
        const hasAccount = systemDataCache.usersAuth.some(u => u.fpId == s.id);
        const userAccount = systemDataCache.usersAuth.find(u => u.fpId == s.id);
        
        // Hitung kehadiran singkat
        const attendanceRecords = systemDataCache.attendance.filter(a => a.studentId == s.id);
        const hadirCount = attendanceRecords.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
        
        return `## 👤 **DETAIL SISWA**\n\n` +
               `**📌 Nama:** ${escapeHtml(s.nama)}\n` +
               `**🆔 ID Fingerprint:** ${s.id}\n` +
               `**📚 Kelas:** ${s.kelas || '-'}\n` +
               `**🎓 Jurusan:** ${s.jurusan || '-'}\n` +
               `**⏰ Delay Pulang:** ${s.delayOut || 60} menit\n` +
               `**🔐 Status Akun:** ${hasAccount ? '✅ Sudah memiliki akun' : '⏳ Belum memiliki akun'}${hasAccount && userAccount?.email ? ` (${userAccount.email})` : ''}\n` +
               `**📊 Total Kehadiran:** ${hadirCount} kali\n\n` +
               `💡 **Perintah cepat:**\n` +
               `• "rekap ${s.nama}" - Lihat detail absensi lengkap\n` +
               `• "update siswa id ${s.id} delay 90" - Edit data siswa\n` +
               `• "hapus siswa id ${s.id}" - Hapus siswa (Admin/Guru)`;
    }
    
    let result = `🔍 **${students.length} Siswa Ditemukan** dengan nama "${escapeHtml(name)}":\n\n`;
    students.slice(0, 10).forEach((s, idx) => {
        const hasAccount = systemDataCache.usersAuth.some(u => u.fpId == s.id);
        const statusIcon = hasAccount ? '✅' : '⏳';
        result += `${idx+1}. ${statusIcon} **${escapeHtml(s.nama)}** (ID: ${s.id}) - Kelas ${s.kelas || '-'} / ${s.jurusan || '-'}\n`;
    });
    if (students.length > 10) {
        result += `\n... dan ${students.length - 10} siswa lainnya.`;
    }
    result += `\n\n💡 Gunakan ID untuk hasil lebih spesifik: **"id [ID] siapa?"**`;
    return result;
}

async function queryStudentByIdProfessional(id) {
    await updateSystemDataCache();
    const student = systemDataCache.students.find(s => s.id == id);
    if (!student) {
        return `📭 **Siswa dengan ID ${id} tidak ditemukan**\n\nPastikan ID yang dimasukkan benar. Coba cek di halaman Data Siswa.`;
    }
    const hasAccount = systemDataCache.usersAuth.some(u => u.fpId == student.id);
    return formatStudentDetailProfessional(student, hasAccount);
}

async function getStudentsByClassProfessional(kelas, jurusan = null) {
    await updateSystemDataCache();
    
    let students = systemDataCache.students.filter(s => s.kelas === kelas);
    if (jurusan) {
        students = students.filter(s => s.jurusan === jurusan);
    }
    
    if (students.length === 0) {
        let msg = `📭 **Tidak ada siswa** di kelas ${kelas}`;
        if (jurusan) msg += ` jurusan ${jurusan}`;
        return msg + `.\n\nPastikan kelas dan jurusan yang dimasukkan benar.`;
    }
    
    const withAccount = students.filter(s => systemDataCache.usersAuth.some(u => u.fpId == s.id)).length;
    
    let result = `## 📚 **DATA SISWA KELAS ${kelas}**`;
    if (jurusan) result += ` - JURUSAN ${jurusan}`;
    result += `\n\n📊 **Statistik:** ${students.length} siswa total | ✅ ${withAccount} sudah berakun | ⏳ ${students.length - withAccount} belum berakun\n\n`;
    
    result += `**Daftar Siswa:**\n`;
    students.slice(0, 20).forEach((s, idx) => {
        const hasAccount = systemDataCache.usersAuth.some(u => u.fpId == s.id);
        const statusIcon = hasAccount ? '✅' : '⏳';
        result += `${idx+1}. ${statusIcon} **${escapeHtml(s.nama)}** (ID: ${s.id})\n`;
    });
    
    if (students.length > 20) {
        result += `\n... dan ${students.length - 20} siswa lainnya. Lihat di halaman Data Siswa untuk lengkapnya.`;
    }
    
    return result;
}

async function getStudentRekapProfessional(name) {
    await updateSystemDataCache();
    
    const student = systemDataCache.students.find(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (!student) {
        return `📭 **Siswa "${escapeHtml(name)}" tidak ditemukan**\n\nCoba gunakan nama lengkap atau cari dengan ID.`;
    }
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    // Hitung hari sekolah bulan ini
    const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
    let schoolDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(thisYear, thisMonth, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) schoolDays++;
    }
    
    const attendanceRecords = systemDataCache.attendance.filter(a => 
        a.studentId == student.id && 
        a.date && new Date(a.date).getMonth() === thisMonth &&
        new Date(a.date).getFullYear() === thisYear
    );
    
    const hadir = attendanceRecords.filter(r => r.status === 'Hadir' || r.status === 'Pulang').length;
    const sakit = attendanceRecords.filter(r => r.status === 'Sakit').length;
    const izin = attendanceRecords.filter(r => r.status === 'Izin').length;
    const alpha = attendanceRecords.filter(r => r.status === 'Alpha').length;
    
    const persentase = schoolDays > 0 ? ((hadir / schoolDays) * 100).toFixed(1) : 0;
    
    let grade = '', gradeIcon = '', gradeColor = '';
    if (persentase >= 90) { grade = 'Sangat Baik'; gradeIcon = '🏆'; gradeColor = '#4caf50'; }
    else if (persentase >= 75) { grade = 'Baik'; gradeIcon = '👍'; gradeColor = '#8bc34a'; }
    else if (persentase >= 60) { grade = 'Cukup'; gradeIcon = '📊'; gradeColor = '#ffc107'; }
    else if (persentase >= 40) { grade = 'Kurang'; gradeIcon = '⚠️'; gradeColor = '#ff9800'; }
    else { grade = 'Buruk'; gradeIcon = '❗'; gradeColor = '#f44336'; }
    
    let recommendation = '';
    if (persentase >= 90) recommendation = "🎉 **Pertahankan!** Kehadiran Anda sangat baik. Terus pertahankan semangat belajarnya!";
    else if (persentase >= 75) recommendation = "📈 **Cukup Baik.** Tingkatkan lagi kehadiran untuk hasil maksimal!";
    else if (persentase >= 60) recommendation = "⚠️ **Perlu Peningkatan.** Usahakan untuk tidak bolos dan selalu datang tepat waktu.";
    else recommendation = "🚨 **Perhatian Khusus.** Kehadiran rendah. Segera evaluasi dan perbaiki!";
    
    return `## 📊 **REKAP ABSENSI**\n\n` +
           `### 👤 **${escapeHtml(student.nama)}**\n` +
           `🆔 ID: ${student.id} | 📚 Kelas: ${student.kelas || '-'} | 🎓 Jurusan: ${student.jurusan || '-'}\n\n` +
           `### 📈 **Statistik (${now.toLocaleString('id-ID', { month: 'long' })} ${thisYear})**\n` +
           `| Metrik | Jumlah |\n` +
           `|--------|--------|\n` +
           `| ✅ Hadir | **${hadir}** hari |\n` +
           `| 🤒 Sakit | ${sakit} hari |\n` +
           `| 📝 Izin | ${izin} hari |\n` +
           `| ❌ Alpha | ${alpha} hari |\n` +
           `| 📅 Total Hari Sekolah | ${schoolDays} hari |\n` +
           `| 🎯 Persentase Kehadiran | **${persentase}%** |\n` +
           `| ⭐ Status | ${gradeIcon} **${grade}** |\n\n` +
           `### 💡 **Rekomendasi**\n${recommendation}`;
}

async function getTopStudentsProfessional(limit = 5) {
    await updateSystemDataCache();
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    // Hitung hari sekolah bulan ini
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
    
    let result = `## 🏆 **TOP ${limit} SISWA TERBAIK**\n`;
    result += `*Periode: ${now.toLocaleString('id-ID', { month: 'long' })} ${thisYear}*\n\n`;
    
    result += `**🥇 Peringkat Kehadiran Tertinggi:**\n`;
    topStudents.forEach((s, idx) => {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📌';
        let gradeIcon = '';
        if (s.persen >= 90) gradeIcon = '🌟';
        else if (s.persen >= 75) gradeIcon = '✅';
        else if (s.persen >= 60) gradeIcon = '📊';
        else gradeIcon = '⚠️';
        result += `${medal} ${gradeIcon} **${escapeHtml(s.nama)}** (${s.kelas || '-'}) - ${s.hadir}/${schoolDays} hari (${s.persen}%)\n`;
    });
    
    result += `\n💡 **Tips:** ${topStudents[0]?.nama} layak mendapat apresiasi atas kehadirannya yang luar biasa!`;
    
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
    const pulangToday = todayAbsensi.filter(a => a.status === 'Pulang').length;
    
    // Statistik per kelas
    const classStats = {};
    systemDataCache.students.forEach(s => {
        const kelas = s.kelas || 'Tanpa Kelas';
        if (!classStats[kelas]) classStats[kelas] = { total: 0, hadir: 0 };
        classStats[kelas].total++;
    });
    
    systemDataCache.attendance.filter(a => a.date === today && (a.status === 'Hadir' || a.status === 'Pulang')).forEach(a => {
        const student = systemDataCache.students.find(s => s.id == a.studentId);
        if (student && student.kelas && classStats[student.kelas]) {
            classStats[student.kelas].hadir++;
        }
    });
    
    let result = `## 📊 **STATISTIK SISTEM**\n\n`;
    result += `### 👥 **Data Siswa**\n| Metrik | Jumlah |\n|--------|--------|\n`;
    result += `| Total siswa | **${totalSiswa}** |\n| Sudah berakun | ${totalAkun} |\n| Belum berakun | ${totalSiswa - totalAkun} |\n\n`;
    result += `### 📋 **Absensi Hari Ini (${today})**\n| Status | Jumlah |\n|--------|--------|\n`;
    result += `| ✅ Sudah masuk | **${hadirToday}** siswa |\n| 🏠 Sudah pulang | ${pulangToday} siswa |\n| 📊 Total transaksi | ${todayAbsensi.length} |\n\n`;
    result += `### 🏫 **Kehadiran per Kelas (Hari Ini)**\n`;
    result += `| Kelas | Kehadiran | Persentase |\n|-------|-----------|------------|\n`;
    
    const sortedClass = Object.entries(classStats).sort((a, b) => b[1].hadir - a[1].hadir);
    for (const [kelas, stats] of sortedClass.slice(0, 5)) {
        const persen = stats.total > 0 ? ((stats.hadir / stats.total) * 100).toFixed(1) : 0;
        result += `| ${kelas} | ${stats.hadir}/${stats.total} | ${persen}% |\n`;
    }
    
    result += `\n💡 Total catatan absensi di database: **${totalAbsensi}** transaksi.`;
    return result;
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
    
    let prediction = "", recommendation = "";
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
    
    let result = `## 🔮 **PREDIKSI TREN KEHADIRAN**\n\n`;
    result += `### 📅 **4 Minggu Terakhir**\n\`\`\`\n`;
    weeklyAttendance.forEach((w) => {
        const barLength = Math.min(30, Math.floor(w.hadir / 10));
        const bar = '█'.repeat(barLength) + '░'.repeat(30 - barLength);
        result += `Minggu ${w.week}: ${bar} ${w.hadir} kehadiran\n`;
    });
    result += `\`\`\`\n`;
    result += `### ${prediction}\n\n`;
    result += `### 💡 **Rekomendasi**\n${recommendation}\n`;
    
    return result;
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
    
    let result = `## 📊 **PERBANDINGAN KEHADIRAN**\n\n`;
    result += `### 📅 **Bulan Ini vs Bulan Lalu**\n`;
    result += `| Periode | Jumlah Kehadiran |\n|---------|------------------|\n`;
    result += `| ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })} | **${thisMonthHadir}** |\n`;
    result += `| ${new Date(lastYear, lastMonth).toLocaleString('id-ID', { month: 'long', year: 'numeric' })} | ${lastMonthHadir} |\n`;
    result += `| **Perubahan** | ${trendIcon} **${trendText}** |\n`;
    
    return result;
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
    const bestStudents = studentStats.sort((a, b) => b.hadir - a.hadir).slice(0, 3);
    
    let result = `## 💡 **REKOMENDASI CERDAS**\n\n`;
    
    if (worstStudents.length > 0) {
        result += `### 🚨 **Prioritas Tinggi (Perlu Perhatian)**\n`;
        result += `Siswa dengan kehadiran terendah bulan ini:\n`;
        worstStudents.forEach((s, idx) => {
            result += `${idx+1}. **${escapeHtml(s.nama)}** (${s.kelas}) - ${s.hadir} kehadiran\n`;
        });
        result += `\n💡 **Saran:** Lakukan pendekatan personal, komunikasi dengan orang tua, dan cari tahu penyebab absen.\n\n`;
    }
    
    if (bestStudents.length > 0) {
        result += `### 🏆 **Apresiasi (Role Model)**\n`;
        result += `Siswa dengan kehadiran terbaik bulan ini:\n`;
        bestStudents.forEach((s, idx) => {
            result += `${idx+1}. **${escapeHtml(s.nama)}** (${s.kelas}) - ${s.hadir} kehadiran\n`;
        });
        result += `\n💡 **Saran:** Berikan penghargaan/pujian, jadikan mereka duta kehadiran.\n\n`;
    }
    
    // Analisis hari dengan kehadiran rendah
    const attendanceByDay = {};
    const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];
    days.forEach(day => { attendanceByDay[day] = { total: 0, hadir: 0 }; });
    
    systemDataCache.attendance.forEach(a => {
        const date = new Date(a.date);
        const dayName = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][date.getDay()];
        if (attendanceByDay[dayName]) {
            attendanceByDay[dayName].total++;
            if (a.status === 'Hadir' || a.status === 'Pulang') {
                attendanceByDay[dayName].hadir++;
            }
        }
    });
    
    const worstDay = Object.entries(attendanceByDay).sort((a, b) => 
        (a[1].hadir / Math.max(1, a[1].total)) - (b[1].hadir / Math.max(1, b[1].total))
    )[0];
    
    if (worstDay && worstDay[1].total > 0) {
        const persen = ((worstDay[1].hadir / worstDay[1].total) * 100).toFixed(1);
        result += `### 📅 **Pola Kehadiran**\n`;
        result += `Hari **${worstDay[0]}** memiliki kehadiran terendah (${persen}%).\n`;
        result += `💡 **Saran:** Evaluasi jadwal pelajaran dan kegiatan di hari ${worstDay[0]}. Mungkin ada faktor tertentu.\n`;
    }
    
    result += `\n---\n📌 **Kesimpulan:** ${bestStudents.length > 0 ? `Pertahankan prestasi ${bestStudents[0]?.nama} dan lainnya.` : ''} ${worstStudents.length > 0 ? `Segera tindak lanjuti ${worstStudents.length} siswa dengan kehadiran rendah.` : 'Semua siswa menunjukkan kehadiran baik!'}`;
    
    return result;
}

function formatStudentDetailProfessional(student, hasAccount) {
    const accountStatus = hasAccount ? '✅ Sudah memiliki akun' : '⏳ Belum memiliki akun';
    const userAccount = systemDataCache.usersAuth.find(u => u.fpId == student.id);
    
    // Hitung total kehadiran
    const attendanceCount = systemDataCache.attendance.filter(a => a.studentId == student.id).length;
    const hadirCount = systemDataCache.attendance.filter(a => a.studentId == student.id && (a.status === 'Hadir' || a.status === 'Pulang')).length;
    
    return `## 👤 **DETAIL SISWA**\n\n` +
           `**📌 Nama:** ${escapeHtml(student.nama)}\n` +
           `**🆔 ID Fingerprint:** ${student.id}\n` +
           `**📚 Kelas:** ${student.kelas || '-'}\n` +
           `**🎓 Jurusan:** ${student.jurusan || '-'}\n` +
           `**⏰ Delay Pulang:** ${student.delayOut || 60} menit\n` +
           `**🔐 Status Akun:** ${accountStatus}${hasAccount && userAccount?.email ? ` (${userAccount.email})` : ''}\n` +
           `**📊 Statistik Singkat:**\n` +
           `• Total absensi: ${attendanceCount} kali\n` +
           `• Total hadir: ${hadirCount} kali\n\n` +
           `💡 **Perintah cepat:**\n` +
           `• "rekap ${student.nama}" - Lihat rekap absensi lengkap\n` +
           `• "update siswa id ${student.id} delay 90" - Edit data\n` +
           `• "hapus siswa id ${student.id}" - Hapus siswa (Admin/Guru)`;
}

// ======================= CALL GROQ API =======================

let pendingDeleteConfirmation = null;

async function callGroqAPI(userMessage, contextData = null) {
    // Cek konfirmasi hapus
    if (pendingDeleteConfirmation) {
        const confirmResult = await executeDeleteConfirmation(userMessage, pendingDeleteConfirmation);
        if (confirmResult) {
            pendingDeleteConfirmation = null;
            return confirmResult;
        }
    }
    
    const systemPrompt = `Anda adalah Asisten AI Profesional untuk Sistem Absensi Sekolah.

=== DATA SISTEM REAL-TIME ===
Total siswa: ${systemDataCache.students.length}
Total absensi: ${systemDataCache.attendance.length}
Total user: ${systemDataCache.usersAuth.length}
Role pengguna: ${currentUser?.role || 'unknown'}
Waktu: ${new Date().toLocaleString('id-ID')}
Nama Sekolah: ${document.getElementById('schoolNameDisplay')?.innerText || 'Sistem Absensi'}

=== RESPONSIBILITAS ===
1. Berikan jawaban AKURAT, INFORMATIF, dan PROFESIONAL
2. Gunakan format tabel/markdown untuk data
3. Jika tidak tahu, akui dengan jujur dan tawarkan bantuan lain
4. Jangan pernah memberikan informasi palsu
5. Prioritaskan data sistem di atas pengetahuan umum

=== GAYA BAHASA ===
- Bahasa Indonesia formal namun ramah
- Gunakan emoji secukupnya (✅, 📊, 👤, dll)
- Untuk data, gunakan bullet points atau tabel

${contextData ? `\n=== KONTEKS ===\n${contextData}` : ''}`;

    const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.slice(-AI_CONFIG.maxContextMessages),
        { role: "user", content: userMessage }
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
                max_tokens: AI_CONFIG.maxTokens,
                top_p: AI_CONFIG.topP
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
            { role: "user", content: userMessage },
            { role: "assistant", content: aiResponse }
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
        
        return generateFallbackProfessional(userMessage);
    }
}

function generateFallbackProfessional(message) {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.match(/halo|hai|hello|hy|hii?/)) return getProfessionalGreeting();
    if (lowerMsg.match(/terima kasih|makasih|thanks/)) return getProfessionalThanks();
    if (lowerMsg.match(/siapa kamu|kamu siapa/)) return getProfessionalIntroduction();
    if (lowerMsg.match(/bye|dadah|sampai jumpa/)) {
        return "👋 **Sampai jumpa!** Terima kasih telah menggunakan Sistem Absensi. Semoga harimu menyenangkan!";
    }
    
    return `🤔 **Maaf, saya belum bisa memproses perintah itu dengan baik.**

📋 **Perintah yang saya pahami:**
• 🔍 **Cari data** - "data siswa Budi", "id 5 siapa?"
• 📊 **Rekap** - "rekap absensi Ani", "statistik"
• ✏️ **Kelola** - "tambah siswa ...", "hapus siswa id 5"
• 🏆 **Peringkat** - "siswa terbaik", "top 10"
• 💡 **Rekomendasi** - "saran untuk guru"

💬 **Ketik "bantuan"** untuk panduan lengkap, atau tanyakan dengan bahasa yang lebih sederhana.`;
}

// ======================= MAIN PROCESSOR =======================

async function processAIMessage(message) {
    await updateSystemDataCache();
    
    const intent = parseProfessionalIntent(message);
    console.log(`🤖 [${getTimestamp()}] Intent: ${intent.intent} (confidence: ${intent.confidence})`);
    
    // Simpan ke memory untuk pertanyaan pendek
    if (message.length < 60 && !message.includes('hapus')) {
        saveToMemory(`last_q_${message}`, 'asked');
    }
    
    if (intent.confidence >= 0.8) {
        const result = await executeProfessionalIntent(intent);
        if (result) return result;
    }
    
    // Untuk intent hapus, simpan pending confirmation
    if (intent.intent === 'delete_student' && intent.id && !intent.confirmed) {
        const student = systemDataCache.students.find(s => s.id == intent.id);
        if (student) {
            pendingDeleteConfirmation = { id: student.id, nama: student.nama };
            return await deleteStudentViaAI(intent);
        }
    }
    
    if (intent.intent === 'delete_student_by_name' && intent.name) {
        const result = await deleteStudentByNameViaAI(intent);
        if (result && result.includes('Konfirmasi')) {
            const match = result.match(/ID: (\d+)/);
            if (match) {
                const student = systemDataCache.students.find(s => s.id == parseInt(match[1]));
                if (student) pendingDeleteConfirmation = { id: student.id, nama: student.nama };
            }
        }
        return result;
    }
    
    return await callGroqAPI(message, currentAIContext);
}

// ======================= UI KOMPONEN =======================

function addAIAssistantButton() {
    if (document.getElementById('aiAssistantBtn')) return;
    
    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'aiAssistantBtn';
    floatingBtn.innerHTML = '🤖';
    floatingBtn.title = 'AI Assistant Professional';
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
                        <span>🤖 <strong>AI Assistant Professional</strong> <small style="font-size: 11px; color: #00bcd4;">Groq Llama 3.3 70B</small></span>
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
                        <input type="text" id="aiChatInput" placeholder="Tanyakan sesuatu... misal: 'data siswa kelas X' atau 'tambah siswa...'" 
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
        userMsgDiv.style.cssText = 'display: flex; gap: 10px; flex-direction: row-reverse; margin-bottom: 12px;';
        userMsgDiv.innerHTML = `
            <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 20px;">👤</div>
            <div class="ai-bubble" style="background: var(--primary); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(message)}</div>
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
            botMsgDiv.style.cssText = 'display: flex; gap: 10px; margin-bottom: 12px;';
            botMsgDiv.innerHTML = `
                <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #00bcd4, #2196f3); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
                <div class="ai-bubble" style="background: var(--bg-hover); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5; white-space: pre-wrap;">${formatMarkdown(response)}</div>
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
    
    if (!currentUser || !hasAIAssistantAccess()) {
        console.log("🔒 AI Assistant: Akses ditolak untuk role:", currentUser?.role);
        return;
    }
    
    aiAssistantInitialized = true;
    console.log("🤖 AI Assistant v3.0 initialized - Ultra Professional");
    
    addAIAssistantButton();
    setInterval(() => updateSystemDataCache(), 30000);
    setInterval(() => {
        if (aiAssistantModalOpen) updateSystemDataCache();
    }, 15000);
}

function hasAIAssistantAccess() {
    if (!currentUser) return false;
    return ['admin', 'guru', 'developer'].includes(currentUser.role);
}

// Event listeners
window.addEventListener('uiReady', (e) => {
    if (e.detail?.currentUser) setTimeout(() => initAIAssistant(), 500);
});

window.addEventListener('dataReady', () => {
    if (currentUser && hasAIAssistantAccess() && !aiAssistantInitialized) initAIAssistant();
});

// Ekspor global
window.initAIAssistant = initAIAssistant;
window.openAIAssistantModal = openAIAssistantModal;
window.closeAIAssistantModal = closeAIAssistantModal;
window.hasAIAssistantAccess = hasAIAssistantAccess;

console.log("✅ ai-assistant.js V3.0 loaded - ULTRA PROFESSIONAL AI with CRUD operations!");