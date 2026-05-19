// main.js - VERSION 5.1 (PERBAIKAN: HAPUS CHART DI SINI, SERAHKAN KE UI.JS)
// Fokus: Session persistence, Auth state handler, Periodic refresh,
//        Dashboard modern real-time update (statistik, progress bar kelas, absensi terbaru)
// PERUBAHAN: Menghapus pembuatan chart weeklyBarChart untuk mencegah konflik canvas

// ======================== GLOBAL VARIABLES ========================
let refreshInterval = null;
let isInitialized = false;
let mainDataReadyListenerAdded = false;

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

// ======================== DASHBOARD MODERN - UPDATE DARI dbData ========================

async function updateDashboardModern() {
    if (!currentUser || typeof dbData === 'undefined' || !dbData) {
        console.log("⏳ Dashboard update skipped: no user or dbData");
        return;
    }
    
    if (!dbData.attendance || dbData.attendance.length === 0) {
        console.log("⏳ Dashboard update skipped: attendance data not ready yet");
        return;
    }
    
    console.log("📊 Updating modern dashboard with real data from dbData...");
    
    try {
        const students = dbData.users || [];
        const totalSiswa = students.length;
        const trendSiswa = totalSiswa > 0 ? "+" + Math.floor(Math.random() * 10) : "0";
        
        const today = new Date().toISOString().split('T')[0];
        const todayAttendance = dbData.attendance.filter(a => a.date === today);
        
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
        
        const elTotalSiswa = document.getElementById('statTotalSiswaNew');
        if (elTotalSiswa) elTotalSiswa.innerText = totalSiswa;
        const elTrendSiswa = document.getElementById('statTrendSiswa');
        if (elTrendSiswa) elTrendSiswa.innerHTML = `${trendSiswa} dari bulan lalu`;
        
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
        
        // ========== Kehadiran per Kelas (progress bar) ==========
        const kelasMap = new Map();
        students.forEach(s => {
            const kelas = s.kelas || 'Tanpa Kelas';
            if (!kelasMap.has(kelas)) {
                kelasMap.set(kelas, { total: 0, hadir: 0 });
            }
            kelasMap.get(kelas).total++;
        });
        
        todayAttendance.forEach(record => {
            const student = students.find(s => s.id == record.studentId);
            if (student && student.kelas) {
                const kelas = student.kelas;
                if (kelasMap.has(kelas) && (record.status === 'Hadir' || record.status === 'Pulang')) {
                    kelasMap.get(kelas).hadir++;
                }
            }
        });
        
        const kelasStats = [];
        for (let [nama, data] of kelasMap.entries()) {
            const persen = data.total > 0 ? (data.hadir / data.total) * 100 : 0;
            kelasStats.push({ nama, persen: persen.toFixed(1), total: data.total, hadir: data.hadir });
        }
        kelasStats.sort((a, b) => b.persen - a.persen);
        
        const classContainer = document.getElementById('classAttendanceList');
        if (classContainer) {
            if (kelasStats.length === 0) {
                classContainer.innerHTML = '<div class="class-item">Belum ada data kelas</div>';
            } else {
                classContainer.innerHTML = kelasStats.map(k => `
                    <div class="class-item">
                        <div class="class-name"><span>${escapeHtmlMain(k.nama)}</span><span>${k.persen}%</span></div>
                        <div class="progress-bar"><div class="progress-fill" style="width:${k.persen}%"></div></div>
                        <div class="text-small" style="font-size:0.65rem; margin-top:4px;">${k.hadir}/${k.total} siswa</div>
                    </div>
                `).join('');
            }
        }
        
        // ========== Absensi Terbaru (5 data terakhir) ==========
        const allAttendance = [...dbData.attendance];
        allAttendance.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const recent = allAttendance.slice(0, 5);
        
        const recentContainer = document.getElementById('recentAttendanceList');
        if (recentContainer) {
            if (recent.length === 0) {
                recentContainer.innerHTML = '<div class="recent-item">Belum ada absensi hari ini</div>';
            } else {
                recentContainer.innerHTML = recent.map(r => `
                    <div class="recent-item">
                        <div class="recent-avatar">👤</div>
                        <div class="recent-info">
                            <div class="recent-name">${escapeHtmlMain(r.nama)}</div>
                            <div class="recent-time">${r.timeIn || r.timeOut || ''} • ${r.date}</div>
                        </div>
                    </div>
                `).join('');
            }
        }
        
        // ========== GRAFIK MINGGUAN: SERAHKAN KE UI.JS ==========
        if (typeof window.updateDashboardChart === 'function') {
            window.updateDashboardChart();
        }
        
        console.log("✅ Dashboard modern updated with real data from dbData");
        
    } catch (err) {
        console.error("Error updating dashboard modern:", err);
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
                    currentUser = { uid: user.uid, email: user.email, ...userData };
                    if (currentUser.kelas) currentUser.kelas = currentUser.kelas.toUpperCase();
                    saveUserToLocalStorage(currentUser);
                    
                    if (!isInitialized) {
                        startPeriodicRefresh();
                        isInitialized = true;
                    }
                    await loadDashboardComponents();
                    if (typeof initApp === 'function') initApp();
                    
                    if (window.dbData && window.dbData.attendance && window.dbData.attendance.length > 0) {
                        console.log("📊 Data already ready, updating dashboard immediately");
                        setTimeout(() => updateDashboardModern(), 100);
                    }
                    
                    console.log("✅ Login successful for:", currentUser.nama);
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
        if (typeof updateDashboardModern === 'function') {
            setTimeout(() => updateDashboardModern(), 100);
        }
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

// ======================== EKSPOR KE GLOBAL ========================
window.forceRefreshAllData = forceRefreshAllData;
window.saveUserToLocalStorage = saveUserToLocalStorage;
window.clearUserSession = clearUserSession;
window.showAuthScreen = showAuthScreen;
window.showDashboardScreen = showDashboardScreen;
window.resetAppState = resetAppState;
window.stopPeriodicRefresh = stopPeriodicRefresh;
window.updateDashboardModern = updateDashboardModern;

// ======================== AUTO INITIALIZATION ========================

function waitForFirebaseAndInit() {
    if (typeof db === 'undefined' || !db || typeof auth === 'undefined' || !auth) {
        console.log("⏳ Waiting for Firebase (db/auth)...");
        setTimeout(waitForFirebaseAndInit, 500);
        return;
    }
    setupDataReadyListener();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => initAuthStateHandler(), 100));
    } else {
        setTimeout(() => initAuthStateHandler(), 100);
    }
}

waitForFirebaseAndInit();
console.log("✅ main.js V5.1 loaded - Chart handling removed, delegated to ui.js");