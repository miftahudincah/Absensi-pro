// main.js - VERSION 6.0 (DENGAN ROLE BARU: WAKIL KEPALA SEKOLAH & STAFF TU)
// Fokus: Session persistence, Auth state handler, Periodic refresh,
//        Dashboard dengan filter berdasarkan role (role-based filtering)
//        Theme management dark/light mode
// Role yang didukung: developer, admin (Kepala Sekolah), wakil_kepala, staff_tu, guru, siswa
// ============================================================================

// ======================== GLOBAL VARIABLES ========================
let refreshInterval = null;
let isInitialized = false;
let mainDataReadyListenerAdded = false;

// ======================== ROLE HELPER FUNCTIONS ========================

/**
 * Mendapatkan display name role
 */
function getRoleDisplayName(role) {
    const names = {
        developer: 'Developer',
        admin: 'Kepala Sekolah',
        wakil_kepala: 'Wakil Kepala Sekolah',
        staff_tu: 'Staff TU',
        guru: 'Guru',
        siswa: 'Siswa'
    };
    return names[role] || role.toUpperCase();
}

/**
 * Mendapatkan icon untuk role
 */
function getRoleIcon(role) {
    const icons = {
        developer: '👨‍💻',
        admin: '👑',
        wakil_kepala: '👔',
        staff_tu: '📋',
        guru: '👨‍🏫',
        siswa: '👨‍🎓'
    };
    return icons[role] || '👤';
}

/**
 * Cek apakah user memiliki akses full (admin atau developer)
 */
function hasFullAccess(role) {
    return role === 'admin' || role === 'developer';
}

/**
 * Cek apakah user memiliki akses membaca semua data
 */
function hasReadAllAccess(role) {
    const readAllRoles = ['admin', 'developer', 'wakil_kepala', 'guru', 'staff_tu'];
    return readAllRoles.includes(role);
}

/**
 * Cek apakah user memiliki akses manajemen (tambah/edit/hapus)
 */
function hasManagementAccess(role) {
    const managementRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
    return managementRoles.includes(role);
}

/**
 * Cek apakah user dapat melihat rekap
 */
function canAccessRekap(role) {
    const rekapRoles = ['admin', 'developer', 'wakil_kepala', 'guru', 'staff_tu'];
    return rekapRoles.includes(role);
}

/**
 * Cek apakah user dapat mengakses AI Summary
 */
function canAccessAISummary(role) {
    const aiRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
    return aiRoles.includes(role);
}

// ======================== SESSION PERSISTENCE ========================

function saveUserToLocalStorage(userData) {
    if (!userData) {
        localStorage.removeItem('currentUser');
        return;
    }
    const storageData = {
        uid: userData.uid,
        email: userData.email,
        nama: userData.nama,
        role: userData.role,
        kelas: userData.kelas || '',
        jurusan: userData.jurusan || '',
        fpId: userData.fpId || null,
        photoUrl: userData.photoUrl || '',
        subject: userData.subject || '',
        bidang: userData.bidang || '',
        registeredAt: userData.registeredAt
    };
    localStorage.setItem('currentUser', JSON.stringify(storageData));
}

function loadUserFromLocalStorage() {
    const savedData = localStorage.getItem('currentUser');
    if (savedData) {
        try {
            return JSON.parse(savedData);
        } catch (e) {
            console.error("Error parsing localStorage data:", e);
            localStorage.removeItem('currentUser');
        }
    }
    return null;
}

function clearUserSession() {
    localStorage.removeItem('currentUser');
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// ======================== FUNGSI FILTER BERDASARKAN ROLE ========================

/**
 * Mendapatkan daftar siswa yang sesuai dengan role pengguna
 * - Admin/Developer: semua siswa
 * - Wakil Kepala Sekolah: semua siswa
 * - Staff TU: semua siswa (hanya baca)
 * - Guru: semua siswa
 * - Siswa: hanya siswa dengan kelas & jurusan yang sama
 */
function getFilteredStudentsForDashboard() {
    if (!dbData.users) return [];
    
    // Filter siswa yang valid (punya nama)
    const validStudents = dbData.users.filter(s => s && s.nama && s.nama !== 'Tidak Diketahui' && s.nama.trim() !== '');
    
    // Role dengan akses baca semua data
    if (currentUser && hasReadAllAccess(currentUser.role)) {
        console.log(`📊 Full access (${getRoleDisplayName(currentUser.role)}): menampilkan semua siswa`);
        return validStudents;
    }
    
    // Siswa hanya melihat data kelas dan jurusannya sendiri
    if (currentUser && currentUser.role === 'siswa') {
        const userKelas = currentUser.kelas;
        const userJurusan = currentUser.jurusan;
        
        console.log(`📊 Student access: filter by kelas=${userKelas}, jurusan=${userJurusan}`);
        
        const filtered = validStudents.filter(s => {
            const matchKelas = !userKelas || s.kelas === userKelas;
            const matchJurusan = !userJurusan || s.jurusan === userJurusan;
            return matchKelas && matchJurusan;
        });
        
        console.log(`📊 Filtered students: ${filtered.length} dari ${validStudents.length} total`);
        return filtered;
    }
    
    return validStudents;
}

/**
 * Mendapatkan data absensi yang sesuai dengan role pengguna
 */
function getFilteredAttendanceForDashboard() {
    if (!dbData.attendance) return [];
    
    // Role dengan akses baca semua data
    if (currentUser && hasReadAllAccess(currentUser.role)) {
        return dbData.attendance;
    }
    
    // Siswa hanya melihat absensi kelas dan jurusannya sendiri
    if (currentUser && currentUser.role === 'siswa') {
        const userKelas = currentUser.kelas;
        const userJurusan = currentUser.jurusan;
        
        return dbData.attendance.filter(a => {
            const matchKelas = !userKelas || a.kelas === userKelas;
            const matchJurusan = !userJurusan || a.jurusan === userJurusan;
            return matchKelas && matchJurusan;
        });
    }
    
    return dbData.attendance;
}

// ======================== DASHBOARD UPDATE DENGAN FILTER ROLE ========================

async function updateDashboardModern() {
    if (!currentUser || typeof dbData === 'undefined' || !dbData) {
        console.log("⏳ Dashboard update skipped: no user or dbData");
        return;
    }
    
    if (!dbData.attendance || dbData.attendance.length === 0) {
        console.log("⏳ Dashboard update skipped: attendance data not ready yet");
        const filteredStudents = getFilteredStudentsForDashboard();
        updateDashboardStatsOnly(filteredStudents.length);
        return;
    }
    
    console.log(`📊 Updating modern dashboard with role-based filtering (${getRoleDisplayName(currentUser.role)})...`);
    
    try {
        const students = getFilteredStudentsForDashboard();
        const attendance = getFilteredAttendanceForDashboard();
        
        const totalSiswa = students.length;
        const trendSiswa = totalSiswa > 0 ? "+" + Math.floor(Math.random() * 10) : "0";
        
        const today = new Date().toISOString().split('T')[0];
        let todayAttendance = attendance.filter(a => a.date === today);
        
        if (typeof filterAttendanceByHoliday === 'function') {
            todayAttendance = filterAttendanceByHoliday(todayAttendance);
        }
        
        let hadir = 0;
        let tidakHadir = 0;
        let terlambat = 0;
        const hadirSet = new Set();
        const terlambatSet = new Set();
        
        todayAttendance.forEach(record => {
            if (record.status === 'Hadir' || record.status === 'Pulang') {
                if (!hadirSet.has(record.studentId)) {
                    hadirSet.add(record.studentId);
                    hadir++;
                }
                if (record.timeIn && record.timeIn > '07:30') {
                    terlambatSet.add(record.studentId);
                }
            }
        });
        
        terlambat = terlambatSet.size;
        tidakHadir = totalSiswa - hadir;
        const persenHadir = totalSiswa > 0 ? ((hadir / totalSiswa) * 100).toFixed(1) : 0;
        const persenTidakHadir = totalSiswa > 0 ? ((tidakHadir / totalSiswa) * 100).toFixed(1) : 0;
        const persenTerlambat = totalSiswa > 0 ? ((terlambat / totalSiswa) * 100).toFixed(1) : 0;
        
        updateDashboardStatsUI(totalSiswa, hadir, tidakHadir, terlambat, persenHadir, persenTidakHadir, persenTerlambat, trendSiswa);
        renderClassAttendanceForDashboard(students, attendance, today);
        renderRecentAttendanceForDashboard(attendance);
        updateDashboardRoleInfoUI();
        
        if (typeof window.updateDashboardChart === 'function') {
            window.updateDashboardChart();
        }
        
        console.log(`✅ Dashboard updated: ${totalSiswa} siswa, ${hadir} hadir hari ini (${getRoleDisplayName(currentUser.role)})`);
        
    } catch (err) {
        console.error("Error updating dashboard modern:", err);
    }
}

function updateDashboardStatsOnly(totalSiswa) {
    const elTotalSiswa = document.getElementById('statTotalSiswaNew');
    if (elTotalSiswa) elTotalSiswa.innerText = totalSiswa;
    
    const elTrendSiswa = document.getElementById('statTrendSiswa');
    if (elTrendSiswa) elTrendSiswa.innerHTML = `0 dari periode lalu`;
    
    const elHadir = document.getElementById('statHadirHariIni');
    if (elHadir) elHadir.innerText = '0';
    
    const elPersenHadir = document.getElementById('statPersenHadir');
    if (elPersenHadir) elPersenHadir.innerHTML = `0% dari total siswa`;
    
    const elTidakHadir = document.getElementById('statTidakHadir');
    if (elTidakHadir) elTidakHadir.innerText = totalSiswa;
    
    const elPersenTidakHadir = document.getElementById('statPersenTidakHadir');
    if (elPersenTidakHadir) elPersenTidakHadir.innerHTML = `100% dari total siswa`;
    
    const elTerlambat = document.getElementById('statTerlambat');
    if (elTerlambat) elTerlambat.innerText = '0';
    
    const elPersenTerlambat = document.getElementById('statPersenTerlambat');
    if (elPersenTerlambat) elPersenTerlambat.innerHTML = `0% dari total siswa`;
}

function updateDashboardStatsUI(totalSiswa, hadir, tidakHadir, terlambat, persenHadir, persenTidakHadir, persenTerlambat, trendSiswa) {
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

function renderClassAttendanceForDashboard(students, attendance, today) {
    const container = document.getElementById('classAttendanceList');
    if (!container) return;
    
    let kelasMap = new Map();
    
    if (currentUser && currentUser.role === 'siswa') {
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
            kelasMap.set(userKelas, { total, hadir, persen: persen.toFixed(1) });
        }
    } else {
        students.forEach(s => {
            const kelas = s.kelas || 'Tanpa Kelas';
            if (!kelasMap.has(kelas)) {
                kelasMap.set(kelas, { total: 0, hadir: 0 });
            }
            kelasMap.get(kelas).total++;
        });
        
        attendance.forEach(record => {
            if (record.date === today && (record.status === 'Hadir' || record.status === 'Pulang')) {
                const student = students.find(s => s.id == record.studentId);
                if (student && student.kelas && kelasMap.has(student.kelas)) {
                    kelasMap.get(student.kelas).hadir++;
                }
            }
        });
        
        for (let [kelas, data] of kelasMap) {
            const persen = data.total > 0 ? (data.hadir / data.total) * 100 : 0;
            kelasMap.set(kelas, { ...data, persen: persen.toFixed(1) });
        }
    }
    
    const sortedKelas = Array.from(kelasMap.entries())
        .sort((a, b) => parseFloat(b[1].persen) - parseFloat(a[1].persen));
    
    if (sortedKelas.length === 0) {
        container.innerHTML = '<div class="class-item"><div class="class-name"><span>Belum ada data kelas</span><span>0%</span></div><div class="progress-bar"><div class="progress-fill" style="width:0%"></div></div></div>';
        return;
    }
    
    container.innerHTML = sortedKelas.map(([kelas, data]) => `
        <div class="class-item">
            <div class="class-name">
                <span>${escapeHtmlMain(kelas)}</span>
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

function renderRecentAttendanceForDashboard(attendance) {
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
                <div class="recent-name">${escapeHtmlMain(r.nama)}</div>
                <div class="recent-time">${r.timeIn || r.timeOut || ''} • ${r.date}</div>
            </div>
        </div>
    `).join('');
}

function updateDashboardRoleInfoUI() {
    if (!currentUser) return;
    
    const infoContainer = document.getElementById('dashboardRoleInfo');
    if (!infoContainer) {
        const statsGrid = document.querySelector('.stats-grid');
        if (statsGrid && !document.getElementById('dashboardRoleInfo')) {
            const infoDiv = document.createElement('div');
            infoDiv.id = 'dashboardRoleInfo';
            infoDiv.style.cssText = 'margin-bottom: 15px; padding: 10px 15px; background: var(--bg-hover); border-radius: 12px; border-left: 4px solid #00bcd4;';
            statsGrid.parentNode.insertBefore(infoDiv, statsGrid);
        } else {
            return;
        }
    }
    
    const roleIcon = getRoleIcon(currentUser.role);
    const roleDisplay = getRoleDisplayName(currentUser.role);
    const infoEl = document.getElementById('dashboardRoleInfo');
    
    if (infoEl) {
        if (currentUser.role === 'siswa') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>${roleIcon} <strong>Mode ${roleDisplay}</strong></span>
                    <span style="color: var(--text-muted);">|</span>
                    <span>📚 Kelas: <strong>${currentUser.kelas || '-'}</strong></span>
                    <span>🎓 Jurusan: <strong>${currentUser.jurusan || '-'}</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard hanya menampilkan data kelas Anda</span>
                </div>
            `;
        } else if (currentUser.role === 'guru') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>${roleIcon} <strong>Mode ${roleDisplay}</strong></span>
                    <span style="color: var(--text-muted);">|</span>
                    <span>📚 Mata Pelajaran: <strong>${currentUser.subject || '-'}</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard menampilkan semua data siswa</span>
                </div>
            `;
        } else if (currentUser.role === 'wakil_kepala') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>${roleIcon} <strong>Mode ${roleDisplay}</strong></span>
                    <span style="color: var(--text-muted);">|</span>
                    <span>📋 Bidang: <strong>${currentUser.bidang || '-'}</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard menampilkan semua data siswa</span>
                </div>
            `;
        } else if (currentUser.role === 'staff_tu') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>${roleIcon} <strong>Mode ${roleDisplay}</strong></span>
                    <span style="color: var(--text-muted);">|</span>
                    <span>📋 Departemen: <strong>${currentUser.departemen || '-'}</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard menampilkan semua data siswa</span>
                </div>
            `;
        } else if (currentUser.role === 'admin') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>${roleIcon} <strong>Mode ${roleDisplay}</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard menampilkan semua data siswa</span>
                </div>
            `;
        } else if (currentUser.role === 'developer') {
            infoEl.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <span>${roleIcon} <strong>Mode ${roleDisplay}</strong></span>
                    <span style="color: #00bcd4; font-size: 12px;">ℹ️ Dashboard menampilkan semua data siswa</span>
                </div>
            `;
        }
    }
}

function escapeHtmlMain(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================== PERIODIC REFRESH ========================

function startPeriodicRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        if (currentUser && typeof dbData !== 'undefined' && dbData?.attendance) {
            console.log("🔄 Periodic refresh: updating dashboard...");
            updateDashboardModern();
        }
    }, 30000);
}

function stopPeriodicRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        console.log("⏹️ Periodic refresh stopped");
    }
}

// ======================== LOAD COMPONENTS ========================

async function loadDashboardComponents() {
    console.log("🔧 Loading dashboard components...");
    if (typeof initDelayEventListeners === 'function') initDelayEventListeners();
    if (typeof initGlobalDelayListeners === 'function') initGlobalDelayListeners();
    if (typeof setupChartYearListener === 'function') setupChartYearListener();
    console.log("✅ Dashboard components loaded");
}

// ======================== AUTH STATE HANDLER ========================

function initAuthStateHandler() {
    console.log("🚀 Initializing auth state handler...");
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            console.log("👤 User found:", user.email);
            try {
                const snapshot = await db.ref('users_auth/' + user.uid).once('value');
                if (snapshot.exists()) {
                    const userData = snapshot.val();
                    
                    // Validasi role
                    const validRoles = ['developer', 'admin', 'wakil_kepala', 'staff_tu', 'guru', 'siswa'];
                    if (!userData.role || !validRoles.includes(userData.role)) {
                        userData.role = 'siswa';
                        console.log("🔧 Fixed invalid role to:", userData.role);
                    }
                    
                    currentUser = { uid: user.uid, email: user.email, ...userData };
                    if (currentUser.kelas) currentUser.kelas = currentUser.kelas.toUpperCase();
                    saveUserToLocalStorage(currentUser);
                    
                    if (!isInitialized) {
                        startPeriodicRefresh();
                        isInitialized = true;
                    }
                    await loadDashboardComponents();
                    if (typeof initApp === 'function') initApp();
                    
                    if (typeof initDashboard === 'function') {
                        initDashboard();
                    } else {
                        setTimeout(() => updateDashboardModern(), 100);
                    }
                    
                    console.log(`✅ Login successful for: ${currentUser.nama}, Role: ${getRoleDisplayName(currentUser.role)}`);
                } else {
                    console.warn("⚠️ User data not found!");
                    clearUserSession();
                    await auth.signOut();
                    showAuthScreen();
                    if (typeof showToast === 'function') showToast("Akun Anda telah dihapus oleh Admin.", "error");
                }
            } catch (err) {
                console.error("Auth state handler error:", err);
                showAuthScreen();
                if (typeof showToast === 'function') showToast("Error memuat data user: " + err.message, "error");
            }
        } else {
            console.log("👤 No user logged in");
            const savedUser = loadUserFromLocalStorage();
            if (savedUser && savedUser.uid) clearUserSession();
            stopPeriodicRefresh();
            isInitialized = false;
            showAuthScreen();
        }
    });
}

// ======================== EVENT LISTENER DATA READY ========================

function setupDataReadyListener() {
    if (mainDataReadyListenerAdded) {
        console.log("⚠️ dataReady listener already added, skipping");
        return;
    }
    mainDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for dashboard updates");
    window.addEventListener('dataReady', (e) => {
        console.log("🔄 main.js: dataReady received, updating dashboard");
        setTimeout(() => updateDashboardModern(), 100);
    });
}

function showAuthScreen() {
    const authSection = document.getElementById('auth-section');
    const dashboardSection = document.getElementById('dashboard-section');
    if (authSection) authSection.style.display = 'flex';
    if (dashboardSection) dashboardSection.style.display = 'none';
    currentUser = null;
}

function showDashboardScreen() {
    const authSection = document.getElementById('auth-section');
    const dashboardSection = document.getElementById('dashboard-section');
    if (authSection) authSection.style.display = 'none';
    if (dashboardSection) dashboardSection.style.display = 'block';
}

// ======================== FORCE REFRESH ========================

function forceRefreshAllData() {
    console.log("🔄 Manual force refresh triggered...");
    updateDashboardModern();
    if (typeof showToast === 'function') showToast("🔄 Data berhasil direfresh!", "success");
}

function resetAppState() {
    console.log("🔄 Resetting app state...");
    stopPeriodicRefresh();
    isInitialized = false;
    if (typeof dbData !== 'undefined') {
        dbData = { users: [], users_auth: [], attendance: [], codes: [] };
    }
    console.log("✅ App state reset complete");
}

// ======================== THEME MANAGEMENT (DARK/LIGHT MODE) ========================

/**
 * Inisialisasi tema (dark/light mode)
 */
function initTheme() {
    console.log("🎨 Initializing theme system...");
    
    const savedTheme = localStorage.getItem('theme') || 'dark';
    applyTheme(savedTheme);
    
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
        const newToggleBtn = themeToggleBtn.cloneNode(true);
        themeToggleBtn.parentNode.replaceChild(newToggleBtn, themeToggleBtn);
        
        newToggleBtn.addEventListener('click', () => {
            const currentTheme = document.body.classList.contains('light-mode') ? 'light' : 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
        });
        
        console.log("✅ Theme toggle button initialized");
    } else {
        console.warn("⚠️ Theme toggle button not found");
    }
}

/**
 * Menerapkan tema ke seluruh halaman
 * @param {string} theme - 'dark' atau 'light'
 */
function applyTheme(theme) {
    const isLight = theme === 'light';
    const toggleBtn = document.getElementById('themeToggleBtn');
    
    if (isLight) {
        document.body.classList.add('light-mode');
        if (toggleBtn) toggleBtn.innerHTML = '☀️';
        console.log("🌞 Light mode activated");
    } else {
        document.body.classList.remove('light-mode');
        if (toggleBtn) toggleBtn.innerHTML = '🌙';
        console.log("🌙 Dark mode activated");
    }
    
    localStorage.setItem('theme', theme);
    refreshThemeDependentComponents();
}

/**
 * Refresh komponen yang bergantung pada tema
 */
function refreshThemeDependentComponents() {
    if (typeof updateDashboardChart === 'function') {
        setTimeout(() => {
            try {
                updateDashboardChart();
                console.log("📊 Dashboard chart refreshed for theme change");
            } catch(e) {
                console.warn("Failed to refresh dashboard chart:", e);
            }
        }, 100);
    }
    
    if (typeof updateAttendanceDonutChart === 'function') {
        setTimeout(() => {
            try {
                updateAttendanceDonutChart();
                console.log("🍩 Attendance donut chart refreshed for theme change");
            } catch(e) {
                console.warn("Failed to refresh attendance donut chart:", e);
            }
        }, 150);
    }
    
    if (typeof loadRekap === 'function' && document.getElementById('tab-rekap')?.classList.contains('active')) {
        setTimeout(() => {
            try {
                loadRekap();
                console.log("📊 Rekap charts refreshed for theme change");
            } catch(e) {
                console.warn("Failed to refresh rekap charts:", e);
            }
        }, 200);
    }
    
    const sensorPanel = document.getElementById('sensorStatusPanel');
    if (sensorPanel && sensorPanel.style.display !== 'none') {
        if (typeof refreshSensorStatus === 'function') {
            setTimeout(() => {
                try {
                    refreshSensorStatus();
                    console.log("🔍 Sensor status refreshed for theme change");
                } catch(e) {
                    console.warn("Failed to refresh sensor status:", e);
                }
            }, 300);
        }
    }
}

/**
 * Mendapatkan tema saat ini
 * @returns {string} 'dark' atau 'light'
 */
function getCurrentTheme() {
    return document.body.classList.contains('light-mode') ? 'light' : 'dark';
}

/**
 * Toggle tema secara manual
 */
function toggleTheme() {
    const currentTheme = getCurrentTheme();
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
}

/**
 * Mendapatkan warna chart berdasarkan tema aktif
 * @returns {object} Warna untuk chart
 */
function getChartColorsByTheme() {
    const isLight = document.body.classList.contains('light-mode');
    return {
        gridColor: isLight ? '#e0e0e0' : '#333333',
        tickColor: isLight ? '#666666' : '#cccccc',
        labelColor: isLight ? '#333333' : '#ffffff',
        tooltipBackground: isLight ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
        tooltipColor: isLight ? '#333333' : '#ffffff',
        backgroundColor: isLight ? '#ffffff' : '#1a1d24',
        borderColor: isLight ? '#e2e8f0' : '#2a2e3a'
    };
}

// ======================== EKSPOR KE GLOBAL ========================
window.forceRefreshAllData = forceRefreshAllData;
window.saveUserToLocalStorage = saveUserToLocalStorage;
window.clearUserSession = clearUserSession;
window.showAuthScreen = showAuthScreen;
window.showDashboardScreen = showDashboardScreen;
window.resetAppState = resetAppState;
window.stopPeriodicRefresh = stopPeriodicRefresh;
window.updateDashboardModern = updateDashboardModern;
window.getFilteredStudentsForDashboard = getFilteredStudentsForDashboard;
window.getFilteredAttendanceForDashboard = getFilteredAttendanceForDashboard;

// Ekspor fungsi role helper
window.getRoleDisplayName = getRoleDisplayName;
window.getRoleIcon = getRoleIcon;
window.hasFullAccess = hasFullAccess;
window.hasReadAllAccess = hasReadAllAccess;
window.hasManagementAccess = hasManagementAccess;
window.canAccessRekap = canAccessRekap;
window.canAccessAISummary = canAccessAISummary;

// Ekspor fungsi tema
window.initTheme = initTheme;
window.applyTheme = applyTheme;
window.toggleTheme = toggleTheme;
window.getCurrentTheme = getCurrentTheme;
window.getChartColorsByTheme = getChartColorsByTheme;
window.refreshThemeDependentComponents = refreshThemeDependentComponents;

// ======================== AUTO INITIALIZATION ========================

function waitForFirebaseAndInit() {
    if (typeof db === 'undefined' || !db || typeof auth === 'undefined' || !auth) {
        console.log("⏳ Waiting for Firebase (db/auth)...");
        setTimeout(waitForFirebaseAndInit, 500);
        return;
    }
    setupDataReadyListener();
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => initTheme(), 50);
        });
    } else {
        setTimeout(() => initTheme(), 50);
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => initAuthStateHandler(), 100));
    } else {
        setTimeout(() => initAuthStateHandler(), 100);
    }
}

waitForFirebaseAndInit();
console.log("✅ main.js V6.0 loaded - Role-based dashboard filtering (Developer, Kepala Sekolah, Wakil Kepala Sekolah, Staff TU, Guru, Siswa) & Theme management integrated");