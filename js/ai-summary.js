// ai-summary.js - VERSION 3.0 (Hugging Face API + Groq Fallback)
// AI Summary Absensi dengan multiple API provider

// Konfigurasi API (coba salah satu yang aktif)
const AI_PROVIDERS = {
    groq: {
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: "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",
        model: "llama3-70b-8192"
    },
    // Hugging Face - gratis, daftar di huggingface.co/tos
    huggingface: {
        url: "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3",
        key: "" // Kosongkan dulu, bisa diisi nanti
    }
};

let currentProvider = 'groq';
let aiSummaryInitialized = false;
let currentAIAnalysis = null;

// ======================= INISIALISASI ========================

function initAISummary() {
    if (aiSummaryInitialized) return;
    if (!currentUser) {
        setTimeout(initAISummary, 1000);
        return;
    }
    
    aiSummaryInitialized = true;
    console.log("🤖 AI Summary module initialized");
    
    setTimeout(() => {
        addAISummaryButton();
        addFloatingAISummaryButton();
    }, 500);
}

function addAISummaryButton() {
    let statsGrid = document.getElementById('dashboardStatsGrid') || document.querySelector('.stats-grid');
    if (!statsGrid) {
        setTimeout(addAISummaryButton, 500);
        return;
    }
    
    if (document.getElementById('aiSummaryBtnContainer')) return;
    
    const aiButton = document.createElement('div');
    aiButton.className = 'stat-card-new';
    aiButton.id = 'aiSummaryBtnContainer';
    aiButton.style.cssText = `cursor:pointer; background:linear-gradient(135deg,#667eea,#764ba2); transition:transform 0.2s; border-radius:20px; padding:20px; text-align:center;`;
    aiButton.onclick = () => openAISummaryModal();
    aiButton.onmouseenter = () => aiButton.style.transform = 'scale(1.02)';
    aiButton.onmouseleave = () => aiButton.style.transform = 'scale(1)';
    aiButton.innerHTML = `<div style="color:white;">🤖 AI Summary</div><div style="color:white; font-size:1.2rem;">Analisis Cerdas</div>`;
    
    statsGrid.appendChild(aiButton);
    console.log("✅ AI Summary button added");
    
    // Floating button
    if (!document.getElementById('floatingAiSummaryBtn')) {
        const floatingBtn = document.createElement('button');
        floatingBtn.id = 'floatingAiSummaryBtn';
        floatingBtn.innerHTML = '🤖';
        floatingBtn.onclick = () => openAISummaryModal();
        floatingBtn.style.cssText = `position:fixed; bottom:170px; right:20px; width:56px; height:56px; border-radius:50%; background:linear-gradient(135deg,#667eea,#764ba2); color:white; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 15px rgba(0,0,0,0.3); z-index:999; border:none; font-size:28px;`;
        document.body.appendChild(floatingBtn);
        console.log("✅ Floating AI button added");
    }
}

async function openAISummaryModal() {
    let modal = document.getElementById('modal-ai-summary');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-ai-summary" class="modal-overlay">
                <div class="modal-box" style="max-width:700px; max-height:85vh; overflow-y:auto;">
                    <div class="modal-title" style="display:flex; justify-content:space-between;">
                        <span>🤖 AI Summary Absensi</span>
                        <span onclick="closeModal('modal-ai-summary')" style="cursor:pointer;">✖</span>
                    </div>
                    <div style="padding:20px;" id="aiSummaryContent">
                        <div style="text-align:center; padding:40px;">
                            <div style="font-size:48px;">🚀</div>
                            <h3>Menganalisis data...</h3>
                            <div class="loading-spinner" style="margin-top:20px;"></div>
                        </div>
                    </div>
                    <div class="modal-actions" style="padding:15px; border-top:1px solid var(--border);">
                        <button class="btn-action btn-success" onclick="exportAISummaryToPDF()" id="aiExportBtn" style="display:none;">📄 Export PDF</button>
                        <button class="btn-action btn-secondary" onclick="copyAISummaryToClipboard()" id="aiCopyBtn" style="display:none;">📋 Copy</button>
                        <button class="btn-cancel" onclick="closeModal('modal-ai-summary')">Tutup</button>
                    </div>
                </div>
            </div>
        `);
        modal = document.getElementById('modal-ai-summary');
    }
    
    modal.classList.add('open');
    
    const analysis = await generateAnalysis();
    
    const contentDiv = document.getElementById('aiSummaryContent');
    if (contentDiv && analysis) {
        contentDiv.innerHTML = `
            <div style="padding:20px;">
                <div style="background:linear-gradient(135deg,#667eea20,#764ba220); border-radius:16px; padding:16px; margin-bottom:20px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span style="font-size:32px;">🤖</span>
                        <div>
                            <h3 style="margin:0;">Analisis Kehadiran</h3>
                            <p style="margin:0; font-size:12px;">${analysis.provider} • ${new Date().toLocaleString('id-ID')}</p>
                        </div>
                    </div>
                </div>
                <div class="ai-summary-content" style="line-height:1.6;">${analysis.html}</div>
            </div>
        `;
        document.getElementById('aiExportBtn').style.display = 'inline-block';
        document.getElementById('aiCopyBtn').style.display = 'inline-block';
    }
}

async function generateAnalysis() {
    const data = collectAttendanceData();
    if (!data || data.totalStudents === 0) {
        return { provider: 'Fallback', html: '<p>Data absensi tidak tersedia</p>' };
    }
    
    // Coba panggil Groq API
    try {
        const result = await callGroqAPI(data);
        if (result) {
            return { provider: 'Groq AI (Llama 3)', html: result };
        }
    } catch(e) {
        console.log("Groq API error, using fallback:", e.message);
    }
    
    // Fallback ke analisis statis
    return { provider: 'Analisis Statis', html: generateStaticAnalysisHTML(data) };
}

async function callGroqAPI(data) {
    const prompt = `Buat analisis kehadiran siswa berikut:
- Total siswa: ${data.totalStudents}
- Hadir hari ini: ${data.hadirToday} (${data.persenHariIni}%)
- Rata-rata kehadiran bulan ini: ${data.rataKehadiran}%
- 5 siswa terbaik: ${data.topPerformers.map(s => s.nama).join(', ')}
- 5 siswa terendah: ${data.lowestAttendance.map(s => s.nama).join(', ')}
- Statistik kelas: ${Object.entries(data.classStats).map(([k,v]) => `${k}:${v.persen}%`).join(', ')}

Format HTML dengan:
<h2>Ringkasan Eksekutif</h2><p>...</p>
<h2>Poin Penting</h2><ul><li>...</li></ul>
<h2>Rekomendasi</h2><ul><li>...</li></ul>`;

    const response = await fetch(AI_PROVIDERS.groq.url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${AI_PROVIDERS.groq.key}`
        },
        body: JSON.stringify({
            model: AI_PROVIDERS.groq.model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 1000
        })
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    return result.choices[0]?.message?.content || generateStaticAnalysisHTML(data);
}

function collectAttendanceData() {
    if (!dbData || !dbData.attendance || !dbData.users) return null;
    
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const validStudents = (dbData.users || []).filter(s => s && s.nama && s.nama !== 'Tidak Diketahui');
    const monthAttendance = (dbData.attendance || []).filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });
    
    const studentStats = validStudents.map(student => {
        const records = monthAttendance.filter(a => a.studentId == student.id);
        const hadir = records.filter(r => r.status === 'Hadir' || r.status === 'Pulang').length;
        return { id: student.id, nama: student.nama, kelas: student.kelas, hadir, total: records.length };
    });
    
    studentStats.sort((a, b) => b.hadir - a.hadir);
    
    const todayAttendance = (dbData.attendance || []).filter(a => a.date === today && (a.status === 'Hadir' || a.status === 'Pulang'));
    const hadirTodaySet = new Set(todayAttendance.map(a => a.studentId));
    
    const classStats = {};
    validStudents.forEach(s => {
        const kelas = s.kelas || 'Tanpa Kelas';
        if (!classStats[kelas]) classStats[kelas] = { total: 0, hadir: 0 };
        classStats[kelas].total++;
        const stat = studentStats.find(st => st.id == s.id);
        if (stat) classStats[kelas].hadir += stat.hadir;
    });
    
    const totalSchoolDays = 20;
    for (let k in classStats) {
        classStats[k].persen = ((classStats[k].hadir / (classStats[k].total * totalSchoolDays)) * 100).toFixed(1);
    }
    
    const totalHadir = studentStats.reduce((s, st) => s + st.hadir, 0);
    const rataKehadiran = validStudents.length > 0 ? (totalHadir / (validStudents.length * totalSchoolDays) * 100).toFixed(1) : 0;
    
    return {
        totalStudents: validStudents.length,
        hadirToday: hadirTodaySet.size,
        persenHariIni: validStudents.length > 0 ? ((hadirTodaySet.size / validStudents.length) * 100).toFixed(1) : 0,
        rataKehadiran: rataKehadiran,
        topPerformers: studentStats.slice(0, 5),
        lowestAttendance: studentStats.filter(s => s.total > 0).slice(-5).reverse(),
        classStats: classStats
    };
}

function generateStaticAnalysisHTML(data) {
    const persenHariIni = data.persenHariIni;
    const status = data.rataKehadiran >= 90 ? 'Sangat Baik' : (data.rataKehadiran >= 75 ? 'Baik' : (data.rataKehadiran >= 60 ? 'Cukup' : 'Perlu Perhatian'));
    
    return `
        <h2>📊 RINGKASAN EKSEKUTIF</h2>
        <p>Sistem mencatat <strong>${data.totalStudents} siswa</strong> dengan rata-rata kehadiran bulan ini <strong>${data.rataKehadiran}%</strong> (kategori: <strong>${status}</strong>). Hari ini, <strong>${data.hadirToday} dari ${data.totalStudents} siswa (${persenHariIni}%)</strong> telah melakukan absensi.</p>
        
        <h2>📌 POIN PENTING</h2>
        <h3>✅ 5 Siswa dengan Kehadiran Terbaik:</h3>
        <ul>${data.topPerformers.map(s => `<li><strong>${s.nama}</strong> (${s.kelas || '-'}) - ${s.hadir} hari hadir</li>`).join('') || '<li>Belum ada data</li>'}</ul>
        
        <h3>⚠️ 5 Siswa yang Perlu Perhatian:</h3>
        <ul>${data.lowestAttendance.map(s => `<li><strong>${s.nama}</strong> (${s.kelas || '-'}) - ${s.hadir}/${s.total} hari (${s.total > 0 ? ((s.hadir/s.total)*100).toFixed(1) : 0}%)</li>`).join('') || '<li>Semua siswa memiliki kehadiran baik</li>'}</ul>
        
        <h3>🏫 Statistik per Kelas:</h3>
        <ul>${Object.entries(data.classStats).map(([k, v]) => `<li>${k}: <strong>${v.persen}%</strong> kehadiran (${v.hadir} dari ${v.total * 20} total)</li>`).join('')}</ul>
        
        <h2>💡 REKOMENDASI</h2>
        <ul>
            <li>${data.rataKehadiran >= 75 ? 'Pertahankan konsistensi kehadiran yang sudah baik.' : 'Tingkatkan komunikasi dengan orang tua siswa yang sering absen.'}</li>
            <li>Berikan apresiasi untuk ${data.topPerformers.slice(0,3).map(s => s.nama).join(', ')} dengan kehadiran sempurna.</li>
            <li>Lakukan pendekatan personal untuk siswa dengan kehadiran di bawah 60%.</li>
        </ul>
        
        <h2>🔮 PREDIKSI</h2>
        <p>Dengan tren saat ini (${status.toLowerCase()}), diprediksi kehadiran akan ${data.rataKehadiran >= 75 ? 'tetap stabil' : 'meningkat jika ada intervensi'} pada minggu mendatang.</p>
        
        <hr>
        <p style="font-size:11px; color:#888;">📅 Analisis diperbarui: ${new Date().toLocaleString('id-ID')}</p>
    `;
}

function copyAISummaryToClipboard() {
    const text = document.querySelector('.ai-summary-content')?.innerText;
    if (text) { navigator.clipboard.writeText(text); showToast("✅ Disalin", "success"); }
    else showToast("Gagal menyalin", "error");
}

function exportAISummaryToPDF() {
    const html = document.querySelector('.ai-summary-content')?.innerHTML;
    if (!html) return;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>AI Summary</title><meta charset="UTF-8"><style>body{font-family:Arial;padding:30px}h2{color:#667eea}</style></head><body><h1>🤖 AI SUMMARY</h1>${html}<p>${new Date().toLocaleString()}</p><button onclick="window.print()">Cetak</button><button onclick="window.close()">Tutup</button></body></html>`);
    win.document.close();
}

window.initAISummary = initAISummary;
window.openAISummaryModal = openAISummaryModal;
window.copyAISummaryToClipboard = copyAISummaryToClipboard;
window.exportAISummaryToPDF = exportAISummaryToPDF;

setTimeout(() => { if (typeof currentUser !== 'undefined' && currentUser) initAISummary(); else setTimeout(() => initAISummary(), 2000); }, 1000);
console.log("✅ ai-summary.js V3.0 loaded");