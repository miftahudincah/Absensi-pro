// ai-assistant.js - VERSION 1.0 (POWERFUL AI ASSISTANT)
// Asisten AI untuk membantu operasional sistem absensi
// Mendukung: Groq (Llama 3) dan OpenAI (GPT-4o-mini) dengan auto-fallback
// Fitur: Query data siswa, rekap absensi, manajemen data, dll.
// ============================================================================

// ======================= KONFIGURASI API =======================

// OpenAI API Key (terenkripsi base64)
const OPENAI_ENCRYPTED = "c2stcHJvai0zSHlLZjdUNkJNNktkdFhkeGZ1UWxSYjFTUEJwTmx1S3Jva2U3TnJ3UldaZExCSkNIdG0tVUpSSzBnaDdYaXdUVHlWb29md3pzbVRrM0JsbGJGSk1Gb2t1azVZdnhjNkVIZ1NxWnlJMnlmN01YNWJid0FZZ1ZrYjVKclZEbk5BSE54aFlRd3V6ZUpNdUZRS3pUS2ExZU9YcnE4aUlB";

// Groq API Key
const GROQ_API_KEY = "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";

// Pilihan provider (priority: OpenAI > Groq > Fallback)
let AI_ASSISTANT_PROVIDER = 'openai'; // 'openai', 'groq', 'fallback'

// Inisialisasi
let aiAssistantInitialized = false;
let aiAssistantModalOpen = false;
let chatHistory = [];

// ======================= UTILITY FUNCTIONS =======================

function decryptOpenAIKey() {
    try {
        return atob(OPENAI_ENCRYPTED);
    } catch(e) {
        console.error("Failed to decrypt OpenAI key");
        return null;
    }
}

// ======================= PARSING PERINTAH ALAMIAH =======================

/**
 * Parse natural language command untuk menentukan intent
 */
function parseIntent(command) {
    const lowerCommand = command.toLowerCase();
    
    // Intent: Cari data siswa
    if (lowerCommand.match(/data siswa|siapa|tampilkan siswa|cari siswa|siswa dengan nama|siswa bernama/)) {
        // Ekstrak nama siswa
        const nameMatch = command.match(/(?:nama|siswa|bernama)?\s*["']?([A-Za-z\s]+)["']?(?:\s|$)/i);
        if (nameMatch && nameMatch[1] && nameMatch[1].length > 2) {
            return { intent: 'query_student', name: nameMatch[1].trim() };
        }
        // Ekstrak ID siswa
        const idMatch = command.match(/id\s*(\d+)/i);
        if (idMatch) {
            return { intent: 'query_student_by_id', id: idMatch[1] };
        }
        return { intent: 'query_student', need_name: true };
    }
    
    // Intent: Data siswa per kelas
    if (lowerCommand.match(/siswa kelas|kelas\s+([a-z0-9\s]+)|data kelas/)) {
        const kelasMatch = command.match(/kelas\s+([A-Z0-9\s]+)/i);
        if (kelasMatch) {
            let kelas = kelasMatch[1].trim().toUpperCase();
            // Cek apakah ada jurusan
            const jurusanMatch = command.match(/jurusan\s+([A-Za-z0-9\s]+)/i);
            return { 
                intent: 'query_students_by_class', 
                kelas: kelas,
                jurusan: jurusanMatch ? jurusanMatch[1].trim().toUpperCase() : null
            };
        }
        return { intent: 'query_students_by_class', need_class: true };
    }
    
    // Intent: Rekap siswa
    if (lowerCommand.match(/rekap|absensi|kehadiran|persentase/)) {
        const nameMatch = command.match(/(?:siswa|rekap)?\s*["']?([A-Za-z\s]+)["']?(?:\s|$)/i);
        if (nameMatch && nameMatch[1] && nameMatch[1].length > 2) {
            return { intent: 'rekap_student', name: nameMatch[1].trim() };
        }
        return { intent: 'rekap_student', need_name: true };
    }
    
    // Intent: Siswa paling prestasi / terbaik
    if (lowerCommand.match(/paling prestasi|terbaik|tertinggi|juara|ranking|top siswa/)) {
        const limitMatch = command.match(/(\d+)\s+(?:siswa|orang|terbaik|teratas)/i);
        const limit = limitMatch ? parseInt(limitMatch[1]) : 5;
        return { intent: 'top_students', limit: Math.min(limit, 20) };
    }
    
    // Intent: Tambah/update data siswa
    if (lowerCommand.match(/tambah|buat|input|simpan|update|ubah|edit.*siswa/)) {
        // Ekstrak nama
        const nameMatch = command.match(/nama\s+([A-Za-z\s]+?)(?:\s+id|\s+kelas|\s+jurusan|\s+delay|$)/i);
        // Ekstrak ID
        const idMatch = command.match(/id\s*(\d+)/i);
        // Ekstrak kelas
        const kelasMatch = command.match(/kelas\s+([A-Z0-9\s]+?)(?:\s+jurusan|\s+delay|$)/i);
        // Ekstrak jurusan
        const jurusanMatch = command.match(/jurusan\s+([A-Za-z0-9\s]+?)(?:\s+delay|$)/i);
        // Ekstrak delay
        const delayMatch = command.match(/delay\s*(\d+)/i);
        
        if (nameMatch && idMatch && kelasMatch) {
            return {
                intent: 'add_or_update_student',
                nama: nameMatch[1].trim(),
                id: parseInt(idMatch[1]),
                kelas: kelasMatch[1].trim().toUpperCase(),
                jurusan: jurusanMatch ? jurusanMatch[1].trim().toUpperCase() : 'UMUM',
                delay: delayMatch ? parseInt(delayMatch[1]) : 60,
                isUpdate: lowerCommand.includes('update') || lowerCommand.includes('ubah') || lowerCommand.includes('edit')
            };
        }
        return { intent: 'add_or_update_student', need_data: true };
    }
    
    // Intent: Hapus siswa
    if (lowerCommand.match(/hapus|delete|remove.*siswa/)) {
        const idMatch = command.match(/id\s*(\d+)/i);
        const nameMatch = command.match(/siswa\s+["']?([A-Za-z\s]+)["']?/i);
        if (idMatch) {
            return { intent: 'delete_student', id: parseInt(idMatch[1]) };
        }
        if (nameMatch) {
            return { intent: 'delete_student_by_name', name: nameMatch[1].trim() };
        }
        return { intent: 'delete_student', need_id: true };
    }
    
    // Intent: Statistik umum
    if (lowerCommand.match(/statistik|ringkasan|gambaran|dashboard|info singkat/)) {
        return { intent: 'general_stats' };
    }
    
    // Intent: Bantuan
    if (lowerCommand.match(/bantuan|help|tolong|command|perintah|fitur|bisa apa/)) {
        return { intent: 'help' };
    }
    
    // Intent: Chat normal (fallback ke AI)
    return { intent: 'chat', message: command };
}

// ======================= EKSEKUSI INTENT =======================

/**
 * Eksekusi intent berdasarkan hasil parsing
 */
async function executeIntent(intent) {
    switch(intent.intent) {
        case 'query_student':
            return await queryStudent(intent.name);
        case 'query_student_by_id':
            return await queryStudentById(intent.id);
        case 'query_students_by_class':
            return await queryStudentsByClass(intent.kelas, intent.jurusan);
        case 'rekap_student':
            return await getStudentRekap(intent.name);
        case 'top_students':
            return await getTopStudents(intent.limit);
        case 'add_or_update_student':
            return await addOrUpdateStudent(intent);
        case 'delete_student':
            return await deleteStudent(intent.id);
        case 'delete_student_by_name':
            return await deleteStudentByName(intent.name);
        case 'general_stats':
            return await getGeneralStats();
        case 'help':
            return getHelpMessage();
        default:
            return null;
    }
}

// ======================= FUNGSI QUERY DATA =======================

async function queryStudent(name) {
    if (!dbData || !dbData.users) {
        return "⚠️ Data siswa belum tersedia. Silakan tunggu sebentar.";
    }
    
    const students = dbData.users.filter(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (students.length === 0) {
        return `📭 Tidak ditemukan siswa dengan nama mengandung "${name}".`;
    }
    
    if (students.length === 1) {
        const s = students[0];
        const hasAccount = dbData.users_auth?.some(u => u.fpId == s.id);
        return formatStudentDetail(s, hasAccount);
    }
    
    let result = `🔍 Ditemukan ${students.length} siswa dengan nama mengandung "${name}":\n\n`;
    students.forEach((s, idx) => {
        result += `${idx+1}. **${s.nama}** (ID: ${s.id}) - Kelas ${s.kelas || '-'} / ${s.jurusan || '-'}\n`;
    });
    return result;
}

async function queryStudentById(id) {
    if (!dbData || !dbData.users) {
        return "⚠️ Data siswa belum tersedia.";
    }
    
    const student = dbData.users.find(s => s.id == id);
    if (!student) {
        return `📭 Tidak ditemukan siswa dengan ID ${id}.`;
    }
    
    const hasAccount = dbData.users_auth?.some(u => u.fpId == student.id);
    return formatStudentDetail(student, hasAccount);
}

async function queryStudentsByClass(kelas, jurusan = null) {
    if (!dbData || !dbData.users) {
        return "⚠️ Data siswa belum tersedia.";
    }
    
    let students = dbData.users.filter(s => s.kelas === kelas);
    
    if (jurusan) {
        students = students.filter(s => s.jurusan === jurusan);
    }
    
    if (students.length === 0) {
        let msg = `📭 Tidak ditemukan siswa di kelas ${kelas}`;
        if (jurusan) msg += ` jurusan ${jurusan}`;
        return msg + ".";
    }
    
    // Hitung jumlah yang sudah punya akun
    const withAccount = students.filter(s => 
        dbData.users_auth?.some(u => u.fpId == s.id)
    ).length;
    
    let result = `📚 **DATA SISWA KELAS ${kelas}**`;
    if (jurusan) result += ` - JURUSAN ${jurusan}`;
    result += `\n📊 Total: ${students.length} siswa | ✅ Berakun: ${withAccount} | ❌ Belum: ${students.length - withAccount}\n\n`;
    
    students.slice(0, 15).forEach((s, idx) => {
        const hasAccount = dbData.users_auth?.some(u => u.fpId == s.id);
        const statusIcon = hasAccount ? '✅' : '❌';
        result += `${idx+1}. ${statusIcon} **${s.nama}** (ID: ${s.id}) - Delay: ${s.delayOut || 60} menit\n`;
    });
    
    if (students.length > 15) {
        result += `\n... dan ${students.length - 15} siswa lainnya.`;
    }
    
    return result;
}

async function getStudentRekap(name) {
    if (!dbData || !dbData.users || !dbData.attendance) {
        return "⚠️ Data absensi belum tersedia.";
    }
    
    const student = dbData.users.find(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (!student) {
        return `📭 Tidak ditemukan siswa dengan nama "${name}".`;
    }
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const attendanceRecords = dbData.attendance.filter(a => 
        a.studentId == student.id && 
        a.date && new Date(a.date).getMonth() === thisMonth &&
        new Date(a.date).getFullYear() === thisYear
    );
    
    const hadir = attendanceRecords.filter(r => r.status === 'Hadir' || r.status === 'Pulang').length;
    const sakit = attendanceRecords.filter(r => r.status === 'Sakit').length;
    const izin = attendanceRecords.filter(r => r.status === 'Izin').length;
    const alpha = attendanceRecords.filter(r => r.status === 'Alpha').length;
    const total = attendanceRecords.length;
    
    const totalSchoolDays = 20; // Asumsi
    const persentase = totalSchoolDays > 0 ? ((hadir / totalSchoolDays) * 100).toFixed(1) : 0;
    
    let grade = '';
    if (persentase >= 90) grade = '🏆 Sangat Baik';
    else if (persentase >= 75) grade = '👍 Baik';
    else if (persentase >= 60) grade = '📊 Cukup';
    else if (persentase >= 40) grade = '⚠️ Kurang';
    else grade = '❗ Buruk';
    
    let result = `📊 **REKAP ABSENSI BULAN INI**\n`;
    result += `\n👤 Nama: **${student.nama}** (ID: ${student.id})`;
    result += `\n📚 Kelas: ${student.kelas || '-'} / ${student.jurusan || '-'}`;
    result += `\n\n📈 **Statistik Kehadiran:**`;
    result += `\n✅ Hadir: ${hadir} hari`;
    result += `\n🤒 Sakit: ${sakit} hari`;
    result += `\n📝 Izin: ${izin} hari`;
    result += `\n❌ Alpha: ${alpha} hari`;
    result += `\n📊 Total transaksi: ${total}`;
    result += `\n🎯 Persentase kehadiran: **${persentase}%**`;
    result += `\n⭐ Status: **${grade}**`;
    
    return result;
}

async function getTopStudents(limit = 5) {
    if (!dbData || !dbData.users || !dbData.attendance) {
        return "⚠️ Data belum tersedia.";
    }
    
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const monthAttendance = dbData.attendance.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });
    
    const studentStats = dbData.users.map(student => {
        const records = monthAttendance.filter(a => a.studentId == student.id);
        const hadir = records.filter(r => r.status === 'Hadir' || r.status === 'Pulang').length;
        return { ...student, hadir, totalRecords: records.length };
    });
    
    const topStudents = studentStats.sort((a, b) => b.hadir - a.hadir).slice(0, limit);
    const lowStudents = studentStats.sort((a, b) => a.hadir - b.hadir).slice(0, limit);
    
    let result = `🏆 **TOP ${limit} SISWA DENGAN KEHADIRAN TERTINGGI BULAN INI** 🏆\n\n`;
    topStudents.forEach((s, idx) => {
        const totalSchoolDays = 20;
        const persen = totalSchoolDays > 0 ? ((s.hadir / totalSchoolDays) * 100).toFixed(1) : 0;
        result += `${idx+1}. **${s.nama}** (${s.kelas || '-'}) - ${s.hadir} hari hadir (${persen}%)\n`;
    });
    
    result += `\n⚠️ **${limit} SISWA DENGAN KEHADIRAN TERENDAH** ⚠️\n\n`;
    lowStudents.forEach((s, idx) => {
        const totalSchoolDays = 20;
        const persen = totalSchoolDays > 0 ? ((s.hadir / totalSchoolDays) * 100).toFixed(1) : 0;
        result += `${idx+1}. **${s.nama}** (${s.kelas || '-'}) - ${s.hadir} hari hadir (${persen}%)\n`;
    });
    
    return result;
}

// ======================= FUNGSI MANAJEMEN DATA =======================

async function addOrUpdateStudent(data) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        return "⛔ Akses ditolak! Hanya Admin, Guru, dan Developer yang dapat menambah/mengubah data siswa.";
    }
    
    const existingStudent = dbData.users?.find(s => s.id == data.id);
    
    if (existingStudent && !data.isUpdate) {
        return `⚠️ Siswa dengan ID ${data.id} sudah ada (${existingStudent.nama}). Gunakan perintah "update" untuk mengubah data.`;
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
        return `✅ **BERHASIL!**\n\nSiswa ${data.nama} (ID: ${data.id}) berhasil ${action}.\n📚 Kelas: ${data.kelas}\n🎓 Jurusan: ${data.jurusan}\n⏰ Delay pulang: ${data.delay} menit`;
        
    } catch (error) {
        return `❌ Gagal menyimpan data: ${error.message}`;
    }
}

async function deleteStudent(id) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        return "⛔ Akses ditolak! Hanya Admin, Guru, dan Developer yang dapat menghapus data siswa.";
    }
    
    const student = dbData.users?.find(s => s.id == id);
    if (!student) {
        return `❌ Siswa dengan ID ${id} tidak ditemukan.`;
    }
    
    try {
        await db.ref(`users/${id}`).remove();
        return `✅ **BERHASIL!**\n\nSiswa ${student.nama} (ID: ${id}) berhasil dihapus dari database.`;
    } catch (error) {
        return `❌ Gagal menghapus: ${error.message}`;
    }
}

async function deleteStudentByName(name) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        return "⛔ Akses ditolak!";
    }
    
    const students = dbData.users?.filter(s => 
        s.nama && s.nama.toLowerCase().includes(name.toLowerCase())
    );
    
    if (!students || students.length === 0) {
        return `❌ Tidak ditemukan siswa dengan nama "${name}".`;
    }
    
    if (students.length > 1) {
        let result = `⚠️ Ditemukan ${students.length} siswa dengan nama mirip:\n`;
        students.forEach((s, idx) => {
            result += `${idx+1}. ${s.nama} (ID: ${s.id}) - Kelas ${s.kelas}\n`;
        });
        result += `\nSilakan sebutkan ID spesifik: "hapus siswa id [nomor]"`;
        return result;
    }
    
    const student = students[0];
    try {
        await db.ref(`users/${student.id}`).remove();
        return `✅ Siswa ${student.nama} (ID: ${student.id}) berhasil dihapus.`;
    } catch (error) {
        return `❌ Gagal menghapus: ${error.message}`;
    }
}

async function getGeneralStats() {
    if (!dbData || !dbData.users || !dbData.attendance) {
        return "⚠️ Data belum tersedia.";
    }
    
    const totalSiswa = dbData.users.filter(s => s && s.nama && s.nama !== 'Tidak Diketahui').length;
    const totalAkun = dbData.users_auth?.length || 0;
    const totalAbsensi = dbData.attendance.length;
    
    const today = new Date().toISOString().split('T')[0];
    const todayAbsensi = dbData.attendance.filter(a => a.date === today);
    const hadirToday = todayAbsensi.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    const pulangToday = todayAbsensi.filter(a => a.status === 'Pulang').length;
    
    // Hitung rata-rata kehadiran bulan ini
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const monthAttendance = dbData.attendance.filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });
    const totalHadirBulan = monthAttendance.filter(a => a.status === 'Hadir' || a.status === 'Pulang').length;
    const rataKehadiran = totalSiswa > 0 ? ((totalHadirBulan / (totalSiswa * 20)) * 100).toFixed(1) : 0;
    
    let result = `📊 **STATISTIK SISTEM ABSENSI**\n\n`;
    result += `👥 **Data Siswa**\n`;
    result += `   ├─ Total siswa: ${totalSiswa} orang\n`;
    result += `   ├─ Sudah punya akun: ${totalAkun} orang\n`;
    result += `   └─ Belum punya akun: ${totalSiswa - totalAkun} orang\n\n`;
    result += `📋 **Absensi Hari Ini (${today})**\n`;
    result += `   ├─ ✅ Sudah masuk: ${hadirToday} siswa\n`;
    result += `   ├─ 🏠 Sudah pulang: ${pulangToday} siswa\n`;
    result += `   └─ 📊 Total transaksi: ${todayAbsensi.length}\n\n`;
    result += `📈 **Bulan Ini**\n`;
    result += `   ├─ Rata-rata kehadiran: ${rataKehadiran}%\n`;
    result += `   └─ Total transaksi: ${monthAttendance.length}\n`;
    
    return result;
}

function getHelpMessage() {
    return `🤖 **ASISTEN AI - PANDUAN PERINTAH**

📌 **QUERY DATA SISWA**
• "data siswa miftah" - Cari siswa dengan nama
• "id 1 siapa" - Cari siswa berdasarkan ID
• "siswa kelas X" - Lihat semua siswa kelas X
• "siswa kelas X jurusan RPL" - Filter kelas + jurusan

📌 **REKAP & STATISTIK**
• "rekap miftah" - Lihat rekap absensi siswa
• "siswa paling prestasi" - Top 5 siswa terbaik
• "statistik" - Ringkasan sistem

📌 **MANAJEMEN DATA (Admin/Guru/Developer)**
• "buat data siswa baru nama Titin id 8 kelas X jurusan Dev" - Tambah siswa
• "update siswa id 8 delay 90" - Update data siswa
• "hapus siswa id 8" - Hapus siswa

📌 **LAINNYA**
• "bantuan" / "help" - Tampilkan panduan ini

💡 **Tips:** Gunakan bahasa natural, AI akan memahami maksud Anda!`;
}

// ======================= FORMAT RESPON =======================

function formatStudentDetail(student, hasAccount) {
    const accountStatus = hasAccount ? '✅ Sudah memiliki akun' : '❌ Belum memiliki akun';
    
    return `👤 **DETAIL SISWA**

📌 **Nama:** ${student.nama}
🆔 **ID Fingerprint:** ${student.id}
📚 **Kelas:** ${student.kelas || '-'}
🎓 **Jurusan:** ${student.jurusan || '-'}
⏰ **Delay Pulang:** ${student.delayOut || 60} menit
🔐 **Status Akun:** ${accountStatus}

💡 **Tips:** 
• Untuk lihat rekap: "rekap ${student.nama}"
• Untuk edit data: "update siswa id ${student.id}"`;
}

// ======================= CALL AI API (Groq + OpenAI) =======================

async function callAIAssistant(userMessage, contextData = null) {
    // Coba OpenAI dulu
    if (AI_ASSISTANT_PROVIDER === 'openai') {
        try {
            const result = await callOpenAIChat(userMessage, contextData);
            if (result) {
                return { provider: 'OpenAI (GPT-4o-mini)', response: result };
            }
        } catch(e) {
            console.log("OpenAI error, switching to Groq:", e.message);
            AI_ASSISTANT_PROVIDER = 'groq';
        }
    }
    
    // Coba Groq
    if (AI_ASSISTANT_PROVIDER === 'groq') {
        try {
            const result = await callGroqChat(userMessage, contextData);
            if (result) {
                return { provider: 'Groq (Llama 3)', response: result };
            }
        } catch(e) {
            console.log("Groq error, using fallback:", e.message);
            AI_ASSISTANT_PROVIDER = 'fallback';
        }
    }
    
    // Fallback: respons sederhana
    return { 
        provider: 'Intelligent Response (Offline)', 
        response: generateFallbackResponse(userMessage) 
    };
}

async function callOpenAIChat(userMessage, contextData) {
    const openaiKey = decryptOpenAIKey();
    if (!openaiKey) throw new Error("OpenAI key not available");
    
    const systemPrompt = `Anda adalah asisten AI untuk sistem absensi sekolah fingerprint ESP32. 
Anda membantu guru dan admin dalam mengelola data siswa, absensi, dan rekap kehadiran.

=== DATA SISTEM SAAT INI ===
Total siswa: ${dbData?.users?.length || 0}
Total akun: ${dbData?.users_auth?.length || 0}
Total absensi: ${dbData?.attendance?.length || 0}
Role pengguna: ${currentUser?.role || 'unknown'}

=== RESPONSIBILITAS ANDA ===
1. Bantu menjawab pertanyaan tentang data siswa
2. Berikan rekomendasi berdasarkan data absensi
3. Bantu operasional sehari-hari (tambah/edit/hapus data)
4. Gunakan bahasa Indonesia yang ramah dan profesional
5. Jika user meminta aksi (tambah/edit/hapus), konfirmasi dulu

=== BATASAN ===
- Anda TIDAK bisa mengakses data pribadi di luar sistem
- Anda harus patuh pada aturan keamanan dan privasi
- Jangan memberikan saran yang membahayakan

${contextData ? `\n=== KONTEKS TAMBAHAN ===\n${contextData}` : ''}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 1000
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        return result.choices[0]?.message?.content || null;
        
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

async function callGroqChat(userMessage, contextData) {
    const systemPrompt = `Anda adalah asisten AI untuk sistem absensi sekolah. 
Data: ${dbData?.users?.length || 0} siswa, ${dbData?.attendance?.length || 0} absensi.
Role user: ${currentUser?.role || 'unknown'}
Bantu dengan ramah dan profesional.`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: 'llama3-70b-8192',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.7,
                max_tokens: 1000
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        return result.choices[0]?.message?.content || null;
        
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

function generateFallbackResponse(message) {
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('halo') || lowerMsg.includes('hai') || lowerMsg.includes('hello')) {
        return "👋 Halo! Ada yang bisa saya bantu? Silakan tanyakan data siswa, rekap absensi, atau statistik sistem.";
    }
    
    if (lowerMsg.includes('terima kasih') || lowerMsg.includes('makasih') || lowerMsg.includes('thanks')) {
        return "🙏 Sama-sama! Senang bisa membantu. Ada lagi yang bisa saya bantu?";
    }
    
    if (lowerMsg.includes('bye') || lowerMsg.includes('dadah') || lowerMsg.includes('sampai jumpa')) {
        return "👋 Sampai jumpa! Semoga harimu menyenangkan!";
    }
    
    return "🤔 Maaf, saya belum bisa memproses perintah itu. Ketik 'bantuan' untuk melihat daftar perintah yang tersedia.";
}

// ======================= UI KOMPONEN =======================

function addAIAssistantButton() {
    if (document.getElementById('aiAssistantBtn')) return;
    
    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'aiAssistantBtn';
    floatingBtn.innerHTML = '💬';
    floatingBtn.title = 'AI Assistant';
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
                        <span>🤖 AI Assistant <small style="font-size: 11px; color: #888;" id="aiProviderBadge">Ready</small></span>
                        <span onclick="closeAIAssistantModal()" style="cursor: pointer; font-size: 24px;">✖</span>
                    </div>
                    <div id="aiChatMessages" style="flex: 1; overflow-y: auto; padding: 15px; display: flex; flex-direction: column; gap: 12px;">
                        <div class="ai-message ai-bot">
                            <div class="ai-avatar">🤖</div>
                            <div class="ai-bubble">
                                Halo! Saya asisten AI untuk sistem absensi.<br>
                                Saya bisa membantu:<br>
                                • Mencari data siswa<br>
                                • Melihat rekap absensi<br>
                                • Menampilkan statistik<br>
                                • Membantu operasional (tambah/edit/hapus data)<br><br>
                                <strong>Ketik "bantuan" untuk melihat semua perintah!</strong>
                            </div>
                        </div>
                    </div>
                    <div style="padding: 15px; border-top: 1px solid var(--border); display: flex; gap: 10px;">
                        <input type="text" id="aiChatInput" placeholder="Tanyakan sesuatu... misal: 'data siswa kelas X'" 
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
    
    const sendMessage = async () => {
        const message = input.value.trim();
        if (!message) return;
        
        addChatMessage(message, 'user');
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;
        
        addChatTypingIndicator();
        
        try {
            // Parse intent dan eksekusi
            const intent = parseIntent(message);
            let response = await executeIntent(intent);
            
            if (!response) {
                // Jika bukan intent spesifik, panggil AI
                const aiResult = await callAIAssistant(message);
                response = aiResult.response;
                const providerBadge = document.getElementById('aiProviderBadge');
                if (providerBadge) providerBadge.textContent = aiResult.provider;
            }
            
            removeChatTypingIndicator();
            addChatMessage(response, 'bot');
            
        } catch (error) {
            console.error("AI Assistant error:", error);
            removeChatTypingIndicator();
            addChatMessage("⚠️ Maaf, terjadi kesalahan. Silakan coba lagi nanti.", 'bot');
        } finally {
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    };
    
    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => {
        if (e.key === 'Enter') sendMessage();
    };
    
    input.focus();
}

function addChatMessage(message, sender) {
    const container = document.getElementById('aiChatMessages');
    if (!container) return;
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-message ai-${sender}`;
    msgDiv.style.cssText = `
        display: flex;
        gap: 10px;
        ${sender === 'user' ? 'flex-direction: row-reverse;' : ''}
    `;
    
    if (sender === 'bot') {
        msgDiv.innerHTML = `
            <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #00bcd4, #2196f3); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
            <div class="ai-bubble" style="background: var(--bg-hover); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5; white-space: pre-wrap;">${formatMessageWithMarkdown(message)}</div>
        `;
    } else {
        msgDiv.innerHTML = `
            <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: var(--primary); display: flex; align-items: center; justify-content: center; font-size: 20px;">👤</div>
            <div class="ai-bubble" style="background: var(--primary); padding: 10px 15px; border-radius: 18px; max-width: 80%; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(message)}</div>
        `;
    }
    
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

function addChatTypingIndicator() {
    const container = document.getElementById('aiChatMessages');
    if (!container) return;
    
    const typingDiv = document.createElement('div');
    typingDiv.id = 'aiTypingIndicator';
    typingDiv.className = 'ai-message ai-bot';
    typingDiv.innerHTML = `
        <div class="ai-avatar" style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #00bcd4, #2196f3); display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
        <div class="ai-bubble" style="background: var(--bg-hover); padding: 12px 18px; border-radius: 18px;">
            <span class="typing-dot">.</span><span class="typing-dot">.</span><span class="typing-dot">.</span>
        </div>
    `;
    
    container.appendChild(typingDiv);
    container.scrollTop = container.scrollHeight;
}

function removeChatTypingIndicator() {
    const typing = document.getElementById('aiTypingIndicator');
    if (typing) typing.remove();
}

function formatMessageWithMarkdown(text) {
    if (!text) return '';
    
    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Line breaks
    text = text.replace(/\n/g, '<br>');
    
    // Bullet points
    text = text.replace(/^• (.*?)$/gm, '<li>$1</li>');
    text = text.replace(/<\/li><li>/g, '</li><li>');
    if (text.includes('<li>')) {
        text = text.replace(/(<li>.*?<\/li>)/s, '<ul>$1</ul>');
    }
    
    return text;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
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
    console.log("🤖 AI Assistant initialized for role:", currentUser.role);
    
    addAIAssistantButton();
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

console.log("✅ ai-assistant.js V1.0 loaded - Powerful AI Assistant with Groq + OpenAI");