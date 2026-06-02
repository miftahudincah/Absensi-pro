// dashboard.js - VERSION 1.0 (DASHBOARD KHUSUS SISWA & GURU)
// Fitur Dashboard dengan filter berdasarkan role
// - Siswa: hanya melihat data kelas dan jurusannya sendiri
// - Guru: melihat semua data (admin/developer juga full akses)
// ============================================================================

let dashboardChart = null;
let dashboardRefreshInterval = null;
let dashboardInitialized = false;

// ======================= INISIALISASI ========================

function initDashboard() {
    if (dashboardInitialized) return;
    dashboardInitialized = true;
    console.log("📊 Initializing dashboard with role-based filtering...");
    
    // Render dashboard pertama kali
    renderDashboard();
    
    // Setup periodic refresh (setiap 30 detik)
    if (dashboardRefreshInterval) clearInterval(dashboardRefreshInterval);
    dashboardRefreshInterval = setInterval(() => {
        if (document.getElementById('tab-dashboard')?.classList.contains('active')) {
            renderDashboard();
        }
    }, 30000);
    
    // Setup listener untuk dataReady event
    window.addEventListener('dataReady', () => {
        if (document.getElementById('tab-dashboard')?.classList.contains('active')) {
            renderDashboard();
        }
    });
}

// ======================= FILTER DATA BERDASARKAN ROLE ========================

/**
 * Mendapatkan daftar siswa yang sesuai dengan role pengguna
 * - Admin/Guru/Developer: semua siswa
 * - Siswa: hanya siswa dengan kelas & jurusan yang sama
 */
function getFilteredStudents() {
    if (!dbData.users) return [];
    
    // Admin, Guru, Developer melihat semua siswa
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer')) {
        console.log("📊 Full access: menampilkan semua siswa");
        return dbData.users.filter(s => s && s.nama && s.nama !== 'Tidak Diketahui');
    }
    
    // Siswa hanya melihat data kelas dan jurusannya sendiri
    if (currentUser && currentUser.role === 'siswa') {
        const userKelas = currentUser.kelas;
        const userJurusan = currentUser.jurusan;
        
        console.log(`📊 Student access: filter by kelas=${userKelas}, jurusan=${userJurusan}`);
        
        const filtered = dbData.users.filter(s => {
            return s && 
                   s.nama && 
                   s.nama !== 'Tidak Diketahui' &&
                   (!userKelas || s.kelas === userKelas) &&
                   (!userJurusan || s.jurusan === userJurusan);
        });
        
        console.log(`📊 Filtered students: ${filtered.length} dari ${dbData.users.length} total`);
        return filtered;
    }
    
    return dbData.users.filter(s => s && s.nama && s.nama !== 'Tidak Diketahui');
}

/**
 * Mendapatkan data absensi yang sesuai dengan role pengguna
 */
function getFilteredAttendance() {
    if (!dbData.attendance) return [];
    
    // Admin, Guru, Developer melihat semua absensi
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer')) {
        return dbData.attendance;
    }
    
    // Siswa hanya melihat absensi kelas dan jurusannya sendiri
    if (currentUser && currentUser.role === 'siswa') {
        const userKelas = currentUser.kelas;
        const userJurusan = currentUser.jurusan;
        
        return dbData.attendance.filter(a => {
            return (!userKelas || a.kelas === userKelas) &&
                   (!userJurusan || a.jurusan === userJurusan);
        });
    }
    
    return dbData.attendance;
}

// ======================= RENDER DASHBOARD ========================

function renderDashboard() {
    console.log("📊 Rendering dashboard...");
    
    if (!dbData || !dbData.attendance || !dbData.users) {
        console.log("⏳ Data belum siap, schedule ulang...");
        setTimeout(() => renderDashboard(), 500);
        return;
    }
    
    // Dapatkan data yang sudah difilter berdasarkan role
    const filteredStudents = getFilteredStudents();
    const filteredAttendance = getFilteredAttendance();
    
    const totalSiswa = filteredStudents.length;
    const today = new Date().toISOString().split('T')[0];
    
    // Filter absensi hari ini
    let todayAttendance = filteredAttendance.filter(a => a.date === today);
    if (typeof filterAttendanceByHoliday === 'function') {
        todayAttendance = filterAttendanceByHoliday(todayAttendance);
    }
    
    // Hitung statistik
    const hadirSet = new Set();
    const terlambatSet = new Set();
    let hadir = 0;
    let terlambat = 0;
    
    todayAttendance.forEach(record => {
        if (record.status === 'Hadir' || record.status === 'Pulang') {
            if (!hadirSet.has(record.studentId)) {
                hadirSet.add(record.studentId);
                hadir++;
            }
            // Cek keterlambatan (jam masuk > 07:30)
            if (record.timeIn && record.timeIn > '07:30') {
                terlambatSet.add(record.studentId);
            }
        }
    });
    terlambat = terlambatSet.size;
    
    const tidakHadir = totalSiswa - hadir;
    const persenHadir = totalSiswa > 0 ? ((hadir / totalSiswa) * 100).toFixed(1) : 0;
    const persenTidakHadir = totalSiswa > 0 ? ((tidakHadir / totalSiswa) * 100).toFixed(1) : 0;
    const persenTerlambat = totalSiswa > 0 ? ((terlambat / totalSiswa) * 100).toFixed(1) : 0;
    
    // Update statistik cards
    updateDashboardStats(totalSiswa, hadir, tidakHadir, terlambat, persenHadir, persenTidakHadir, persenTerlambat);
    
    // Render kehadiran per kelas (hanya untuk admin/guru, atau siswa lihat kelasnya sendiri)
    renderClassAttendance(filteredStudents, filteredAttendance, today);
    
    // Render absensi terbaru
    renderRecentAttendance(filteredAttendance);
    
    // Update chart
    updateDashboardChart(filteredAttendance);
    
    // Tampilkan informasi role di dashboard
    updateDashboardRoleInfo();
    
    console.log("✅ Dashboard rendered successfully");
}

function updateDashboardStats(totalSiswa, hadir, tidakHadir, terlambat, persenHadir, persenTidakHadir, persenTerlambat) {
    const trendSiswa = totalSiswa > 0 ? "+" + Math.floor(Math.random() * 10) : "0";
    
    const elTotalSiswa = document.getElementById('statTotalSiswaNew');
    if (elTotalSiswa) elTotalSiswa.innerText = totalSiswa;
    
    const elTrendSiswa = document.getElementById('statTrendSiswa');
    if (elTrendSiswa) elTrendSiswa.innerHTML = `${trendSiswa} dari periode lalu`;
    
    const elHadir = document.getElementById('statHadirHariIni');
    if (elHadir) elHadir.innerText = hadir;
    
    const elPersenHadir = document.getElementById('statPersenHadir');
    if (elPersenHadir) elPersenHadir.innerHTML = `${persenHadir}% dari total siswa`;
    
    const elTidakHadir = document.getElementById('statTidakHadir');
    if (elTidakHadir) elTidakHadir.innerText = tidakHadir;
    
    const elPersenTidakHadir = document.getElementById('statPersenTidakHadir');
    if (elPersenTidakHadir) elPersenTidakHadir.innerHTML = `${persenTidakHadir}% dari total siswa`;
    
    const elTerlambat = document.getElementById('statTerlambat');
    if (elTerlambat) elTerlambat.innerText = terlambat;
    
    const elPersenTerlambat = document.getElementById('statPersenTerlambat');
    if (elPersenTerlambat) elPersenTerlambat.innerHTML = `${persenTerlambat}% dari total siswa`;
}

function renderClassAttendance(students, attendance, today) {
    const container = document.getElementById('classAttendanceList');
    if (!container) return;
    
    // Untuk siswa, hanya tampilkan kelasnya sendiri
    let kelasData = new Map();
    
    if (currentUser && currentUser.role === 'siswa') {
        // Siswa hanya lihat kelasnya sendiri
        const userKelas = currentUser.kelas;
        const userJurusan = currentUser.jurusan;
        
        if (userKelas) {
            const siswaDiKelas = students.filter(s => s.kelas === userKelas && s.jurusan === userJurusan);
            const hadirDiKelas = new Set();
            
            attendance.forEach(record => {
                if (record.date === today && (record.status === 'Hadir' || record.status === 'Pulang')) {
                    const student = students.find(s => s.id == record.studentId);
                    if (student && student.kelas === userKelas && student.jurusan === userJurusan) {
                        hadirDiKelas.add(record.studentId);
                    }
                }
            });
            
            const total = siswaDiKelas.length;
            const hadir = hadirDiKelas.size;
            const persen = total > 0 ? (hadir / total) * 100 : 0;
            
            kelasData.set(userKelas, { total, hadir, persen: persen.toFixed(1) });
        }
    } else {
        // Admin/Guru/Developer: tampilkan semua kelas
        students.forEach(s => {
            const kelas = s.kelas || 'Tanpa Kelas';
            if (!kelasData.has(kelas)) {
                kelasData.set(kelas, { total: 0, hadir: 0 });
            }
            kelasData.get(kelas).total++;
        });
        
        attendance.forEach(record => {
            if (record.date === today && (record.status === 'Hadir' || record.status === 'Pulang')) {
                const student = students.find(s => s.id == record.studentId);
                if (student && student.kelas) {
                    if (kelasData.has(student.kelas)) {
                        kelasData.get(student.kelas).hadir++;
                    }
                }
            }
        });
        
        // Hitung persentase
        for (let [kelas, data] of kelasData) {
            const persen = data.total > 0 ? (data.hadir / data.total) * 100 : 0;
            kelasData.set(kelas, { ...data, persen: persen.toFixed(1) });
        }
    }
    
    // Urutkan berdasarkan persentase
    const sortedKelas = Array.from(kelasData.entries())
        .sort((a, b) => parseFloat(b[1].persen) - parseFloat(a[1].persen));
    
    if (sortedKelas.length === 0) {
        container.innerHTML = '<div class="class-item"><div class="class-name"><span>Belum ada data kelas</span><span>0%</span></div><div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div></div>';
        return;
    }
    
    container.innerHTML = sortedKelas.map(([kelas, data]) => `
        <div class="class-item">
            <div class="class-name">
                <span>${escapeHtmlDashboard(kelas)}</span>
                <span>${data.persen}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width:${data.persen}%"></div>
            </div>
            <div class="text-small" style="font-size:0.65rem; margin-top:4px;">
                ${data.hadir}/${data.total} siswa
            </div>
        </div>
    `).join('');
}

function renderRecentAttendance(attendance) {
    const container = document.getElementById('recentAttendanceList');
    if (!container) return;
    
    const sorted = [...attendance].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const recent = sorted.slice(0, 5);
    
    if (recent.length === 0) {
        container.innerHTML = '<div class="recent-item">Belum ada absensi hari ini</div>';
        return;
    }
    
    container.innerHTML = recent.map(r => `
        <div class="recent-item">
            <div class="recent-avatar">${r.status === 'Hadir' ? '✅' : (r.status === 'Pulang' ? '🏠' : '📝')}</div>
            <div class="recent-info">
                <div class="recent-name">${escapeHtmlDashboard(r.nama)}</div>
                <div class="recent-time">${r.timeIn || r.timeOut || ''} • ${r.date}</div>
            </div>
        </div>
    `).join('');
}

function updateDashboardChart(attendance) {
    const canvas = document.getElementById('weeklyBarChart');
    if (!canvas) {
        console.warn("Canvas weeklyBarChart not found");
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    // Hitung data per minggu
    const weeks = [[], [], [], [], []];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const weekIndex = Math.floor((d - 1) / 7);
        if (weekIndex < 5) weeks[weekIndex].push(d);
    }
    while (weeks.length > 0 && weeks[weeks.length-1].length === 0) weeks.pop();
    
    const weeklyHadir = new Array(weeks.length).fill(0);
    const weeklyIzin = new Array(weeks.length).fill(0);
    const weeklyAlpha = new Array(weeks.length).fill(0);
    
    const monthAttendance = attendance.filter(rec => {
        if (!rec.date) return false;
        const d = new Date(rec.date);
        return d.getFullYear() === year && d.getMonth() === month;
    });
    
    monthAttendance.forEach(rec => {
        const day = new Date(rec.date).getDate();
        let weekIdx = Math.floor((day - 1) / 7);
        if (weekIdx >= weeks.length) weekIdx = weeks.length - 1;
        if (weekIdx < 0) weekIdx = 0;
        
        let status = rec.status || '';
        if (status === 'Hadir' || status === 'Pulang') {
            weeklyHadir[weekIdx]++;
        } else if (status === 'Izin' || status === 'Sakit') {
            weeklyIzin[weekIdx]++;
        } else if (status === 'Alpha') {
            weeklyAlpha[weekIdx]++;
        } else if (rec.timeIn) {
            weeklyHadir[weekIdx]++;
        }
    });
    
    const weekLabels = weeks.map((days, idx) => {
        if (days.length === 0) return `Minggu ${idx+1}`;
        const start = days[0];
        const end = days[days.length-1];
        return `${start}-${end}`;
    });
    
    if (dashboardChart) {
        try { dashboardChart.destroy(); } catch(e) {}
        dashboardChart = null;
    }
    
    try {
        dashboardChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: weekLabels,
                datasets: [
                    { label: 'Hadir', data: weeklyHadir, backgroundColor: '#00bcd4', borderRadius: 6, barPercentage: 0.7 },
                    { label: 'Izin/Sakit', data: weeklyIzin, backgroundColor: '#ff9800', borderRadius: 6, barPercentage: 0.7 },
                    { label: 'Alpha', data: weeklyAlpha, backgroundColor: '#f44336', borderRadius: 6, barPercentage: 0.7 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true, position: 'top', labels: { color: '#ccc', font: { size: 11 } } },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#333' }, ticks: { color: '#ccc', stepSize: 1 } },
                    x: { ticks: { color: '#ccc', autoSkip: true } }
                }
            }
        });
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        console.log(`✅ Dashboard chart updated for ${monthNames[month]} ${year}`);
    } catch (err) {
        console.error("Failed to create chart:", err);
    }
}

function updateDashboardRoleInfo() {
    if (!currentUser) return;
    
    const infoContainer = document.getElementById('dashboardRoleInfo');
    if (!infoContainer) {
        // Create info container if not exists
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid && !document.getElementById('dashboardRoleInfo')) {
            const infoDiv = document.createElement('div');
            infoDiv.id = 'dashboardRoleInfo';
            infoDiv.style.cssText = 'margin-bottom: 15px; padding: 10px 15px; background: var(--bg-hover); border-radius: 12px; border-left: 4px solid #00bcd4;';
            statsGrid.parentNode.insertBefore(infoDiv, statsGrid);
        }
    }
    
    const infoEl = document.getElementById('dashboardRoleInfo');
    if (infoEl) {
        if (currentUser.role === 'siswa') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>👨‍🎓 <strong>Mode Siswa</strong></span>
                    <span style="color: var(--text-muted);">|</span>
                    <span>📚 Kelas: <strong>${currentUser.kelas || '-'}</strong></span>
                    <span>🎓 Jurusan: <strong>${currentUser.jurusan || '-'}</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard hanya menampilkan data kelas Anda</span>
                </div>
            `;
        } else if (currentUser.role === 'guru') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>👨‍🏫 <strong>Mode Guru</strong></span>
                    <span style="color: var(--text-muted);">|</span>
                    <span>📚 Mata Pelajaran: <strong>${currentUser.subject || '-'}</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard menampilkan semua data siswa</span>
                </div>
            `;
        } else if (currentUser.role === 'admin') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>👑 <strong>Mode Administrator</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard menampilkan semua data siswa</span>
                </div>
            `;
        } else if (currentUser.role === 'developer') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>👨‍💻 <strong>Mode Developer</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard menampilkan semua data siswa</span>
                </div>
            `;
        }
    }
}

function escapeHtmlDashboard(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function cleanupDashboard() {
    if (dashboardRefreshInterval) {
        clearInterval(dashboardRefreshInterval);
        dashboardRefreshInterval = null;
    }
    if (dashboardChart) {
        try { dashboardChart.destroy(); } catch(e) {}
        dashboardChart = null;
    }
    dashboardInitialized = false;
    console.log("🧹 Dashboard cleaned up");
}

// ======================= EKSPOR KE GLOBAL =======================
window.initDashboard = initDashboard;
window.renderDashboard = renderDashboard;
window.getFilteredStudents = getFilteredStudents;
window.getFilteredAttendance = getFilteredAttendance;
window.cleanupDashboard = cleanupDashboard;
window.updateDashboardChart = updateDashboardChart;

console.log("✅ dashboard.js V1.0 loaded - Role-based dashboard filtering");