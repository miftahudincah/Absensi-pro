// ai-summary.js - VERSION 4.3 (ONLY STATIC FALLBACK - NO API CALLS)
// Analisis statis tanpa API call untuk menghindari error
// ============================================================================

let aiSummaryInitialized = false;

// ======================= CEK AKSES ========================

function hasAIAccess() {
    if (!currentUser) return false;
    const allowedRoles = ['admin', 'guru', 'developer'];
    return allowedRoles.includes(currentUser.role);
}

// ======================= INISIALISASI ========================

function initAISummary() {
    if (aiSummaryInitialized) {
        console.log("🤖 AI Summary already initialized");
        return;
    }
    
    if (!hasAIAccess()) {
        console.log("🔒 AI Summary: Akses ditolak untuk role:", currentUser?.role);
        return;
    }
    
    aiSummaryInitialized = true;
    console.log("🤖 AI Summary module initialized for role:", currentUser.role);
    
    setTimeout(() => {
        addAISummaryButton();
        addFloatingAISummaryButton();
    }, 500);
}

function addAISummaryButton() {
    if (!hasAIAccess()) return;
    
    let statsGrid = document.getElementById('dashboardStatsGrid');
    if (!statsGrid) {
        statsGrid = document.querySelector('.stats-grid');
    }
    
    if (!statsGrid) {
        console.log("⏳ Menunggu stats grid untuk AI button...");
        setTimeout(addAISummaryButton, 500);
        return;
    }
    
    if (document.getElementById('aiSummaryBtnContainer')) {
        console.log("✅ AI Summary button already exists");
        return;
    }
    
    const aiButton = document.createElement('div');
    aiButton.className = 'stat-card-new';
    aiButton.id = 'aiSummaryBtnContainer';
    aiButton.setAttribute('data-role', currentUser.role);
    aiButton.style.cssText = `
        cursor: pointer;
        background: linear-gradient(135deg, #667eea, #764ba2);
        transition: transform 0.2s;
        border-radius: 20px;
        padding: 20px;
        text-align: center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    `;
    aiButton.onclick = () => openAISummaryModal();
    aiButton.onmouseenter = () => aiButton.style.transform = 'scale(1.02)';
    aiButton.onmouseleave = () => aiButton.style.transform = 'scale(1)';
    aiButton.innerHTML = `
        <div class="stat-title-new" style="color: white;">🤖 AI Summary</div>
        <div class="stat-number" style="color: white; font-size: 1.2rem;">Analisis Cerdas</div>
        <div class="stat-percent" style="color: rgba(255,255,255,0.8);">Klik untuk analisis</div>
    `;
    
    const terlambatCard = document.getElementById('statTerlambat')?.closest('.stat-card-new');
    if (terlambatCard && terlambatCard.nextSibling) {
        statsGrid.insertBefore(aiButton, terlambatCard.nextSibling);
    } else {
        statsGrid.appendChild(aiButton);
    }
    
    console.log("✅ AI Summary button added to dashboard for role:", currentUser.role);
}

function addFloatingAISummaryButton() {
    if (!hasAIAccess()) return;
    
    if (document.getElementById('floatingAiSummaryBtn')) {
        console.log("✅ Floating AI button already exists");
        return;
    }
    
    const floatingBtn = document.createElement('button');
    floatingBtn.id = 'floatingAiSummaryBtn';
    floatingBtn.innerHTML = '🤖';
    floatingBtn.title = 'AI Summary Absensi';
    floatingBtn.onclick = () => openAISummaryModal();
    floatingBtn.style.cssText = `
        position: fixed;
        bottom: 170px;
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
        z-index: 999;
        border: none;
        font-size: 28px;
    `;
    
    document.body.appendChild(floatingBtn);
    console.log("✅ Floating AI button added for role:", currentUser.role);
}

async function openAISummaryModal() {
    if (!hasAIAccess()) {
        if (typeof showToast === 'function') {
            showToast("🔒 Akses ditolak! Fitur AI Summary hanya untuk Admin, Guru, dan Developer.", "error");
        }
        return;
    }
    
    let modal = document.getElementById('modal-ai-summary');
    if (!modal) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="modal-ai-summary" class="modal-overlay">
                <div class="modal-box" style="max-width:700px; max-height:85vh; overflow-y:auto;">
                    <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center;">
                        <span>🤖 AI Summary Absensi</span>
                        <span onclick="closeModal('modal-ai-summary')" style="cursor:pointer; font-size:24px;">✖</span>
                    </div>
                    <div style="padding:20px;" id="aiSummaryContent">
                        <div style="text-align:center; padding:40px;">
                            <div style="font-size:48px; margin-bottom:16px;">🚀</div>
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
    
    const data = collectAttendanceData();
    const html = generateStaticAnalysisHTML(data);
    
    const contentDiv = document.getElementById('aiSummaryContent');
    if (contentDiv) {
        const roleBadge = currentUser?.role === 'admin' ? '👑 ADMIN' : (currentUser?.role === 'guru' ? '👨‍🏫 GURU' : '👨‍💻 DEVELOPER');
        
        contentDiv.innerHTML = `
            <div style="padding:20px;">
                <div style="background:linear-gradient(135deg,#667eea20,#764ba220); border-radius:16px; padding:16px; margin-bottom:20px;">
                    <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
                        <span style="font-size:32px;">🤖</span>
                        <div style="flex:1;">
                            <h3 style="margin:0;">Analisis Kehadiran</h3>
                            <p style="margin:0; font-size:12px;">Analisis Statis • ${new Date().toLocaleString('id-ID')}</p>
                        </div>
                        <div style="background:#00bcd4; padding:4px 12px; border-radius:20px; font-size:11px; color:white;">${roleBadge}</div>
                    </div>
                </div>
                <div class="ai-summary-content" style="line-height:1.6;">${html}</div>
            </div>
        `;
        
        const exportBtn = document.getElementById('aiExportBtn');
        const copyBtn = document.getElementById('aiCopyBtn');
        if (exportBtn) exportBtn.style.display = 'inline-block';
        if (copyBtn) copyBtn.style.display = 'inline-block';
    }
}

// ======================= PENGUMPULAN DATA =======================

function collectAttendanceData() {
    if (!dbData || !dbData.attendance || !dbData.users) return null;
    
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    
    const validStudents = (dbData.users || []).filter(s => s && s.nama && s.nama !== 'Tidak Diketahui' && s.nama.trim() !== '');
    const monthAttendance = (dbData.attendance || []).filter(a => {
        if (!a.date) return false;
        const d = new Date(a.date);
        return d.getFullYear() === thisYear && d.getMonth() === thisMonth;
    });
    
    const studentStats = validStudents.map(student => {
        const records = monthAttendance.filter(a => a.studentId == student.id);
        const hadir = records.filter(r => r.status === 'Hadir' || r.status === 'Pulang').length;
        return { id: student.id, nama: student.nama, kelas: student.kelas || '-', hadir, total: records.length };
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

// ======================= FALLBACK STATIS =======================

function generateStaticAnalysisHTML(data) {
    if (!data || data.totalStudents === 0) {
        return '<div style="text-align:center; padding:40px;">📭 Data absensi tidak tersedia. Silakan tambahkan data siswa dan absensi terlebih dahulu.</div>';
    }
    
    const persenHariIni = data.persenHariIni;
    const status = data.rataKehadiran >= 90 ? 'Sangat Baik' : (data.rataKehadiran >= 75 ? 'Baik' : (data.rataKehadiran >= 60 ? 'Cukup' : 'Perlu Perhatian'));
    
    const lowAttendanceCount = data.lowestAttendance.filter(s => {
        const persen = s.total > 0 ? ((s.hadir / s.total) * 100) : 0;
        return persen < 60;
    }).length;
    const highAttendanceCount = data.topPerformers.filter(s => s.hadir >= 18).length;
    
    let recommendations = [];
    if (data.rataKehadiran < 75) {
        recommendations.push("📢 **Tingkatkan komunikasi** dengan orang tua siswa yang sering absen melalui WhatsApp atau telepon.");
    }
    if (lowAttendanceCount > 0) {
        recommendations.push(`⚠️ **${lowAttendanceCount} siswa** memiliki kehadiran di bawah 60%. Segera lakukan pembinaan dan pendekatan personal.`);
    }
    if (highAttendanceCount > 0) {
        recommendations.push(`🏆 **Berikan apresiasi** kepada ${highAttendanceCount} siswa dengan kehadiran sempurna/tinggi sebagai motivasi.`);
    }
    if (Object.keys(data.classStats).length > 0) {
        const worstClass = Object.entries(data.classStats).sort((a,b) => parseFloat(a[1].persen) - parseFloat(b[1].persen))[0];
        if (worstClass && parseFloat(worstClass[1].persen) < 70) {
            recommendations.push(`📚 **Perhatikan kelas ${worstClass[0]}** dengan kehadiran hanya ${worstClass[1].persen}%. Evaluasi jadwal dan metode pembelajaran.`);
        }
    }
    if (recommendations.length === 0) {
        recommendations.push("✅ **Pertahankan prestasi** yang sudah baik. Terus pantau dan beri motivasi kepada siswa.");
    }
    
    let prediction = "";
    if (data.rataKehadiran >= 85) {
        prediction = "Dengan performa yang sangat baik, diprediksi kehadiran akan tetap stabil di atas 85% pada minggu mendatang.";
    } else if (data.rataKehadiran >= 70) {
        prediction = "Kehadiran cukup baik. Dengan sedikit peningkatan, target 85% dapat tercapai dalam 2 minggu ke depan.";
    } else if (data.rataKehadiran >= 55) {
        prediction = "Kehadiran masih di bawah target. Diperlukan intervensi segera untuk meningkatkan kesadaran siswa.";
    } else {
        prediction = "⚠️ **Peringatan!** Kehadiran sangat rendah. Segera lakukan evaluasi menyeluruh dan komunikasi dengan orang tua.";
    }
    
    return `
        <h2>📊 RINGKASAN EKSEKUTIF</h2>
        <p>Sistem mencatat <strong>${data.totalStudents} siswa</strong> dengan rata-rata kehadiran bulan ini <strong>${data.rataKehadiran}%</strong> (kategori: <strong>${status}</strong>). Hari ini, <strong>${data.hadirToday} dari ${data.totalStudents} siswa (${persenHariIni}%)</strong> telah melakukan absensi.</p>
        
        <h2>📌 POIN PENTING</h2>
        <h3>✅ 5 Siswa dengan Kehadiran Terbaik:</h3>
        <ul>${data.topPerformers.map(s => `<li><strong>${escapeHtmlStatic(s.nama)}</strong> (${s.kelas}) - ${s.hadir} hari hadir</li>`).join('') || '<li>Belum ada data</li>'}</ul>
        
        <h3>⚠️ 5 Siswa yang Perlu Perhatian:</h3>
        <ul>${data.lowestAttendance.map(s => {
            const persen = s.total > 0 ? ((s.hadir/s.total)*100).toFixed(1) : 0;
            return `<li><strong>${escapeHtmlStatic(s.nama)}</strong> (${s.kelas}) - ${s.hadir}/${s.total} hari (${persen}%)</li>`;
        }).join('') || '<li>Semua siswa memiliki kehadiran baik</li>'}</ul>
        
        <h3>🏫 Statistik per Kelas:</h3>
        <ul>${Object.entries(data.classStats).map(([k, v]) => `<li>${k}: <strong>${v.persen}%</strong> kehadiran (${v.hadir} dari ${v.total * 20} total)</li>`).join('')}</ul>
        
        <h2>💡 REKOMENDASI</h2>
        <ul>${recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
        
        <h2>🔮 PREDIKSI</h2>
        <p>${prediction}</p>
        
        <div style="margin-top: 20px; padding: 12px; background: rgba(102, 126, 234, 0.1); border-radius: 12px; font-size: 12px;">
            <span>📅 Analisis diperbarui: ${new Date().toLocaleString('id-ID')}</span><br>
            <span>🔒 Fitur ini hanya untuk Admin, Guru, dan Developer</span>
        </div>
    `;
}

function escapeHtmlStatic(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= UTILITY FUNCTIONS =======================

function copyAISummaryToClipboard() {
    if (!hasAIAccess()) {
        if (typeof showToast === 'function') showToast("🔒 Akses ditolak!", "error");
        return;
    }
    
    const text = document.querySelector('.ai-summary-content')?.innerText;
    if (text) { 
        navigator.clipboard.writeText(text); 
        if (typeof showToast === 'function') showToast("✅ Analisis disalin ke clipboard", "success");
    } else {
        if (typeof showToast === 'function') showToast("Gagal menyalin", "error");
    }
}

function exportAISummaryToPDF() {
    if (!hasAIAccess()) {
        if (typeof showToast === 'function') showToast("🔒 Akses ditolak!", "error");
        return;
    }
    
    const html = document.querySelector('.ai-summary-content')?.innerHTML;
    if (!html) return;
    
    const win = window.open('', '_blank');
    const roleText = currentUser?.role === 'admin' ? 'Admin' : (currentUser?.role === 'guru' ? 'Guru' : 'Developer');
    
    win.document.write(`<!DOCTYPE html><html><head><title>AI Summary Absensi</title><meta charset="UTF-8"><style>
        body{font-family:Arial,sans-serif;padding:30px;line-height:1.5}
        h2{color:#667eea;margin-top:20px}
        h3{color:#00bcd4;margin-top:15px}
        ul{margin:10px 0}
        .header{text-align:center;margin-bottom:30px;padding-bottom:15px;border-bottom:2px solid #667eea}
        .footer{text-align:center;margin-top:30px;padding-top:15px;font-size:10px;color:#888;border-top:1px solid #ddd}
        @media print{button{display:none}}
    </style></head><body>
    <div class="header"><h1>🤖 AI SUMMARY ABSENSI</h1><p>Dicetak oleh: ${roleText}</p><p>${new Date().toLocaleString('id-ID')}</p></div>
    ${html}
    <div class="footer"><p>Sistem Absensi IoT - Fingerprint & Real-time</p></div>
    <div style="text-align:center; margin-top:20px;"><button onclick="window.print()" style="padding:10px 20px; background:#667eea; color:white; border:none; border-radius:5px; cursor:pointer;">🖨️ Cetak PDF</button><button onclick="window.close()" style="padding:10px 20px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer; margin-left:10px;">✖ Tutup</button></div>
    </body></html>`);
    win.document.close();
    if (typeof showToast === 'function') showToast("📄 Membuka halaman print", "info");
}

function removeAISummaryButtons() {
    const btn = document.getElementById('aiSummaryBtnContainer');
    if (btn) btn.remove();
    const floatingBtn = document.getElementById('floatingAiSummaryBtn');
    if (floatingBtn) floatingBtn.remove();
    console.log("🗑️ AI Summary buttons removed");
}

function checkAndInitAI() {
    if (currentUser && hasAIAccess()) {
        if (!aiSummaryInitialized) {
            console.log("🔄 Initializing AI Summary for user:", currentUser.nama, "Role:", currentUser.role);
            initAISummary();
        } else if (!document.getElementById('aiSummaryBtnContainer')) {
            console.log("🔄 Re-adding AI Summary buttons");
            addAISummaryButton();
            addFloatingAISummaryButton();
        }
    } else if (currentUser && !hasAIAccess()) {
        if (document.getElementById('aiSummaryBtnContainer') || document.getElementById('floatingAiSummaryBtn')) {
            removeAISummaryButtons();
        }
    }
}

// ======================= EKSPOR GLOBAL =======================

window.initAISummary = initAISummary;
window.openAISummaryModal = openAISummaryModal;
window.copyAISummaryToClipboard = copyAISummaryToClipboard;
window.exportAISummaryToPDF = exportAISummaryToPDF;
window.hasAIAccess = hasAIAccess;
window.removeAISummaryButtons = removeAISummaryButtons;
window.checkAndInitAI = checkAndInitAI;

// ======================= AUTO INIT =======================

let initAttempts = 0;
const maxAttempts = 30;

function waitForUserAndInit() {
    if (typeof currentUser !== 'undefined' && currentUser) {
        if (hasAIAccess()) {
            console.log("🎯 User detected:", currentUser.nama, "Role:", currentUser.role, "- Initializing AI Summary");
            initAISummary();
        } else {
            console.log("🔒 AI Summary: Role", currentUser.role, "tidak memiliki akses");
        }
        return;
    }
    
    initAttempts++;
    if (initAttempts < maxAttempts) {
        setTimeout(waitForUserAndInit, 500);
    } else {
        console.log("⚠️ AI Summary: Max attempts reached, waiting for user login");
    }
}

setTimeout(waitForUserAndInit, 1000);

window.addEventListener('uiReady', (e) => {
    if (e.detail && e.detail.currentUser) {
        console.log("📡 uiReady event received for AI Summary");
        setTimeout(() => checkAndInitAI(), 500);
    }
});

window.addEventListener('dataReady', () => {
    if (currentUser && hasAIAccess() && !aiSummaryInitialized) {
        console.log("📡 dataReady event received, initializing AI Summary");
        initAISummary();
    }
});

console.log("✅ ai-summary.js V4.3 loaded - Static analysis only (no API calls)");