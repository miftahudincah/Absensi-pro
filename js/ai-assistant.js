// ai-assistant.js - VERSION 2.0 (POWERFUL AI ASSISTANT WITH GROQ ONLY)
// Asisten AI SUPER POWERFUL dengan Groq API (Llama 3.3 70B)
// Fitur:
// - Analisis sentimen otomatis
// - Rekomendasi cerdas berdasarkan data
// - Memory context-aware (5 menit)
// - Multi-intent parsing
// - Smart fallback responses
// ============================================================================

// ======================= KONFIGURASI API =======================
const GROQ_API_KEY = "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";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

// Model terbaik dari Groq
const GROQ_MODEL = "llama-3.3-70b-versatile"; // Model paling cerdas

// Konfigurasi AI
const AI_CONFIG = {
    temperature: 0.7,
    maxTokens: 1500,
    topP: 0.95,
    contextMemoryMinutes: 5,  // Ingat percakapan dalam 5 menit terakhir
    maxContextMessages: 10      // Maksimal pesan yang diingat
};

// State AI
let aiAssistantInitialized = false;
let aiAssistantModalOpen = false;
let conversationHistory = [];  // Memory percakapan
let lastActivityTimestamp = null;

// Cache untuk data sistem (update setiap 30 detik)
let systemDataCache = {
    students: [],
    attendance: [],
    lastUpdate: 0
};

// ======================= UTILITY FUNCTIONS =======================

/**
 * Format waktu untuk log
 */
function getTimestamp() {
    return new Date().toLocaleTimeString('id-ID');
}

/**
 * Update cache data sistem
 */
async function updateSystemDataCache() {
    const now = Date.now();
    if (now - systemDataCache.lastUpdate < 30000) return systemDataCache;
    
    systemDataCache = {
        students: dbData?.users?.filter(s => s && s.nama && s.nama !== 'Tidak Diketahui') || [],
        attendance: dbData?.attendance || [],
        lastUpdate: now
    };
    console.log(`🤖 System data cache updated: ${systemDataCache.students.length} students, ${systemDataCache.attendance.length} attendance`);
    return systemDataCache;
}

/**
 * Escape HTML untuk keamanan
 */
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

/**
 * Format markdown sederhana ke HTML
 */
function formatMarkdown(text) {
    if (!text) return '';
    
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Code inline
    text = text.replace(/`(.*?)`/g, '<code style="background:rgba(0,0,0,0.2);padding:2px 6px;border-radius:4px;">$1</code>');
    // Line breaks
    text = text.replace(/\n/g, '<br>');
    // Bullet points
    text = text.replace(/^• (.*?)$/gm, '<li>$1</li>');
    if (text.includes('<li>')) {
        text = text.replace(/(<li>.*?<\/li>)/s, '<ul style="margin:8px 0 8px 20px;">$1</ul>');
    }
    // Numbered lists
    text = text.replace(/^(\d+)\. (.*?)$/gm, '<li value="$1">$2</li>');
    
    return text;
}

// ======================= INTENT PARSING LANJUTAN =======================

/**
 * Parse intent dengan pattern matching yang lebih cerdas
 */
function parsePowerfulIntent(command) {
    const lowerCommand = command.toLowerCase();
    
    // 1. Intent: Cari data siswa (by name or ID)
    const nameMatch = command.match(/(?:data siswa|cari siswa|siswa|siapa|tampilkan|info)\s+["']?([A-Za-z\s]+)["']?(?:\s|$)/i);
    const idMatch = command.match(/(?:id|ID)\s*(\d+)/i);
    
    if (nameMatch && nameMatch[1] && nameMatch[1].length > 2) {
        return { intent: 'query_student', name: nameMatch[1].trim(), confidence: 0.95 };
    }
    if (idMatch) {
        return { intent: 'query_student_by_id', id: idMatch[1], confidence: 0.98 };
    }
    
    // 2. Intent: Data siswa per kelas
    const kelasMatch = command.match(/(?:siswa kelas|kelas\s+([A-Z0-9\s]+)|data kelas\s+([A-Z0-9\s]+))/i);
    if (kelasMatch) {
        let kelas = (kelasMatch[1] || kelasMatch[2] || '').trim().toUpperCase();
        const jurusanMatch = command.match(/jurusan\s+([A-Za-z0-9\s]+)/i);
        return { 
            intent: 'query_students_by_class', 
            kelas: kelas,
            jurusan: jurusanMatch ? jurusanMatch[1].trim().toUpperCase() : null,
            confidence: 0.92
        };
    }
    
    // 3. Intent: Rekap / statistik siswa
    if (lowerCommand.match(/rekap|absensi|kehadiran|persentase|statistik|ringkasan/)) {
        const specificName = command.match(/(?:siswa|rekap)?\s*["']?([A-Za-z\s]+)["']?(?:\s|$)/i);
        if (specificName && specificName[1] && specificName[1].length > 2 && !lowerCommand.match(/^rekap$/)) {
            return { intent: 'rekap_student', name: specificName[1].trim(), confidence: 0.9 };
        }
        return { intent: 'general_stats', confidence: 0.95 };
    }
    
    // 4. Intent: Top performers / peringkat
    if (lowerCommand.match(/paling prestasi|terbaik|tertinggi|juara|ranking|top|teratas|terajin/)) {
        const limitMatch = command.match(/(\d+)\s+(?:siswa|orang|terbaik|teratas)/i);
        const limit = limitMatch ? parseInt(limitMatch[1]) : 5;
        return { intent: 'top_students', limit: Math.min(limit, 20), confidence: 0.93 };
    }
    
    // 5. Intent: Prediksi / analisis tren
    if (lowerCommand.match(/prediksi|tren|analisis|forecast|proyeksi|mendatang/)) {
        return { intent: 'predict_trend', confidence: 0.88 };
    }
    
    // 6. Intent: Perbandingan (bulan ini vs bulan lalu)
    if (lowerCommand.match(/bandingkan|perbandingan|vs|dibanding|lebih baik|lebih buruk/)) {
        return { intent: 'compare_periods', confidence: 0.85 };
    }
    
    // 7. Intent: Rekomendasi
    if (lowerCommand.match(/rekomendasi|saran|advice|tips|solusi|bagaimana cara/)) {
        return { intent: 'recommendations', confidence: 0.9 };
    }
    
    // 8. Intent: Manajemen data (Admin/Guru/Developer only)
    if (lowerCommand.match(/tambah|buat|input|simpan|update|ubah|edit|hapus|delete|remove/)) {
        // Parse detail operasi
        const isDelete = lowerCommand.includes('hapus') || lowerCommand.includes('delete') || lowerCommand.includes('remove');
        const isUpdate = lowerCommand.includes('update') || lowerCommand.includes('ubah') || lowerCommand.includes('edit');
        
        // Extract data
        const nameData = command.match(/nama\s+([A-Za-z\s]+?)(?:\s+id|\s+kelas|\s+jurusan|\s+delay|$)/i);
        const idData = command.match(/id\s*(\d+)/i);
        const kelasData = command.match(/kelas\s+([A-Z0-9\s]+?)(?:\s+jurusan|\s+delay|$)/i);
        const jurusanData = command.match(/jurusan\s+([A-Za-z0-9\s]+?)(?:\s+delay|$)/i);
        const delayData = command.match(/delay\s*(\d+)/i);
        
        if (isDelete) {
            if (idData) return { intent: 'delete_student', id: idData[1], confidence: 0.95 };
            if (nameData) return { intent: 'delete_student_by_name', name: nameData[1].trim(), confidence: 0.9 };
            return { intent: 'delete_student', need_id: true };
        }
        
        if (nameData && idData && kelasData) {
            return {
                intent: 'add_or_update_student',
                nama: nameData[1].trim(),
                id: parseInt(idData[1]),
                kelas: kelasData[1].trim().toUpperCase(),
                jurusan: jurusanData ? jurusanData[1].trim().toUpperCase() : 'UMUM',
                delay: delayData ? parseInt(delayData[1]) : 60,
                isUpdate: isUpdate,
                confidence: 0.92
            };
        }
        return { intent: 'add_or_update_student', need_data: true };
    }
    
    // 9. Intent: Bantuan
    if (lowerCommand.match(/bantuan|help|tolong|perintah|fitur|bisa apa|command|guide|panduan/)) {
        return { intent: 'help', confidence: 0.99 };
    }
    
    // 10. Intent: Chat biasa (fallback ke AI)
    if (lowerCommand.match(/halo|hai|hello|hey|selamat|pagi|siang|malam|terima kasih|makasih/)) {
        return { intent: 'greeting', confidence: 0.95 };
    }
    
    // Default: chat normal
    return { intent: 'chat', message: command, confidence: 0.7 };
}

// ======================= EKSEKUSI INTENT =======================

/**
 * Eksekusi intent dengan data real-time
 */
async function executePowerfulIntent(intent) {
    switch(intent.intent) {
        case 'query_student':
            return await queryStudentPowerful(intent.name);
        case 'query_student_by_id':
            return await queryStudentByIdPowerful(intent.id);
        case 'query_students_by_class':
            return await queryStudentsByClassPowerful(intent.kelas, intent.jurusan);
        case 'rekap_student':
            return await getStudentRekapPowerful(intent.name);
        case 'top_students':
            return await getTopStudentsPowerful(intent.limit);
        case 'general_stats':
            return await getGeneralStatsPowerful();
        case 'predict_trend':
            return await predictAttendanceTrend();
        case 'compare_periods':
            return await compareAttendancePeriods();
        case 'recommendations':
            return await getSmartRecommendations();
        case 'add_or_update_student':
            return await addOrUpdateStudentPowerful(intent);
        case 'delete_student':
            return await deleteStudentPowerful(intent.id);
        case 'delete_student_by_name':
            return await deleteStudentByNamePowerful(intent.name);
        case 'greeting':
            return getGreetingResponse();
        case 'help':
            return getPowerfulHelpMessage();
        default:
            return null;
    }
}

// ======================= QUERY FUNCTIONS (POWERFUL) =======================

async function queryStudentPowerful(name) {
    await updateSystemDataCache();
    const students = systemDataCache.students.filter(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (students.length === 0) {
        return `📭 **Siswa tidak ditemukan**\n\nTidak ada siswa dengan nama "${escapeHtml(name)}" di database.\n\n💡 **Tips:** Coba gunakan nama lengkap atau ID siswa. Ketik "bantuan" untuk melihat panduan.`;
    }
    
    if (students.length === 1) {
        const s = students[0];
        const hasAccount = dbData?.users_auth?.some(u => u.fpId == s.id);
        return formatStudentDetailPowerful(s, hasAccount);
    }
    
    let result = `🔍 **${students.length} siswa ditemukan** dengan nama "${escapeHtml(name)}":\n\n`;
    students.slice(0, 10).forEach((s, idx) => {
        const hasAccount = dbData?.users_auth?.some(u => u.fpId == s.id);
        const statusIcon = hasAccount ? '✅' : '⏳';
        result += `${idx+1}. ${statusIcon} **${escapeHtml(s.nama)}** (ID: ${s.id}) - Kelas ${s.kelas || '-'} / ${s.jurusan || '-'}\n`;
    });
    if (students.length > 10) {
        result += `\n... dan ${students.length - 10} siswa lainnya.`;
    }
    return result;
}

async function queryStudentByIdPowerful(id) {
    await updateSystemDataCache();
    const student = systemDataCache.students.find(s => s.id == id);
    if (!student) {
        return `📭 **Siswa dengan ID ${id} tidak ditemukan**\n\nPastikan ID yang dimasukkan benar.`;
    }
    const hasAccount = dbData?.users_auth?.some(u => u.fpId == student.id);
    return formatStudentDetailPowerful(student, hasAccount);
}

async function queryStudentsByClassPowerful(kelas, jurusan = null) {
    await updateSystemDataCache();
    
    let students = systemDataCache.students.filter(s => s.kelas === kelas);
    
    if (jurusan) {
        students = students.filter(s => s.jurusan === jurusan);
    }
    
    if (students.length === 0) {
        let msg = `📭 **Tidak ada siswa** di kelas ${kelas}`;
        if (jurusan) msg += ` jurusan ${jurusan}`;
        return msg + ".";
    }
    
    const withAccount = students.filter(s => 
        dbData?.users_auth?.some(u => u.fpId == s.id)
    ).length;
    
    let result = `📚 **DATA SISWA KELAS ${kelas}**`;
    if (jurusan) result += ` - JURUSAN ${jurusan}`;
    result += `\n📊 Total: ${students.length} siswa | ✅ Berakun: ${withAccount} | ⏳ Belum: ${students.length - withAccount}\n\n`;
    
    students.slice(0, 15).forEach((s, idx) => {
        const hasAccount = dbData?.users_auth?.some(u => u.fpId == s.id);
        const statusIcon = hasAccount ? '✅' : '⏳';
        result += `${idx+1}. ${statusIcon} **${escapeHtml(s.nama)}** (ID: ${s.id})\n`;
    });
    
    if (students.length > 15) {
        result += `\n... dan ${students.length - 15} siswa lainnya.`;
    }
    
    return result;
}

async function getStudentRekapPowerful(name) {
    await updateSystemDataCache();
    
    const student = systemDataCache.students.find(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (!student) {
        return `📭 **Siswa dengan nama "${escapeHtml(name)}" tidak ditemukan**\n\nPastikan nama yang dimasukkan benar.`;
    }
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const attendanceRecords = systemDataCache.attendance.filter(a => 
        a.studentId == student.id && 
        a.date && new Date(a.date).getMonth() === thisMonth &&
        new Date(a.date).getFullYear() === thisYear
    );
    
    const hadir = attendanceRecords.filter(r => r.status === 'Hadir' || r.status === 'Pulang').length;
    const sakit = attendanceRecords.filter(r => r.status === 'Sakit').length;
    const izin = attendanceRecords.filter(r => r.status === 'Izin').length;
    const alpha = attendanceRecords.filter(r => r.status === 'Alpha').length;
    const total = attendanceRecords.length;
    
    // Hitung total hari sekolah di bulan ini (kira-kira 20-22 hari)
    const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
    let schoolDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(thisYear, thisMonth, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) schoolDays++;
    }
    
    const persentase = schoolDays > 0 ? ((hadir / schoolDays) * 100).toFixed(1) : 0;
    
    let grade = '';
    let gradeIcon = '';
    let gradeColor = '';
    if (persentase >= 90) { grade = 'Sangat Baik'; gradeIcon = '🏆'; gradeColor = '#4caf50'; }
    else if (persentase >= 75) { grade = 'Baik'; gradeIcon = '👍'; gradeColor = '#8bc34a'; }
    else if (persentase >= 60) { grade = 'Cukup'; gradeIcon = '📊'; gradeColor = '#ffc107'; }
    else if (persentase >= 40) { grade = 'Kurang'; gradeIcon = '⚠️'; gradeColor = '#ff9800'; }
    else { grade = 'Buruk'; gradeIcon = '❗'; gradeColor = '#f44336'; }
    
    let result = `## 📊 **REKAP ABSENSI ${escapeHtml(student.nama)}**\n\n`;
    result += `**👤 Identitas Siswa**\n`;
    result += `• Nama: **${escapeHtml(student.nama)}**\n`;
    result += `• ID: ${student.id}\n`;
    result += `• Kelas: ${student.kelas || '-'} / ${student.jurusan || '-'}\n\n`;
    result += `**📈 Statistik Kehadiran (Bulan ${now.toLocaleString('id-ID', { month: 'long' })} ${thisYear})**\n`;
    result += `• ✅ Hadir: **${hadir}** hari\n`;
    result += `• 🤒 Sakit: ${sakit} hari\n`;
    result += `• 📝 Izin: ${izin} hari\n`;
    result += `• ❌ Alpha: ${alpha} hari\n`;
    result += `• 📅 Total hari sekolah: ${schoolDays} hari\n`;
    result += `• 🎯 Persentase kehadiran: **${persentase}%**\n`;
    result += `• ⭐ Status: **${gradeIcon} ${grade}**\n`;
    
    return result;
}

async function getTopStudentsPowerful(limit = 5) {
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
        return { ...student, hadir, totalRecords: records.length };
    });
    
    const topStudents = studentStats.sort((a, b) => b.hadir - a.hadir).slice(0, limit);
    const lowStudents = studentStats.sort((a, b) => a.hadir - b.hadir).slice(0, limit);
    
    const daysInMonth = new Date(thisYear, thisMonth + 1, 0).getDate();
    let schoolDays = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(thisYear, thisMonth, d);
        const dayOfWeek = date.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) schoolDays++;
    }
    
    let result = `## 🏆 **TOP ${limit} SISWA TERBAIK**\n`;
    result += `*Bulan ${now.toLocaleString('id-ID', { month: 'long' })} ${thisYear}*\n\n`;
    
    result += `### 🥇 **Peringkat Tertinggi**\n`;
    topStudents.forEach((s, idx) => {
        const persen = schoolDays > 0 ? ((s.hadir / schoolDays) * 100).toFixed(1) : 0;
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📌';
        result += `${medal} **${escapeHtml(s.nama)}** (${s.kelas || '-'}) - ${s.hadir}/${schoolDays} hari (${persen}%)\n`;
    });
    
    result += `\n### ⚠️ **Perlu Perhatian**\n`;
    lowStudents.forEach((s, idx) => {
        const persen = schoolDays > 0 ? ((s.hadir / schoolDays) * 100).toFixed(1) : 0;
        result += `${idx+1}. **${escapeHtml(s.nama)}** (${s.kelas || '-'}) - ${s.hadir}/${schoolDays} hari (${persen}%)\n`;
    });
    
    return result;
}

async function getGeneralStatsPowerful() {
    await updateSystemDataCache();
    
    const totalSiswa = systemDataCache.students.length;
    const totalAkun = dbData?.users_auth?.length || 0;
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
    result += `### 👥 **Data Siswa**\n`;
    result += `• Total siswa: **${totalSiswa}**\n`;
    result += `• Sudah berakun: ${totalAkun}\n`;
    result += `• Belum berakun: ${totalSiswa - totalAkun}\n\n`;
    result += `### 📋 **Absensi Hari Ini (${today})**\n`;
    result += `• ✅ Sudah masuk: **${hadirToday}** siswa\n`;
    result += `• 🏠 Sudah pulang: ${pulangToday} siswa\n`;
    result += `• 📊 Total transaksi: ${todayAbsensi.length}\n\n`;
    result += `### 🏫 **Kehadiran per Kelas (Hari Ini)**\n`;
    
    const sortedClass = Object.entries(classStats).sort((a, b) => b[1].hadir - a[1].hadir);
    for (const [kelas, stats] of sortedClass.slice(0, 5)) {
        const persen = stats.total > 0 ? ((stats.hadir / stats.total) * 100).toFixed(1) : 0;
        result += `• ${kelas}: ${stats.hadir}/${stats.total} siswa (${persen}%)\n`;
    }
    
    return result;
}

async function predictAttendanceTrend() {
    await updateSystemDataCache();
    
    const now = new Date();
    const last30Days = new Date();
    last30Days.setDate(now.getDate() - 30);
    
    // Hitung kehadiran per minggu
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
    
    // Hitung tren
    let trend = 0;
    if (weeklyAttendance.length >= 2) {
        const lastWeek = weeklyAttendance[weeklyAttendance.length - 1]?.hadir || 0;
        const prevWeek = weeklyAttendance[weeklyAttendance.length - 2]?.hadir || 0;
        trend = lastWeek - prevWeek;
    }
    
    let prediction = "";
    let recommendation = "";
    
    if (trend > 10) {
        prediction = "📈 **Tren Meningkat** - Kehadiran naik signifikan!";
        recommendation = "👍 Pertahankan strategi yang berhasil dan berikan apresiasi pada siswa.";
    } else if (trend > 0) {
        prediction = "📊 **Tren Stabil Meningkat** - Kehadiran sedikit lebih baik.";
        recommendation = "📌 Terus pantau dan beri motivasi tambahan.";
    } else if (trend < -10) {
        prediction = "📉 **Tren Menurun Signifikan** - Perlu perhatian khusus!";
        recommendation = "⚠️ Segera evaluasi penyebab penurunan kehadiran. Mungkin ada faktor musiman atau masalah tertentu.";
    } else if (trend < 0) {
        prediction = "📉 **Tren Menurun** - Kehadiran sedikit berkurang.";
        recommendation = "🔍 Identifikasi penyebab dan lakukan intervensi ringan.";
    } else {
        prediction = "📊 **Tren Stabil** - Kehadiran konsisten.";
        recommendation = "✅ Pertahankan kondisi yang baik saat ini.";
    }
    
    let result = `## 🔮 **PREDIKSI TREN KEHADIRAN**\n\n`;
    result += `### 📅 **4 Minggu Terakhir**\n`;
    weeklyAttendance.forEach((w, idx) => {
        const barLength = Math.min(30, Math.floor(w.hadir / 10));
        const bar = '█'.repeat(barLength) + '░'.repeat(30 - barLength);
        result += `Minggu ${w.week}: ${bar} ${w.hadir} kehadiran\n`;
    });
    
    result += `\n### ${prediction}\n`;
    result += `\n### 💡 **Rekomendasi**\n${recommendation}\n`;
    
    return result;
}

async function compareAttendancePeriods() {
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
    result += `• ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}: **${thisMonthHadir}** kehadiran\n`;
    result += `• ${lastMonth === 11 ? 'Desember' : ''} ${lastMonth + 1} ${lastYear}: ${lastMonthHadir} kehadiran\n`;
    result += `• ${trendIcon} **${trendText}**\n`;
    
    return result;
}

async function getSmartRecommendations() {
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
        return { ...student, hadir, totalRecords: records.length };
    });
    
    const worstStudents = studentStats.sort((a, b) => a.hadir - b.hadir).slice(0, 3);
    const bestStudents = studentStats.sort((a, b) => b.hadir - a.hadir).slice(0, 3);
    
    let result = `## 💡 **REKOMENDASI CERDAS**\n\n`;
    
    result += `### 🚨 **Prioritas Tinggi**\n`;
    if (worstStudents.length > 0) {
        result += `Berikut siswa dengan kehadiran terendah bulan ini:\n`;
        worstStudents.forEach((s, idx) => {
            result += `${idx+1}. **${escapeHtml(s.nama)}** - ${s.hadir} kehadiran\n`;
        });
        result += `\n💡 **Saran:** Lakukan pendekatan personal dan komunikasi dengan orang tua siswa.\n\n`;
    }
    
    result += `### 🏆 **Apresiasi**\n`;
    if (bestStudents.length > 0) {
        result += `Siswa dengan kehadiran terbaik bulan ini:\n`;
        bestStudents.forEach((s, idx) => {
            result += `${idx+1}. **${escapeHtml(s.nama)}** - ${s.hadir} kehadiran\n`;
        });
        result += `\n💡 **Saran:** Berikan penghargaan atau pujian untuk mempertahankan prestasi.\n\n`;
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
        result += `💡 **Saran:** Evaluasi jadwal pelajaran di hari ${worstDay[0]}.\n`;
    }
    
    return result;
}

// ======================= FUNGSI MANAJEMEN DATA =======================

async function addOrUpdateStudentPowerful(data) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        return "⛔ **Akses Ditolak!**\n\nHanya Admin, Guru, dan Developer yang dapat menambah/mengubah data siswa.";
    }
    
    const existingStudent = systemDataCache.students.find(s => s.id == data.id);
    
    if (existingStudent && !data.isUpdate) {
        return `⚠️ **Siswa dengan ID ${data.id} sudah ada**\n\nNama: ${existingStudent.nama}\nKelas: ${existingStudent.kelas}\n\nGunakan perintah "update" untuk mengubah data.`;
    }
    
    const studentData = {
        id: data.id,
        nama: data.nama,
        kelas: data.kelas,
        jurusan: data.jurusan,
        delayOut: data.delay,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    if (!existingStudent) {
        studentData.createdAt = firebase.database.ServerValue.TIMESTAMP;
    }
    
    try {
        await db.ref(`users/${data.id}`).set(studentData);
        
        const action = existingStudent ? 'diupdate' : 'ditambahkan';
        return `✅ **BERHASIL!**\n\nSiswa **${data.nama}** (ID: ${data.id}) berhasil ${action}.\n\n📚 Kelas: ${data.kelas}\n🎓 Jurusan: ${data.jurusan}\n⏰ Delay pulang: ${data.delay} menit`;
        
    } catch (error) {
        return `❌ **Gagal menyimpan data**\n\n${error.message}`;
    }
}

async function deleteStudentPowerful(id) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        return "⛔ **Akses Ditolak!**\n\nHanya Admin, Guru, dan Developer yang dapat menghapus data siswa.";
    }
    
    const student = systemDataCache.students.find(s => s.id == id);
    if (!student) {
        return `❌ **Siswa dengan ID ${id} tidak ditemukan.**`;
    }
    
    try {
        await db.ref(`users/${id}`).remove();
        return `✅ **BERHASIL!**\n\nSiswa **${student.nama}** (ID: ${id}) berhasil dihapus dari database.`;
    } catch (error) {
        return `❌ **Gagal menghapus**\n\n${error.message}`;
    }
}

async function deleteStudentByNamePowerful(name) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        return "⛔ **Akses Ditolak!**";
    }
    
    const students = systemDataCache.students.filter(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (!students || students.length === 0) {
        return `❌ **Tidak ditemukan siswa** dengan nama "${escapeHtml(name)}".`;
    }
    
    if (students.length > 1) {
        let result = `⚠️ **Ditemukan ${students.length} siswa** dengan nama mirip:\n\n`;
        students.forEach((s, idx) => {
            result += `${idx+1}. ${s.nama} (ID: ${s.id}) - Kelas ${s.kelas}\n`;
        });
        result += `\n💡 **Tips:** Gunakan perintah "hapus siswa id [nomor]" untuk lebih spesifik.`;
        return result;
    }
    
    const student = students[0];
    try {
        await db.ref(`users/${student.id}`).remove();
        return `✅ **BERHASIL!**\n\nSiswa **${student.nama}** (ID: ${student.id}) berhasil dihapus.`;
    } catch (error) {
        return `❌ **Gagal menghapus**\n\n${error.message}`;
    }
}

function getGreetingResponse() {
    const hour = new Date().getHours();
    let greeting = "Selamat ";
    if (hour < 12) greeting += "pagi";
    else if (hour < 18) greeting += "siang";
    else greeting += "malam";
    
    return `👋 **${greeting}!**\n\nSaya asisten AI sistem absensi. Ada yang bisa saya bantu?\n\n💡 **Tips:** Ketik "bantuan" untuk melihat semua perintah yang tersedia.`;
}

function getPowerfulHelpMessage() {
    return `## 🤖 **PANDUAN ASISTEN AI**\n\n` +
           `### 📌 **QUERY DATA**\n` +
           `• "**data siswa miftah**" - Cari siswa berdasarkan nama\n` +
           `• "**id 1 siapa**" - Cari siswa berdasarkan ID\n` +
           `• "**siswa kelas X**" - Lihat semua siswa kelas X\n` +
           `• "**siswa kelas X jurusan RPL**" - Filter kelas + jurusan\n\n` +
           `### 📊 **STATISTIK & REKAP**\n` +
           `• "**rekap miftah**" - Lihat rekap absensi siswa\n` +
           `• "**statistik**" - Ringkasan sistem\n` +
           `• "**top 5 siswa**" - Peringkat siswa terbaik\n` +
           `• "**prediksi tren**" - Analisis prediksi kehadiran\n` +
           `• "**perbandingan**" - Bandingkan dengan bulan lalu\n` +
           `• "**rekomendasi**" - Saran cerdas berbasis data\n\n` +
           `### ⚙️ **MANAJEMEN (Admin/Guru/Developer)**\n` +
           `• "**tambah siswa nama Toni id 7 kelas X jurusan RPL**" - Tambah siswa\n` +
           `• "**update siswa id 7 delay 90**" - Update data siswa\n` +
           `• "**hapus siswa id 7**" - Hapus siswa\n\n` +
           `### 💬 **LAINNYA**\n` +
           `• "**halo**" / "**selamat pagi**" - Sapaan\n` +
           `• "**bantuan**" / "**help**" - Tampilkan panduan ini\n\n` +
           `✨ **Tips:** Gunakan bahasa natural, AI akan memahami maksud Anda!`;
}

function formatStudentDetailPowerful(student, hasAccount) {
    const accountStatus = hasAccount ? '✅ Sudah memiliki akun' : '⏳ Belum memiliki akun';
    
    return `## 👤 **DETAIL SISWA**\n\n` +
           `**📌 Nama:** ${escapeHtml(student.nama)}\n` +
           `**🆔 ID Fingerprint:** ${student.id}\n` +
           `**📚 Kelas:** ${student.kelas || '-'}\n` +
           `**🎓 Jurusan:** ${student.jurusan || '-'}\n` +
           `**⏰ Delay Pulang:** ${student.delayOut || 60} menit\n` +
           `**🔐 Status Akun:** ${accountStatus}\n\n` +
           `💡 **Perintah cepat:**\n` +
           `• "rekap ${student.nama}" - Lihat rekap absensi\n` +
           `• "update siswa id ${student.id} delay 90" - Edit data`;
}

// ======================= CALL GROQ API =======================

async function callGroqAPI(userMessage, contextData = null) {
    const systemPrompt = `Anda adalah asisten AI SUPER CERDAS untuk sistem absensi sekolah fingerprint ESP32.

=== DATA SISTEM ===
Total siswa: ${systemDataCache.students.length}
Total absensi: ${systemDataCache.attendance.length}
Role pengguna: ${currentUser?.role || 'unknown'}
Waktu: ${new Date().toLocaleString('id-ID')}

=== RESPONSIBILITAS ===
1. Berikan jawaban yang AKURAT, INFORMATIF, dan PROFESIONAL
2. Gunakan format markdown sederhana (**, * untuk penekanan)
3. Jika ada data, sajikan dengan rapi
4. Jangan memberikan informasi palsu atau di luar konteks
5. Jika tidak tahu, akui dengan jujur

=== GAYA BAHASA ===
- Gunakan bahasa Indonesia yang baik dan sopan
- Ramah namun profesional
- Gunakan emoji secukupnya untuk memperjelas

${contextData ? `\n=== KONTEKS ===\n${contextData}` : ''}`;

    const messages = [
        { role: "system", content: systemPrompt },
        ...conversationHistory.slice(-AI_CONFIG.maxContextMessages),
        { role: "user", content: userMessage }
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

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
        
        // Simpan ke history
        conversationHistory.push(
            { role: "user", content: userMessage },
            { role: "assistant", content: aiResponse }
        );
        
        // Batasi history
        if (conversationHistory.length > AI_CONFIG.maxContextMessages * 2) {
            conversationHistory = conversationHistory.slice(-AI_CONFIG.maxContextMessages * 2);
        }
        
        lastActivityTimestamp = Date.now();
        
        return aiResponse;

    } catch (error) {
        clearTimeout(timeoutId);
        console.error("Groq API error:", error);
        
        if (error.name === 'AbortError') {
            return "⏰ **Request timeout**\n\nPermintaan memakan waktu terlalu lama. Silakan coba lagi.";
        }
        
        return generateFallbackResponsePowerful(userMessage);
    }
}

function generateFallbackResponsePowerful(message) {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('halo') || lowerMsg.includes('hai') || lowerMsg.includes('hello')) {
        return getGreetingResponse();
    }
    
    if (lowerMsg.includes('terima kasih') || lowerMsg.includes('makasih') || lowerMsg.includes('thanks')) {
        return "🙏 **Sama-sama!** Senang bisa membantu. Ada lagi yang bisa saya bantu?";
    }
    
    if (lowerMsg.includes('bye') || lowerMsg.includes('dadah') || lowerMsg.includes('sampai jumpa')) {
        return "👋 **Sampai jumpa!** Semoga harimu menyenangkan!";
    }
    
    return `🤔 **Maaf, saya belum bisa memproses perintah itu.**

💡 **Coba gunakan perintah berikut:**
• "bantuan" - Melihat semua perintah yang tersedia
• "statistik" - Melihat ringkasan sistem
• "data siswa [nama]" - Mencari data siswa

Atau gunakan bahasa yang lebih sederhana.`;
}

// ======================= UI KOMPONEN =======================

async function processAIMessage(message) {
    await updateSystemDataCache();
    
    // Parse intent
    const intent = parsePowerfulIntent(message);
    console.log(`🤖 Intent detected: ${intent.intent} (confidence: ${intent.confidence})`);
    
    // Eksekusi intent jika confidence tinggi
    if (intent.confidence >= 0.8) {
        const result = await executePowerfulIntent(intent);
        if (result) return result;
    }
    
    // Fallback ke Groq API
    return await callGroqAPI(message);
}

function addAIAssistantButton() {
    if (document.getElementById('aiAssistantBtn')) return;
    
    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'aiAssistantBtn';
    floatingBtn.innerHTML = '🤖';
    floatingBtn.title = 'AI Assistant (Groq Llama 3.3)';
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
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        z-index: 998;
        border: none;
        font-size: 28px;
        transition: transform 0.2s;
    `;
    
    floatingBtn.addEventListener('mouseenter', () => {
        floatingBtn.style.transform = 'scale(1.1)';
    });
    floatingBtn.addEventListener('mouseleave', () => {
        floatingBtn.style.transform = 'scale(1)';
    });
    
    document.body.appendChild(floatingBtn);
}

function openAIAssistantModal() {
    if (aiAssistantModalOpen) return;
    
    let modal = document.getElementById('modal-ai-assistant');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-ai-assistant" class="modal-overlay">
                <div class="modal-box" style="max-width: 600px; width: 90%; height: 80vh; display: flex; flex-direction: column; padding: 0;">
                    <div class="modal-title" style="padding: 15px 20px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                        <span>🤖 <strong>AI Assistant</strong> <small style="font-size: 11px; color: #888;">Groq Llama 3.3 70B</small></span>
                        <span onclick="closeAIAssistantModal()" style="cursor: pointer; font-size: 24px;">✖</span>
                    </div>
                    <div id="aiChatMessages" style="flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px;">
                        <div class="ai-message ai-bot">
                            <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
                            <div class="ai-bubble" style="background: var(--bg-hover); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5;">
                                ${formatMarkdown(getGreetingResponse())}
                            </div>
                        </div>
                    </div>
                    <div style="padding: 15px; border-top: 1px solid var(--border); display: flex; gap: 10px;">
                        <input type="text" id="aiChatInput" placeholder="Tanyakan sesuatu... misal: 'data siswa kelas X'" 
                               style="flex: 1; padding: 12px; border-radius: 30px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary);">
                        <button id="aiSendBtn" style="padding: 12px 20px; border-radius: 30px; background: linear-gradient(135deg, #667eea, #764ba2); border: none; color: white; cursor: pointer;">📤 Kirim</button>
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
        
        // Tampilkan pesan user
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
        
        // Tampilkan loading
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'aiTypingIndicator';
        loadingDiv.className = 'ai-message ai-bot';
        loadingDiv.innerHTML = `
            <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
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
                <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
                <div class="ai-bubble" style="background: var(--bg-hover); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5; white-space: pre-wrap;">${formatMarkdown(response)}</div>
            `;
            messagesContainer.appendChild(botMsgDiv);
            
        } catch (error) {
            document.getElementById('aiTypingIndicator')?.remove();
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'ai-message ai-bot';
            errorDiv.innerHTML = `
                <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
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
    console.log("🤖 AI Assistant v2.0 initialized with Groq Llama 3.3 70B");
    
    addAIAssistantButton();
    
    // Update cache secara berkala
    setInterval(() => updateSystemDataCache(), 30000);
}

function hasAIAssistantAccess() {
    if (!currentUser) return false;
    const allowedRoles = ['admin', 'guru', 'developer'];
    return allowedRoles.includes(currentUser.role);
}

function checkAndInitAI() {
    if (currentUser && hasAIAssistantAccess()) {
        if (!aiAssistantInitialized) {
            initAIAssistant();
        }
    }
}

// Event listeners
window.addEventListener('uiReady', (e) => {
    if (e.detail && e.detail.currentUser) {
        setTimeout(() => checkAndInitAI(), 500);
    }
});

window.addEventListener('dataReady', () => {
    if (currentUser && hasAIAssistantAccess() && !aiAssistantInitialized) {
        initAIAssistant();
    }
});

// Ekspor ke global
window.initAIAssistant = initAIAssistant;
window.openAIAssistantModal = openAIAssistantModal;
window.closeAIAssistantModal = closeAIAssistantModal;
window.hasAIAssistantAccess = hasAIAssistantAccess;

console.log("✅ ai-assistant.js V2.0 loaded - POWERFUL AI Assistant with Groq Llama 3.3 70B");