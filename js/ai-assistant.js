// ==================== AI ASSISTANT CORE - VERSION 6.0 ====================
// Fully Integrated with Database (Siswa, Absensi, Staff, Rekap)
// ============================================================================

// Backend Configuration
const AI_BACKEND_URL = 'https://backendtest-azure.vercel.app';
const AI_API_ENDPOINTS = {
    groq: `${AI_BACKEND_URL}/api/ai/groq`,
    openai: `${AI_BACKEND_URL}/api/ai/openai`
};

// AI State
let aiMessagesHistory = [];
let aiIsLoading = false;
let aiCurrentModel = 'groq';

// DOM Elements for AI Modal
let aiChatContainer = null;
let aiMessageInput = null;
let aiSendBtn = null;
let aiClearBtn = null;
let aiModelSelect = null;

// Cache for database queries
let aiDataCache = {
    students: [],
    attendance: [],
    staff: [],
    users_auth: [],
    lastUpdate: 0
};
const AI_CACHE_TTL = 30000; // 30 detik cache

// ==================== HELPER FUNCTIONS ====================

function getFormattedTimeAI() {
    return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtmlAI(text) {
    if (!text) return '';
    const temp = document.createElement('div');
    temp.textContent = text;
    return temp.innerHTML;
}

function scrollAIChatToBottom() {
    if (aiChatContainer) {
        aiChatContainer.scrollTop = aiChatContainer.scrollHeight;
    }
}

// ==================== DATABASE HELPER FUNCTIONS ====================

/**
 * Refresh cache data dari database
 */
async function refreshAIDataCache() {
    const now = Date.now();
    if (now - aiDataCache.lastUpdate < AI_CACHE_TTL && aiDataCache.students.length > 0) {
        console.log("📊 Using cached AI data (age:", (now - aiDataCache.lastUpdate)/1000, "s)");
        return aiDataCache;
    }
    
    console.log("📊 Refreshing AI data cache from database...");
    
    try {
        // Ambil data siswa
        const studentsSnapshot = await db.ref('users').once('value');
        const studentsData = studentsSnapshot.val();
        aiDataCache.students = [];
        if (studentsData) {
            Object.keys(studentsData).forEach(key => {
                aiDataCache.students.push({ id: key, ...studentsData[key] });
            });
        }
        
        // Ambil data absensi (hanya 30 hari terakhir untuk efisiensi)
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        const startDate = thirtyDaysAgo.toISOString().split('T')[0];
        const endDate = today.toISOString().split('T')[0];
        
        const attendanceSnapshot = await db.ref('absensi').once('value');
        const attendanceData = attendanceSnapshot.val();
        aiDataCache.attendance = [];
        if (attendanceData) {
            Object.keys(attendanceData).forEach(date => {
                if (date >= startDate && date <= endDate) {
                    const dailyRecords = attendanceData[date];
                    if (dailyRecords) {
                        Object.keys(dailyRecords).forEach(id => {
                            const record = dailyRecords[id];
                            if (record) {
                                aiDataCache.attendance.push({
                                    id: date + "-" + id,
                                    studentId: id,
                                    date: date,
                                    timeIn: record.in,
                                    timeOut: record.out,
                                    nama: record.nama,
                                    kelas: record.kelas,
                                    jurusan: record.jurusan,
                                    status: record.out ? "Pulang" : "Hadir"
                                });
                            }
                        });
                    }
                }
            });
        }
        
        // Ambil data staff
        const staffSnapshot = await db.ref('staff').once('value');
        const staffData = staffSnapshot.val();
        aiDataCache.staff = [];
        if (staffData) {
            Object.keys(staffData).forEach(key => {
                aiDataCache.staff.push({ id: key, ...staffData[key] });
            });
        }
        
        // Ambil data user auth
        const userAuthSnapshot = await db.ref('users_auth').once('value');
        const userAuthData = userAuthSnapshot.val();
        aiDataCache.users_auth = [];
        if (userAuthData) {
            Object.keys(userAuthData).forEach(key => {
                aiDataCache.users_auth.push({ uid: key, ...userAuthData[key] });
            });
        }
        
        aiDataCache.lastUpdate = Date.now();
        console.log(`✅ AI cache refreshed: ${aiDataCache.students.length} students, ${aiDataCache.attendance.length} attendance, ${aiDataCache.staff.length} staff`);
        return aiDataCache;
        
    } catch (error) {
        console.error("Error refreshing AI data cache:", error);
        // Gunakan dbData jika tersedia
        if (typeof dbData !== 'undefined' && dbData) {
            aiDataCache.students = dbData.users || [];
            aiDataCache.attendance = dbData.attendance || [];
            aiDataCache.users_auth = dbData.users_auth || [];
            aiDataCache.lastUpdate = Date.now();
        }
        return aiDataCache;
    }
}

/**
 * Format data ke tabel Markdown
 */
function formatTableAI(headers, rows) {
    if (!rows || rows.length === 0) return 'Tidak ada data.';
    
    let table = '| ' + headers.join(' | ') + ' |\n';
    table += '| ' + headers.map(() => '---').join(' | ') + ' |\n';
    
    rows.forEach(row => {
        table += '| ' + row.map(cell => cell || '-').join(' | ') + ' |\n';
    });
    
    return table;
}

/**
 * Format data ke list Markdown
 */
function formatListAI(items, label = '') {
    if (!items || items.length === 0) return 'Tidak ada data.';
    return items.map((item, i) => `${i+1}. ${item}`).join('\n');
}

// ==================== AI COMMAND PROCESSOR ====================

/**
 * Proses perintah AI dan query database
 */
async function processAICommand(userMessage) {
    const lowerMsg = userMessage.toLowerCase().trim();
    
    // Cek kata kunci untuk query database
    const isDataSiswa = lowerMsg.includes('data siswa') || lowerMsg.includes('siswa') || lowerMsg.includes('tampilkan siswa');
    const isCariSiswa = lowerMsg.includes('cari siswa') || lowerMsg.includes('cari') || lowerMsg.includes('id');
    const isRekap = lowerMsg.includes('rekap') || lowerMsg.includes('statistik') || lowerMsg.includes('ringkasan');
    const isKelas = lowerMsg.includes('kelas') && (lowerMsg.includes('x') || lowerMsg.includes('vii') || lowerMsg.includes('viii') || lowerMsg.includes('ix') || lowerMsg.includes('x') || lowerMsg.includes('xi') || lowerMsg.includes('xii'));
    const isJurusan = lowerMsg.includes('jurusan') || lowerMsg.includes('rpl') || lowerMsg.includes('tkj') || lowerMsg.includes('multimedia') || lowerMsg.includes('akuntansi');
    const isStaff = lowerMsg.includes('staff') || lowerMsg.includes('guru') || lowerMsg.includes('karyawan');
    const isHadir = lowerMsg.includes('hadir') || lowerMsg.includes('absensi') || lowerMsg.includes('kehadiran');
    const isBantuan = lowerMsg.includes('bantuan') || lowerMsg.includes('help') || lowerMsg.includes('tolong');
    const isStatistik = lowerMsg.includes('statistik') || lowerMsg.includes('grafik') || lowerMsg.includes('chart');
    const isPerSiswa = lowerMsg.includes('per siswa') || lowerMsg.includes('siswa id') || lowerMsg.includes('id ') || lowerMsg.match(/id\s*[0-9]+/);
    
    // Refresh cache
    await refreshAIDataCache();
    
    // ============ PER SISWA (Cari berdasarkan ID) ============
    if (isPerSiswa) {
        const idMatch = userMessage.match(/id\s*[:#]?\s*([0-9]+)/i);
        if (idMatch) {
            const studentId = idMatch[1];
            const student = aiDataCache.students.find(s => s.id == studentId);
            if (student) {
                // Ambil absensi siswa
                const studentAttendance = aiDataCache.attendance.filter(a => a.studentId == studentId);
                const hadir = studentAttendance.filter(a => a.status === 'Hadir').length;
                const pulang = studentAttendance.filter(a => a.status === 'Pulang').length;
                const total = studentAttendance.length;
                
                let response = `📋 **Data Siswa ID #${student.id}**\n\n`;
                response += `👤 **Nama:** ${student.nama}\n`;
                response += `📚 **Kelas:** ${student.kelas || '-'}\n`;
                response += `🎓 **Jurusan:** ${student.jurusan || '-'}\n`;
                response += `⏰ **Delay Pulang:** ${student.delayOut || 60} menit\n\n`;
                response += `📊 **Statistik Absensi:**\n`;
                response += `• ✅ Hadir: ${hadir} kali\n`;
                response += `• 🏠 Pulang: ${pulang} kali\n`;
                response += `• 📝 Total: ${total} transaksi\n`;
                
                // Ambil data akun jika ada
                const userAuth = aiDataCache.users_auth.find(u => u.fpId == studentId);
                if (userAuth) {
                    response += `\n🔐 **Akun:** ${userAuth.email || '-'} (${userAuth.role || '-'})`;
                } else {
                    response += `\n🔐 **Akun:** ❌ Belum terdaftar`;
                }
                
                return response;
            } else {
                return `❌ Siswa dengan ID #${studentId} tidak ditemukan.`;
            }
        }
    }
    
    // ============ DATA SISWA ============
    if (isDataSiswa || isCariSiswa) {
        // Ekstrak nama atau kata kunci
        let searchTerm = '';
        const nameMatch = userMessage.match(/siswa\s+([a-zA-Z\s]+)/i);
        if (nameMatch) {
            searchTerm = nameMatch[1].trim().toLowerCase();
        }
        
        let filteredStudents = aiDataCache.students;
        
        // Filter berdasarkan kelas
        if (isKelas) {
            const kelasMatch = userMessage.match(/kelas\s*([a-z0-9\s]+)/i);
            if (kelasMatch) {
                const kelas = kelasMatch[1].trim().toUpperCase();
                filteredStudents = filteredStudents.filter(s => s.kelas === kelas);
            }
        }
        
        // Filter berdasarkan jurusan
        if (isJurusan) {
            const jurusanMatch = userMessage.match(/jurusan\s*([a-z0-9\s]+)/i);
            if (jurusanMatch) {
                const jurusan = jurusanMatch[1].trim().toUpperCase();
                filteredStudents = filteredStudents.filter(s => s.jurusan === jurusan);
            }
        }
        
        // Filter berdasarkan nama
        if (searchTerm) {
            filteredStudents = filteredStudents.filter(s => 
                s.nama && s.nama.toLowerCase().includes(searchTerm)
            );
        }
        
        if (filteredStudents.length === 0) {
            return '📭 Tidak ada siswa yang ditemukan dengan kriteria tersebut.';
        }
        
        if (filteredStudents.length > 50) {
            return `📊 Terdapat **${filteredStudents.length}** siswa. Untuk detail, gunakan filter spesifik seperti "siswa kelas X" atau "siswa jurusan RPL".`;
        }
        
        let response = `📋 **Data Siswa (${filteredStudents.length} ditemukan)**\n\n`;
        const headers = ['ID', 'Nama', 'Kelas', 'Jurusan', 'Delay'];
        const rows = filteredStudents.map(s => [
            s.id,
            s.nama || '-',
            s.kelas || '-',
            s.jurusan || '-',
            `${s.delayOut || 60} menit`
        ]);
        response += formatTableAI(headers, rows);
        return response;
    }
    
    // ============ REKAP / STATISTIK ============
    if (isRekap || isStatistik || isHadir) {
        const today = new Date().toISOString().split('T')[0];
        const todayAttendance = aiDataCache.attendance.filter(a => a.date === today);
        const hadirToday = todayAttendance.filter(a => a.status === 'Hadir').length;
        const pulangToday = todayAttendance.filter(a => a.status === 'Pulang').length;
        const totalSiswa = aiDataCache.students.length;
        const persenHadir = totalSiswa > 0 ? ((hadirToday / totalSiswa) * 100).toFixed(1) : 0;
        
        // Hitung per kelas
        const kelasStats = {};
        aiDataCache.students.forEach(s => {
            const kelas = s.kelas || 'Tanpa Kelas';
            if (!kelasStats[kelas]) {
                kelasStats[kelas] = { total: 0, hadir: 0 };
            }
            kelasStats[kelas].total++;
        });
        todayAttendance.forEach(a => {
            const student = aiDataCache.students.find(s => s.id == a.studentId);
            if (student && student.kelas) {
                if (kelasStats[student.kelas]) {
                    kelasStats[student.kelas].hadir++;
                }
            }
        });
        
        let response = `📊 **REKAP ABSENSI**\n\n`;
        response += `📅 **Tanggal:** ${today}\n`;
        response += `👥 **Total Siswa:** ${totalSiswa}\n`;
        response += `✅ **Hadir Hari Ini:** ${hadirToday} (${persenHadir}%)\n`;
        response += `🏠 **Pulang:** ${pulangToday}\n`;
        response += `📝 **Total Transaksi:** ${todayAttendance.length}\n\n`;
        
        // Statistik per kelas
        response += `🏫 **Kehadiran per Kelas:**\n`;
        const kelasEntries = Object.entries(kelasStats);
        if (kelasEntries.length > 0) {
            const kelasRows = kelasEntries.map(([kelas, stats]) => [
                kelas,
                stats.total,
                stats.hadir,
                stats.total > 0 ? ((stats.hadir / stats.total) * 100).toFixed(1) + '%' : '0%'
            ]);
            response += formatTableAI(['Kelas', 'Total', 'Hadir', 'Persentase'], kelasRows);
        } else {
            response += 'Belum ada data kelas.\n';
        }
        
        return response;
    }
    
    // ============ DATA STAFF ============
    if (isStaff) {
        if (aiDataCache.staff.length === 0) {
            return '📭 Belum ada data staff.';
        }
        
        let response = `👥 **Data Staff (${aiDataCache.staff.length})**\n\n`;
        const headers = ['ID', 'Nama', 'Jabatan', 'Departemen'];
        const rows = aiDataCache.staff.map(s => [
            s.id,
            s.nama || '-',
            s.jabatan || '-',
            s.departemen || '-'
        ]);
        response += formatTableAI(headers, rows);
        return response;
    }
    
    // ============ BANTUAN ============
    if (isBantuan) {
        return `🤖 **Perintah yang Didukung AI Assistant:**

📋 **Data Siswa:**
• "data siswa" - Lihat semua siswa
• "siswa kelas X" - Filter berdasarkan kelas
• "siswa jurusan RPL" - Filter berdasarkan jurusan
• "cari siswa [nama]" - Cari siswa by nama
• "id 5" - Detail siswa berdasarkan ID

📊 **Rekap & Statistik:**
• "rekap" - Ringkasan absensi hari ini
• "statistik" - Statistik kehadiran per kelas
• "kehadiran" - Status kehadiran hari ini

👥 **Data Staff:**
• "data staff" - Lihat semua staff

💡 **Bantuan Lain:**
• "bantuan" atau "help" - Tampilkan ini

🔍 **Contoh:**
• "data siswa kelas X"
• "siswa jurusan RPL"
• "id 5"
• "rekap hari ini"
• "cari siswa miftah"
• "data staff"

---
📱 *Saya dapat membantu Anda dengan data sistem absensi secara real-time!*`;
    }
    
    // ============ JIKA TIDAK ADA KOMANDO YANG COCOK ============
    return null; // Lanjut ke AI backend
}

// ==================== RENDER MESSAGES ====================

function renderAIChatMessages() {
    if (!aiChatContainer) return;
    
    aiChatContainer.innerHTML = '';
    
    for (const msg of aiMessagesHistory) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ${msg.role === 'user' ? 'ai-user' : 'ai-bot'}`;
        
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'ai-avatar';
        avatarDiv.textContent = msg.role === 'user' ? '👤' : '🤖';
        
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'ai-bubble';
        bubbleDiv.innerHTML = formatAIMessage(msg.content);
        
        messageDiv.appendChild(avatarDiv);
        messageDiv.appendChild(bubbleDiv);
        aiChatContainer.appendChild(messageDiv);
    }
    
    scrollAIChatToBottom();
}

/**
 * Format pesan AI dengan Markdown sederhana
 */
function formatAIMessage(text) {
    if (!text) return '';
    
    // Escape HTML dulu
    let html = escapeHtmlAI(text);
    
    // Bold: **teks**
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Italic: *teks* (tapi jangan bold)
    html = html.replace(/\*(?!\*)(.*?)\*(?!\*)/g, '<em>$1</em>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    // Table formatting (sederhana)
    // | header | header |
    // | --- | --- |
    // | data | data |
    const lines = html.split('<br>');
    let inTable = false;
    let tableRows = [];
    let tableHeaders = [];
    let tableHtml = '';
    let result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('|') && line.endsWith('|')) {
            const cells = line.split('|').filter(c => c.trim() !== '');
            const cleanCells = cells.map(c => c.trim());
            
            // Cek apakah ini header separator (|---|)
            if (cleanCells.every(c => /^---*$/.test(c))) {
                // Ini adalah separator, skip
                continue;
            }
            
            if (!inTable) {
                inTable = true;
                tableHeaders = cleanCells;
                tableRows = [];
            } else {
                tableRows.push(cleanCells);
            }
        } else {
            if (inTable) {
                // Tutup table
                tableHtml = `<table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:0.9rem;">`;
                tableHtml += `<thead><tr>${tableHeaders.map(h => `<th style="border:1px solid var(--border); padding:8px 12px; background:var(--bg-hover); text-align:left;">${h}</th>`).join('')}</tr></thead>`;
                tableHtml += `<tbody>`;
                tableRows.forEach(row => {
                    tableHtml += `<tr>${row.map(c => `<td style="border:1px solid var(--border); padding:8px 12px;">${c}</td>`).join('')}</tr>`;
                });
                tableHtml += `</tbody></table>`;
                
                result.push(tableHtml);
                tableHtml = '';
                inTable = false;
                tableHeaders = [];
                tableRows = [];
            }
            
            if (line) {
                result.push(line);
            }
        }
    }
    
    // Jika masih ada table yang belum ditutup
    if (inTable) {
        tableHtml = `<table style="width:100%; border-collapse:collapse; margin:10px 0; font-size:0.9rem;">`;
        tableHtml += `<thead><tr>${tableHeaders.map(h => `<th style="border:1px solid var(--border); padding:8px 12px; background:var(--bg-hover); text-align:left;">${h}</th>`).join('')}</tr></thead>`;
        tableHtml += `<tbody>`;
        tableRows.forEach(row => {
            tableHtml += `<tr>${row.map(c => `<td style="border:1px solid var(--border); padding:8px 12px;">${c}</td>`).join('')}</tr>`;
        });
        tableHtml += `</tbody></table>`;
        result.push(tableHtml);
    }
    
    return result.join('<br>');
}

// ==================== TYPING INDICATOR ====================

let aiTypingElement = null;

function showAITypingIndicator() {
    removeAITypingIndicator();
    
    const typingDiv = document.createElement('div');
    typingDiv.className = 'ai-message ai-bot';
    typingDiv.id = 'aiTypingIndicator';
    
    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'ai-avatar';
    avatarDiv.textContent = '🤖';
    
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'ai-bubble ai-typing';
    bubbleDiv.innerHTML = '<span></span><span></span><span></span>';
    
    typingDiv.appendChild(avatarDiv);
    typingDiv.appendChild(bubbleDiv);
    
    if (aiChatContainer) {
        aiChatContainer.appendChild(typingDiv);
        scrollAIChatToBottom();
    }
    aiTypingElement = typingDiv;
}

function removeAITypingIndicator() {
    if (aiTypingElement) {
        aiTypingElement.remove();
        aiTypingElement = null;
    }
    const existing = document.getElementById('aiTypingIndicator');
    if (existing) existing.remove();
}

// ==================== CALL AI BACKEND ====================

async function callAIBackendAPI(userMessage, conversationHistory) {
    const endpoint = AI_API_ENDPOINTS[aiCurrentModel];
    if (!endpoint) throw new Error('Model AI tidak dikenali');
    
    const payload = {
        message: userMessage,
        history: conversationHistory
    };
    
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Gagal mendapatkan respons dari AI');
    }
    
    if (!data.response) throw new Error('Tidak ada balasan dari AI');
    
    return data.response;
}

// ==================== SEND MESSAGE ====================

async function handleAISendMessage() {
    if (aiIsLoading) return;
    
    const rawMessage = aiMessageInput ? aiMessageInput.value.trim() : '';
    if (rawMessage === '') return;
    
    // Clear input
    aiMessageInput.value = '';
    aiMessageInput.style.height = 'auto';
    
    // Add user message
    const userMessageObj = { role: 'user', content: rawMessage };
    aiMessagesHistory.push(userMessageObj);
    renderAIChatMessages();
    
    aiIsLoading = true;
    if (aiSendBtn) aiSendBtn.disabled = true;
    showAITypingIndicator();
    
    try {
        // ============ PROSES PERINTAH DATABASE ============
        const dbResponse = await processAICommand(rawMessage);
        
        if (dbResponse) {
            // Response dari database langsung
            removeAITypingIndicator();
            const assistantObj = { role: 'assistant', content: dbResponse };
            aiMessagesHistory.push(assistantObj);
            renderAIChatMessages();
        } else {
            // ============ PROSES VIA AI BACKEND ============
            // Prepare history for backend
            const historyForAI = aiMessagesHistory.slice(0, -1).map(m => ({
                role: m.role,
                content: m.content
            }));
            
            const aiResponse = await callAIBackendAPI(rawMessage, historyForAI);
            removeAITypingIndicator();
            const assistantObj = { role: 'assistant', content: aiResponse };
            aiMessagesHistory.push(assistantObj);
            renderAIChatMessages();
        }
    } catch (error) {
        console.error('AI Chat Error:', error);
        removeAITypingIndicator();
        
        let errorMessage = `⚠️ Gagal: ${error.message}`;
        if (error.message && error.message.includes('GROQ_API_KEY not configured')) {
            errorMessage = `🚫 **GROQ API Key Belum Dikonfigurasi**\n\nAdmin harus menambahkan GROQ_API_KEY di environment variables Vercel.\n\n💡 Solusi:\n1. Login ke dashboard Vercel\n2. Pilih project backend\n3. Settings → Environment Variables\n4. Tambahkan GROQ_API_KEY dengan nilai API key yang valid\n5. Redeploy project\n\nAtau coba gunakan model OpenAI jika sudah dikonfigurasi.`;
        } else if (error.message && error.message.includes('OPENAI_API_KEY')) {
            errorMessage = `⚠️ **OpenAI API Key Tidak Ditemukan**\n\nSilakan pilih model GROQ atau minta admin menambahkan OPENAI_API_KEY.`;
        } else if (error.message && error.message.includes('fetch')) {
            errorMessage = `⚠️ **Koneksi ke Backend Gagal**\n\nPastikan backend berjalan dan terhubung ke internet.\n\n💡 Backend URL: ${AI_BACKEND_URL}`;
        }
        
        const errorAssistant = { role: 'assistant', content: errorMessage };
        aiMessagesHistory.push(errorAssistant);
        renderAIChatMessages();
    } finally {
        aiIsLoading = false;
        if (aiSendBtn) aiSendBtn.disabled = false;
        if (aiMessageInput) aiMessageInput.focus();
    }
}

// ==================== RESET CHAT ====================

function resetAIChatHistory() {
    if (aiIsLoading) return;
    
    const welcomeMessage = `Halo! Saya **Asisten AI Sistem Absensi IoT** 👋

Saya dapat membantu Anda dengan berbagai hal terkait sistem absensi:

✨ **Fitur yang saya kuasai:**
• 🔍 Mencari dan menampilkan data siswa
• 📊 Rekap absensi harian/mingguan/bulanan
• 📈 Statistik kehadiran dalam bentuk grafik
• 🔐 Informasi reset password (Email + WhatsApp)
• 📱 Panduan penggunaan sistem
• 👥 Data staff dan kehadiran

💡 **Contoh pertanyaan:**
• "tampilkan data siswa kelas X"
• "rekap absensi hari ini"
• "statistik kehadiran minggu ini"
• "cara reset password"
• "bantuan absensi"
• "id 5" (detail siswa)

📊 **Data Real-Time:**
• Data siswa: ${aiDataCache.students.length} siswa
• Absensi hari ini: ${aiDataCache.attendance.filter(a => a.date === new Date().toISOString().split('T')[0]).length} transaksi
• Staff: ${aiDataCache.staff.length} orang

Siap membantu Anda 24/7! Silakan tanyakan apa saja 😊`;
    
    aiMessagesHistory = [
        { role: 'assistant', content: welcomeMessage }
    ];
    renderAIChatMessages();
    
    updateAIProviderBadge();
}

// ==================== UPDATE PROVIDER BADGE ====================

function updateAIProviderBadge() {
    const badge = document.getElementById('aiProviderBadge');
    if (badge) {
        if (aiCurrentModel === 'groq') {
            badge.textContent = '⚡ GROQ (Llama 3.3 70B)';
            badge.style.color = '#10b981';
        } else {
            badge.textContent = '✨ OpenAI (GPT-4o-mini)';
            badge.style.color = '#3b82f6';
        }
    }
}

// ==================== CHECK BACKEND STATUS ====================

async function checkAIBackendStatus() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(`${AI_BACKEND_URL}/api/health`, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const health = await response.json();
            console.log('✅ Backend Status:', health.services);
            
            if (health.services) {
                if (!health.services.groq && aiCurrentModel === 'groq') {
                    console.warn('⚠️ GROQ API tidak aktif');
                }
                if (!health.services.openai && aiCurrentModel === 'openai') {
                    console.warn('⚠️ OpenAI API tidak aktif');
                }
            }
        } else {
            console.warn('⚠️ Backend health check gagal');
        }
    } catch (error) {
        console.warn('⚠️ Tidak dapat menjangkau backend:', error.message);
    }
}

// ==================== MODEL CHANGE HANDLER ====================

function handleAIModelChange() {
    if (!aiModelSelect) return;
    
    const newModel = aiModelSelect.value;
    if (newModel !== aiCurrentModel && !aiIsLoading) {
        aiCurrentModel = newModel;
        updateAIProviderBadge();
        
        const switchMsg = {
            role: 'assistant',
            content: `🔄 Model AI diubah menjadi **${aiCurrentModel === 'groq' ? 'GROQ (Llama 3.3 70B)' : 'OpenAI GPT-4o-mini'}**. Percakapan berlanjut dengan konteks yang sama.`
        };
        aiMessagesHistory.push(switchMsg);
        renderAIChatMessages();
    } else if (aiIsLoading) {
        aiModelSelect.value = aiCurrentModel;
    }
}

// ==================== BIND EVENTS ====================

function bindAIEvents() {
    if (aiSendBtn) {
        aiSendBtn.addEventListener('click', handleAISendMessage);
    }
    
    if (aiClearBtn) {
        aiClearBtn.addEventListener('click', resetAIChatHistory);
    }
    
    if (aiMessageInput) {
        aiMessageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!aiIsLoading && aiMessageInput.value.trim() !== '') {
                    handleAISendMessage();
                }
            }
        });
        
        aiMessageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });
    }
    
    if (aiModelSelect) {
        aiModelSelect.addEventListener('change', handleAIModelChange);
    }
}

// ==================== INITIALIZE AI ASSISTANT ====================

function initializeAIAssistant() {
    console.log("🤖 Initializing AI Assistant with Database Integration...");
    
    // Get DOM elements
    aiChatContainer = document.getElementById('aiChatMessages');
    aiMessageInput = document.getElementById('aiChatInput');
    aiSendBtn = document.getElementById('aiSendBtn');
    aiClearBtn = document.getElementById('aiClearChatBtn');
    aiModelSelect = document.getElementById('aiModelSelect');
    
    if (!aiChatContainer) {
        console.warn("AI Chat container not found");
        return;
    }
    
    // Reset state
    aiMessagesHistory = [];
    aiIsLoading = false;
    
    // Set default model from select if exists
    if (aiModelSelect) {
        aiCurrentModel = aiModelSelect.value;
    }
    
    // Initial data refresh
    refreshAIDataCache().then(() => {
        // Load welcome message
        resetAIChatHistory();
    });
    
    // Bind events
    bindAIEvents();
    
    // Check backend status
    setTimeout(() => {
        checkAIBackendStatus();
    }, 1000);
    
    console.log("✅ AI Assistant initialized successfully with Database Integration");
}

// ==================== OPEN MODAL FUNCTION ====================

function openAIAssistantModal() {
    const modal = document.getElementById('modal-ai-assistant');
    if (modal) {
        modal.style.display = 'flex';
        
        // Refresh UI elements reference
        aiChatContainer = document.getElementById('aiChatMessages');
        aiMessageInput = document.getElementById('aiChatInput');
        aiSendBtn = document.getElementById('aiSendBtn');
        aiClearBtn = document.getElementById('aiClearChatBtn');
        aiModelSelect = document.getElementById('aiModelSelect');
        
        // Refresh data cache
        refreshAIDataCache().then(() => {
            // Re-render messages
            renderAIChatMessages();
        });
        
        if (aiMessageInput) {
            setTimeout(() => aiMessageInput.focus(), 100);
        }
    }
}

function closeAIAssistantModal() {
    const modal = document.getElementById('modal-ai-assistant');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ==================== EXPORT GLOBALS ====================

window.initializeAIAssistant = initializeAIAssistant;
window.openAIAssistantModal = openAIAssistantModal;
window.closeAIAssistantModal = closeAIAssistantModal;
window.aiMessagesHistory = aiMessagesHistory;
window.resetAIChatHistory = resetAIChatHistory;
window.processAICommand = processAICommand;
window.refreshAIDataCache = refreshAIDataCache;

// Auto-initialize when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(() => {
            if (typeof currentUser !== 'undefined' && currentUser && currentUser.role) {
                initializeAIAssistant();
            }
        }, 1000);
    });
} else {
    setTimeout(() => {
        if (typeof currentUser !== 'undefined' && currentUser && currentUser.role) {
            initializeAIAssistant();
        }
    }, 1000);
}

// Listener untuk dataReady event
window.addEventListener('dataReady', function() {
    console.log("📡 dataReady event received, refreshing AI cache");
    refreshAIDataCache();
});

console.log("✅ ai-assistant.js V6.0 loaded - Fully Integrated with Database!");