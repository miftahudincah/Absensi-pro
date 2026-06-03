// attendance.js - VERSION 5.0 (DENGAN INTEGRASI WHATSAPP NOTIFIKASI)
// Mengelola data absensi, filter, validasi delay pulang,
// serta manual status (sakit, izin, alpha) untuk siswa yang tidak hadir.
// PERUBAHAN V5.0: 
//   - Menambahkan notifikasi WhatsApp saat absen masuk/pulang/terlambat
//   - Menambahkan fungsi kirim notifikasi ke orang tua
// ============================================================================

// ======================== GLOBAL VARIABLES ========================
let attendanceDonutChart = null;
let attendanceDataReadyListenerAdded = false;
let attendanceRetryCount = 0;
const MAX_ATTENDANCE_RETRY = 15;

// Cache untuk foto siswa di attendance
const attendancePhotoCache = new Map();

// ======================== FUNGSI FOTO SISWA ========================

/**
 * Mendapatkan URL foto siswa untuk tabel absensi
 * @param {string|number} studentId - ID siswa
 * @param {string} studentName - Nama siswa (fallback)
 * @returns {string} URL foto atau avatar inisial
 */
function getAttendanceStudentPhotoUrl(studentId, studentName) {
    if (!studentId) {
        const initial = studentName ? studentName.charAt(0).toUpperCase() : 'U';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=00bcd4&color=fff&size=100&bold=true`;
    }
    
    // Cek cache
    if (attendancePhotoCache.has(studentId)) {
        return attendancePhotoCache.get(studentId);
    }
    
    // Cari user auth yang memiliki fpId = studentId
    const userAuth = dbData?.users_auth?.find(u => u.fpId == studentId);
    
    let photoUrl;
    if (userAuth && userAuth.photoUrl && userAuth.photoUrl !== 'null' && userAuth.photoUrl !== 'undefined') {
        photoUrl = userAuth.photoUrl;
    } else {
        // Fallback: avatar inisial nama
        const initial = studentName ? studentName.charAt(0).toUpperCase() : 'U';
        photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=00bcd4&color=fff&size=100&bold=true`;
    }
    
    // Simpan ke cache
    attendancePhotoCache.set(studentId, photoUrl);
    return photoUrl;
}

/**
 * Clear cache foto attendance
 */
function clearAttendancePhotoCache() {
    attendancePhotoCache.clear();
    console.log("🖼️ Attendance photo cache cleared");
}

/**
 * Setup listener untuk update foto di attendance
 */
function setupAttendancePhotoListener() {
    if (!db) return;
    
    db.ref('users_auth').on('child_changed', (snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.photoUrl && userData.fpId) {
            console.log(`🖼️ Photo changed for student ID: ${userData.fpId}, clearing attendance cache`);
            attendancePhotoCache.delete(userData.fpId);
            if (typeof renderTable === 'function') {
                renderTable();
            }
        }
    });
}

/**
 * Modal untuk melihat foto siswa dari absensi
 */
function showAttendanceStudentPhoto(studentId, studentName, photoUrl) {
    const userAuth = dbData?.users_auth?.find(u => u.fpId == studentId);
    const hasAccount = !!userAuth;
    const accountInfo = hasAccount 
        ? `✅ Sudah memiliki akun (${userAuth.email || userAuth.nama})` 
        : '❌ Belum memiliki akun. Foto menggunakan inisial nama.';
    
    let modalHtml = `
        <div id="modal-attendance-photo" class="modal-overlay open">
            <div class="modal-box" style="max-width: 500px; text-align: center;">
                <div class="modal-title">
                    <span>📸 Foto ${escapeHtml(studentName)}</span>
                    <span onclick="closeModal('modal-attendance-photo')">✖</span>
                </div>
                <div style="padding: 20px;">
                    <img src="${photoUrl}" 
                         style="max-width: 100%; max-height: 60vh; border-radius: 20px; object-fit: contain;"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(studentName?.charAt(0) || 'U')}&background=00bcd4&color=fff&size=200&bold=true'">
                    <p style="margin-top: 15px;">
                        <strong>${escapeHtml(studentName)}</strong><br>
                        <span style="color: var(--text-muted);">ID: ${studentId}</span>
                    </p>
                    <hr>
                    <div class="text-small" style="color: var(--text-muted); padding: 8px; background: var(--bg-hover); border-radius: 8px;">
                        ℹ️ ${accountInfo}<br>
                        ${hasAccount ? 'Foto ini sinkron dengan akun siswa.' : 'Silakan daftarkan akun siswa untuk memiliki foto profil.'}
                    </div>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeModal('modal-attendance-photo')">Tutup</button>
                </div>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('modal-attendance-photo');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ======================== NOTIFIKASI WHATSAPP ========================

/**
 * Kirim notifikasi WhatsApp ke orang tua siswa
 * @param {string} studentId - ID siswa
 * @param {string} studentName - Nama siswa
 * @param {string} type - Jenis notifikasi ('check_in', 'check_out', 'late', 'alpha')
 * @param {string} time - Waktu kejadian
 * @param {string} date - Tanggal (opsional)
 */
async function sendParentNotification(studentId, studentName, type, time, date = null) {
    // Cek apakah fitur WhatsApp diaktifkan
    if (typeof window.WHATSAPP_CONFIG === 'undefined' || !window.WHATSAPP_CONFIG.enabled) {
        console.log('📱 WhatsApp notification disabled');
        return;
    }
    
    // Cek notifikasi berdasarkan jenis
    if (type === 'check_in' && !window.WHATSAPP_CONFIG.sendOnCheckIn) return;
    if (type === 'check_out' && !window.WHATSAPP_CONFIG.sendOnCheckOut) return;
    if (type === 'late' && !window.WHATSAPP_CONFIG.sendOnLate) return;
    if (type === 'alpha' && !window.WHATSAPP_CONFIG.sendOnAbsent) return;
    
    try {
        // Ambil nomor WhatsApp orang tua
        let phoneNumber = null;
        
        // Cari dari parent_contacts
        const parentSnapshot = await db.ref(`parent_contacts/${studentId}`).once('value');
        const parentData = parentSnapshot.val();
        
        if (parentData && parentData.phoneNumber) {
            phoneNumber = parentData.phoneNumber;
        } else {
            // Cari dari data siswa
            const studentSnapshot = await db.ref(`users/${studentId}`).once('value');
            const student = studentSnapshot.val();
            if (student && student.wa_ortu) {
                phoneNumber = student.wa_ortu;
            }
        }
        
        if (!phoneNumber) {
            console.log(`📱 No WhatsApp number for student ${studentName} (ID: ${studentId})`);
            return;
        }
        
        // Format nomor
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.startsWith('0')) formattedNumber = '62' + formattedNumber.substring(1);
        if (!formattedNumber.startsWith('62')) formattedNumber = '62' + formattedNumber;
        
        // Format tanggal
        const today = date || new Date().toISOString().split('T')[0];
        const formattedDate = formatIndonesianDate(today);
        
        // Buat pesan sesuai jenis
        let title = '';
        let message = '';
        
        switch(type) {
            case 'check_in':
                title = '✅ Anak Anda Telah Masuk Sekolah';
                message = `*${studentName}* telah masuk sekolah pada pukul *${time}*.\n\n📅 Tanggal: ${formattedDate}\n\nSemangat belajar! 📚✨`;
                break;
            case 'late':
                title = '⚠️ Peringatan: Anak Anda Terlambat';
                message = `*${studentName}* terlambat masuk sekolah pada pukul *${time}*.\n\n📅 Tanggal: ${formattedDate}\n\nMohon perhatikan jam kedatangan anak Anda. 🕐`;
                break;
            case 'check_out':
                title = '🏠 Anak Anda Telah Pulang Sekolah';
                message = `*${studentName}* telah pulang sekolah pada pukul *${time}*.\n\n📅 Tanggal: ${formattedDate}\n\nSemoga sampai rumah dengan selamat. 🏡`;
                break;
            case 'alpha':
                title = '⚠️ Peringatan: Anak Tidak Masuk Sekolah';
                message = `*${studentName}* TIDAK HADIR pada tanggal *${formattedDate}* tanpa keterangan.\n\nMohon konfirmasi ke wali kelas untuk informasi lebih lanjut. 📞`;
                break;
        }
        
        // Kirim notifikasi via Fonnte jika fungsi tersedia
        if (typeof sendViaFonnte === 'function') {
            const fullMessage = `*📢 SISTEM ABSENSI SEKOLAH*\n\n*${title}*\n\n${message}\n\n---\n📱 Sistem Absensi IoT - Real-time`;
            const result = await sendViaFonnte(formattedNumber, fullMessage);
            if (result) {
                console.log(`📱 WhatsApp sent to ${studentName}: ${type}`);
                
                // Simpan log notifikasi
                await db.ref(`notifications_log/${studentId}/${Date.now()}`).set({
                    type: type,
                    phoneNumber: formattedNumber,
                    time: time,
                    date: today,
                    sentAt: firebase.database.ServerValue.TIMESTAMP
                });
            }
        }
        
    } catch (error) {
        console.error('Send parent notification error:', error);
    }
}

/**
 * Format tanggal Indonesia
 */
function formatIndonesianDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parts[2]} ${bulan[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

// ======================== EVENT LISTENER ========================

function setupAttendanceDataReadyListener() {
    if (attendanceDataReadyListenerAdded) return;
    attendanceDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for attendance module");

    window.addEventListener('dataReady', (e) => {
        console.log("📋 attendance.js: dataReady received, updating attendance UI");
        
        attendanceRetryCount = 0;
        waitForAttendanceElements(() => {
            if (typeof populateFilters === 'function') populateFilters();
            if (typeof populateDateFilter === 'function') populateDateFilter();
            if (typeof updateAttendanceDonutChart === 'function') updateAttendanceDonutChart();
            if (typeof renderTable === 'function') renderTable();
        });
    });

    const originalSwitchTab = window.switchTab;
    if (originalSwitchTab) {
        window.switchTab = function(tabId) {
            originalSwitchTab(tabId);
            if (tabId === 'attendance') {
                setTimeout(() => {
                    waitForAttendanceElements(() => {
                        if (typeof populateFilters === 'function') populateFilters();
                        if (typeof populateDateFilter === 'function') populateDateFilter();
                        if (typeof renderTable === 'function') renderTable();
                        if (typeof updateAttendanceDonutChart === 'function') updateAttendanceDonutChart();
                    });
                }, 150);
            }
        };
    }
}

function waitForAttendanceElements(callback) {
    const tbody = document.getElementById('tbody-attendance');
    const filterKelas = document.getElementById('filterKelas');
    const filterJurusan = document.getElementById('filterJurusan');
    const filterDate = document.getElementById('filterDate');
    
    if (tbody && filterKelas && filterJurusan && filterDate) {
        console.log("✅ Attendance DOM elements found, executing callback");
        attendanceRetryCount = 0;
        if (callback) callback();
        return true;
    }
    
    if (attendanceRetryCount < MAX_ATTENDANCE_RETRY) {
        attendanceRetryCount++;
        console.log(`⏳ Waiting for attendance DOM elements, retry ${attendanceRetryCount}/${MAX_ATTENDANCE_RETRY}...`);
        setTimeout(() => waitForAttendanceElements(callback), 300);
        return false;
    }
    
    console.error("❌ Attendance DOM elements not found after max retries!");
    const tabAttendance = document.getElementById('tab-attendance');
    if (tabAttendance) {
        console.log("🔧 Attempting to create attendance table dynamically...");
        createAttendanceTableDynamic();
        if (callback) setTimeout(callback, 100);
    }
    return false;
}

function createAttendanceTableDynamic() {
    const tabAttendance = document.getElementById('tab-attendance');
    if (!tabAttendance) return;
    
    let tableContainer = tabAttendance.querySelector('.table-container');
    if (!tableContainer) {
        tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        tabAttendance.appendChild(tableContainer);
        console.log("✅ Created table-container dynamically");
    }
    
    let table = tableContainer.querySelector('table');
    if (!table) {
        table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Foto</th>
                    <th>Waktu</th>
                    <th>ID FP</th>
                    <th>Nama</th>
                    <th>Kelas</th>
                    <th>Jurusan</th>
                    <th>Status</th>
                    <th>Aksi</th>
                </tr>
            </thead>
            <tbody id="tbody-attendance">
                <tr><td colspan="8" style="text-align:center; padding:20px;">Memuat data...<\/td></tr>
            </tbody>
        `;
        tableContainer.appendChild(table);
        console.log("✅ Created attendance table dynamically with photo column");
    }
}

// ======================== POPULATE FILTER DROPDOWNS ========================

function populateFilters() {
    console.log("🔧 populateFilters dipanggil untuk tab Absensi");
    
    const kelasSelect = document.getElementById('filterKelas');
    const jurusanSelect = document.getElementById('filterJurusan');
    
    if (!kelasSelect || !jurusanSelect) {
        console.warn("⚠️ Filter elements not found, retrying in 500ms...");
        setTimeout(() => populateFilters(), 500);
        return;
    }
    
    let kelasOptions = [];
    if (window.currentSchoolConfig && window.currentSchoolConfig.classes && window.currentSchoolConfig.classes.length > 0) {
        kelasOptions = window.currentSchoolConfig.classes;
        console.log(`📚 Menggunakan kelas dari school_config: ${kelasOptions.length} kelas`);
    } else {
        const schoolType = window.currentSchoolConfig?.type || 'smp';
        if (schoolType === 'smp') {
            kelasOptions = ['VII', 'VIII', 'IX'];
        } else if (schoolType === 'smk') {
            kelasOptions = ['X', 'XI', 'XII'];
        } else {
            kelasOptions = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
        }
        console.log(`📚 Menggunakan kelas default (${schoolType}): ${kelasOptions.join(', ')}`);
    }
    
    const currentKelas = kelasSelect.value;
    const currentJurusan = jurusanSelect.value;
    
    kelasSelect.innerHTML = '<option value="all">📚 Semua Kelas</option>';
    kelasOptions.forEach(kelas => {
        kelasSelect.innerHTML += `<option value="${kelas}">${kelas}</option>`;
    });
    if (currentKelas !== 'all' && kelasOptions.includes(currentKelas)) {
        kelasSelect.value = currentKelas;
    }
    
    let jurusanOptions = [];
    if (window.currentSchoolConfig && window.currentSchoolConfig.majors && window.currentSchoolConfig.majors.length > 0) {
        jurusanOptions = window.currentSchoolConfig.majors;
        console.log(`🎓 Menggunakan jurusan dari school_config: ${jurusanOptions.length} jurusan`);
    } else {
        jurusanOptions = ['UMUM'];
        console.log(`🎓 Menggunakan jurusan default: UMUM`);
    }
    
    jurusanSelect.innerHTML = '<option value="all">🎓 Semua Jurusan</option>';
    jurusanOptions.forEach(jurusan => {
        jurusanSelect.innerHTML += `<option value="${jurusan}">${jurusan}</option>`;
    });
    if (currentJurusan !== 'all' && jurusanOptions.includes(currentJurusan)) {
        jurusanSelect.value = currentJurusan;
    }
    
    console.log(`✅ populateFilters selesai: ${kelasOptions.length} kelas, ${jurusanOptions.length} jurusan`);
}

function populateDateFilter() {
    console.log("🔧 populateDateFilter dipanggil");
    
    const dateSelect = document.getElementById('filterDate');
    if (!dateSelect) {
        console.warn("⚠️ filterDate element not found, retrying in 500ms...");
        setTimeout(() => populateDateFilter(), 500);
        return;
    }
    
    const currentValue = dateSelect.value;
    dateSelect.innerHTML = '<option value="all">📅 Semua Tanggal</option>';
    dateSelect.innerHTML += '<option value="today">📆 Hari Ini</option>';
    
    for (let i = 1; i <= 7; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = date.toLocaleDateString('id-ID', { weekday: 'long' });
        dateSelect.innerHTML += `<option value="${dateStr}">${dayName}, ${dateStr}</option>`;
    }
    
    if (currentValue && currentValue !== 'all' && currentValue !== 'today') {
        const exists = Array.from(dateSelect.options).some(opt => opt.value === currentValue);
        if (exists) dateSelect.value = currentValue;
    }
    console.log(`✅ populateDateFilter selesai, total options: ${dateSelect.options.length}`);
}

// ======================== UTILITY UNTUK HARI LIBUR ========================
if (typeof isHoliday === 'undefined') {
    window.isHoliday = function(dateStr) { return false; };
}
if (typeof filterAttendanceByHoliday === 'undefined') {
    window.filterAttendanceByHoliday = function(arr) { return arr; };
}

// ======================== INITIALIZATION (UI ONLY) ========================

function initAttendanceUI() {
    console.log("📊 Initializing attendance UI (chart, etc)...");
    if (typeof Audio !== 'undefined') {
        new Audio();
    }
    waitForAttendanceElements(() => {
        populateFilters();
        populateDateFilter();
        setTimeout(() => updateAttendanceDonutChart(), 100);
    });
}

function updateAttendanceDonutChart() {
    const canvas = document.getElementById('attendanceDonutChart');
    if (!canvas) {
        console.warn("attendanceDonutChart canvas not found");
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!dbData || !dbData.attendance) {
        console.warn("Data absensi belum siap untuk chart");
        return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    let todayData = dbData.attendance.filter(r => r.date === today);
    if (typeof filterAttendanceByHoliday === 'function') {
        todayData = filterAttendanceByHoliday(todayData);
    }
    const hadir = todayData.filter(r => r.status === 'Hadir').length;
    const pulang = todayData.filter(r => r.status === 'Pulang').length;
    
    if (attendanceDonutChart) {
        attendanceDonutChart.destroy();
        attendanceDonutChart = null;
    }
    
    attendanceDonutChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['✅ Masuk (Belum Pulang)', '🏠 Pulang'],
            datasets: [{
                data: [hadir, pulang],
                backgroundColor: ['#ff9800', '#4caf50'],
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '65%',
            plugins: {
                legend: { position: 'bottom', labels: { color: '#fff', font: { size: 11 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} siswa` } }
            }
        }
    });
    
    const statsText = document.getElementById('todayStatsText');
    if (statsText) {
        statsText.innerHTML = `✅ Masuk: ${hadir} orang &nbsp;|&nbsp; 🏠 Pulang: ${pulang} orang`;
    }
}

// ======================== RENDER TABLE (DENGAN FOTO SISWA) ========================

async function renderTable() {
    console.log("📊 renderTable dipanggil - Total attendance:", dbData.attendance?.length || 0);
    
    let tbody = document.getElementById('tbody-attendance');
    if (!tbody) {
        console.warn("tbody-attendance not found, attempting to create...");
        createAttendanceTableDynamic();
        tbody = document.getElementById('tbody-attendance');
        if (!tbody) {
            console.error("❌ Still cannot find tbody-attendance after creation!");
            return;
        }
    }
    
    // Update header tabel jika perlu (pastikan ada kolom foto)
    const table = tbody.closest('table');
    const thead = table?.querySelector('thead tr');
    if (thead && !thead.querySelector('th:first-child')?.textContent.includes('Foto')) {
        thead.innerHTML = `
            <th>Foto</th>
            <th>Waktu</th>
            <th>ID FP</th>
            <th>Nama</th>
            <th>Kelas</th>
            <th>Jurusan</th>
            <th>Status</th>
            <th>Aksi</th>
        `;
        console.log("✅ Attendance table header updated with photo column");
    }
    
    const fDate = document.getElementById('filterDate') ? document.getElementById('filterDate').value : 'all';
    const fKelas = document.getElementById('filterKelas') ? document.getElementById('filterKelas').value : 'all';
    const fJurusan = document.getElementById('filterJurusan') ? document.getElementById('filterJurusan').value : 'all';

    let data = dbData.attendance ? [...dbData.attendance] : [];
    
    if (typeof filterAttendanceByHoliday === 'function') {
        data = filterAttendanceByHoliday(data);
    }
    
    if (currentUser && currentUser.role === 'siswa') {
        if (currentUser.kelas && currentUser.jurusan) {
            data = data.filter(r => r.kelas === currentUser.kelas && r.jurusan === currentUser.jurusan);
        } else {
            data = [];
        }
        if (fDate === 'today') {
            const todayStr = new Date().toISOString().split('T')[0];
            data = data.filter(r => r.date === todayStr);
        }
    } else {
        if (fDate === 'today') {
            const todayStr = new Date().toISOString().split('T')[0];
            data = data.filter(r => r.date === todayStr);
        } else if (fDate !== 'all') {
            data = data.filter(r => r.date === fDate);
        }
        if (fKelas !== 'all') data = data.filter(r => r.kelas === fKelas);
        if (fJurusan !== 'all') data = data.filter(r => r.jurusan === fJurusan);
    }

    data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#888;">
            📭 Data absensi tidak ditemukan.
            ${currentUser?.role === 'siswa' ? '<br><small>Hubungi guru untuk informasi lebih lanjut.</small>' : ''}
        <\/td><\/tr>`;
        updateAttendanceStatistics(data);
        updateAttendanceDonutChart();
        return;
    }
    
    let manualStatusMap = {};
    const targetDate = (fDate === 'today' || fDate === 'all') ? new Date().toISOString().split('T')[0] : fDate;
    if (targetDate !== 'all') {
        try {
            const statusSnapshot = await db.ref(`attendance_status/${targetDate}`).once('value');
            manualStatusMap = statusSnapshot.val() || {};
        } catch(e) {
            console.warn("Error fetching manual status:", e);
        }
    }
    
    let lateThreshold = '07:30';
    if (window.attendanceSettings && window.attendanceSettings.lateThreshold) {
        lateThreshold = window.attendanceSettings.lateThreshold;
    } else if (window.attendanceSettings === undefined && typeof getAttendanceSettings === 'function') {
        const settings = getAttendanceSettings();
        lateThreshold = settings.lateThreshold || '07:30';
    }
    
    let rows = [];
    for (const row of data) {
        const timeDisplay = row.timeIn || '-';
        const outDisplay = row.timeOut ? `<br><span class="text-small" style="color:var(--danger)">🏠 Pulang: ${row.timeOut}</span>` : '';
        const isNew = (Date.now() - new Date(row.timestamp).getTime() < 60000);
        
        // Ambil foto siswa
        const photoUrl = getAttendanceStudentPhotoUrl(row.studentId, row.nama);
        const studentInitial = row.nama ? row.nama.charAt(0).toUpperCase() : 'U';
        
        let statusHtml = '';
        const manual = manualStatusMap[row.studentId];
        if (manual && manual.status && manual.status !== 'hadir') {
            let icon = '', label = '', color = '';
            if (manual.status === 'sakit') { icon = '🤒'; label = 'Sakit'; color = '#ff9800'; }
            else if (manual.status === 'izin') { icon = '📝'; label = 'Izin'; color = '#2196f3'; }
            else if (manual.status === 'alpha') { icon = '❌'; label = 'Alpha (Bolos)'; color = '#f44336'; }
            statusHtml = `<span style="color:${color}; font-weight:500;">${icon} ${label}</span><br><small class="text-small">(Manual)</small>`;
        } else {
            let isLate = false;
            if (row.status === 'Hadir' && row.timeIn && row.timeIn > lateThreshold) {
                isLate = true;
            }
            if (row.status === 'Pulang') {
                statusHtml = `<span style="color:var(--danger); font-weight:500;">🏠 Pulang</span>`;
            } else if (isLate) {
                statusHtml = `<span style="color:#ff9800; font-weight:500;">⏰ Terlambat (${row.timeIn})</span>`;
            } else {
                statusHtml = `<span style="color:var(--success); font-weight:500;">✅ Hadir</span>`;
            }
        }
        
        rows.push(`
            <tr class="${isNew ? 'attendance-new-row' : ''}">
                <td style="text-align:center;">
                    <img src="${photoUrl}" 
                         class="attendance-student-avatar"
                         style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer; transition: transform 0.2s;"
                         onerror="this.src='https://ui-avatars.com/api/?name=${studentInitial}&background=00bcd4&color=fff&size=100&bold=true'"
                         onclick="showAttendanceStudentPhoto('${row.studentId}', '${escapeHtml(row.nama)}', this.src)"
                         title="Klik untuk lihat foto">
                </td>
                <td>⏰ ${timeDisplay}<br><span class="text-small">📅 ${row.date}</span>${outDisplay}</td>
                <td><strong>#${row.studentId}</strong></td>
                <td>${escapeHtml(row.nama)}</div>
                <td>${row.kelas || '-'}</div>
                <td>${row.jurusan || '-'}</div>
                <td>${statusHtml}</div>
                <td class="role-guru role-admin role-developer">
                    <button class="btn-icon delete" onclick="deleteAttendance('${row.id}')" title="Hapus Data">🗑️</button>
                </td>
            </tr>
        `);
    }
    tbody.innerHTML = rows.join('');
    
    updateAttendanceStatistics(data);
    updateAttendanceDonutChart();
}

function updateAttendanceStatistics(data) {
    let statsContainer = document.getElementById('attendanceStats');
    if (!statsContainer) {
        const controlsBar = document.querySelector('#tab-attendance .controls-bar');
        if (controlsBar && !document.getElementById('attendanceStats')) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'attendanceStats';
            statsContainer.style.marginBottom = '10px';
            statsContainer.style.padding = '10px';
            statsContainer.style.background = 'var(--bg-card)';
            statsContainer.style.borderRadius = '8px';
            controlsBar.insertAdjacentElement('afterend', statsContainer);
        } else return;
    }
    
    const today = new Date().toISOString().split('T')[0];
    let todayData = data.filter(r => r.date === today);
    if (typeof filterAttendanceByHoliday === 'function') {
        todayData = filterAttendanceByHoliday(todayData);
    }
    const hadirToday = todayData.filter(r => r.status === 'Hadir').length;
    const pulangToday = todayData.filter(r => r.status === 'Pulang').length;
    const totalUnique = [...new Set(data.map(r => r.studentId))].length;
    
    statsContainer.innerHTML = `
        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
            <div><span style="color: #4a90e2;">📅 Hari Ini:</span> <strong>${hadirToday}</strong> Hadir, <strong>${pulangToday}</strong> Pulang<\/div>
            <div><span style="color: #4a90e2;">👥 Total Hari Ini:</span> <strong>${todayData.length}</strong> Transaksi<\/div>
            <div><span style="color: #4a90e2;">📊 Total Unik:</span> <strong>${totalUnique}</strong> Siswa<\/div>
        <\/div>
    `;
}

// ======================== DELETE ATTENDANCE (DENGAN LOG) ========================

function deleteAttendance(id) {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    if (currentUser.role === 'siswa') {
        showToast("⛔ Akses Ditolak: Siswa tidak diizinkan menghapus data!", "error");
        return;
    }
    if (!confirm("⚠️ Apakah Anda yakin ingin menghapus data absensi ini?\n\nTindakan ini tidak dapat dibatalkan!")) return;
    
    const lastDashIndex = id.lastIndexOf('-');
    const date = id.substring(0, lastDashIndex);
    const fpId = id.substring(lastDashIndex + 1);
    
    const attendanceRecord = dbData.attendance.find(a => a.id === id);
    const studentName = attendanceRecord?.nama || fpId;
    
    const btns = document.querySelectorAll(`button[onclick="deleteAttendance('${id}')"]`);
    btns.forEach(btn => { btn.disabled = true; btn.textContent = '⏳'; });
    
    db.ref(`absensi/${date}/${fpId}`).remove()
        .then(() => {
            showToast("✅ Data absensi berhasil dihapus", "success");
            if (typeof logActivity === 'function') {
                logActivity('delete_attendance', `Menghapus absensi ${studentName} (ID: ${fpId}) pada tanggal ${date}`);
            }
        })
        .catch((error) => showToast("❌ Gagal menghapus: " + error.message, "error"))
        .finally(() => {
            btns.forEach(btn => { btn.disabled = false; btn.textContent = '🗑️'; });
        });
}

// ======================== SIMULASI SCAN MASUK (DENGAN NOTIFIKASI WHATSAPP) ========================

let currentStudentsListForIn = [];

function openSimulateInModal() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Admin, Guru, dan Developer yang dapat mensimulasikan absen!", "error");
        return;
    }
    
    const students = dbData.users;
    if (!students || students.length === 0) {
        showToast("❌ Belum ada data siswa di database!", "error");
        return;
    }
    currentStudentsListForIn = [...students];
    
    const modalId = 'modal-simulate-in';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    const modalHtml = `
        <div id="${modalId}" class="modal-overlay open">
            <div class="modal-box" style="max-width: 500px;">
                <div class="modal-title">
                    <span>📷 Simulasi Scan Masuk</span>
                    <span onclick="closeModal('${modalId}')">✖</span>
                </div>
                <div style="padding: 20px;">
                    <div class="form-group">
                        <label>🔍 Cari Siswa (Nama atau ID)</label>
                        <input type="text" id="simulateInSearchInput" class="form-control" placeholder="Ketik nama atau ID siswa..." style="width:100%; padding:10px; margin-bottom:10px;">
                        <div id="simulateInStudentList" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 15px;">
                            <div class="student-list-item" style="padding: 10px; text-align:center; color:#888;">Ketik untuk mencari siswa</div>
                        </div>
                        <input type="hidden" id="selectedStudentIdIn" value="">
                        <input type="hidden" id="selectedStudentNameIn" value="">
                        <input type="hidden" id="selectedStudentKelasIn" value="">
                        <input type="hidden" id="selectedStudentJurusanIn" value="">
                    </div>
                    <div class="form-group">
                        <label>Status / Kondisi</label>
                        <select id="simulateInStatusSelect" class="form-control" style="width:100%; padding:10px;">
                            <option value="hadir">✅ Hadir (Normal)</option>
                            <option value="izin">📝 Izin</option>
                            <option value="sakit">🤒 Sakit</option>
                            <option value="alpha">❌ Alpha (Bolos)</option>
                        </select>
                    </div>
                    <div id="simulateInWarning" class="text-small" style="color:#ff9800; margin-top: 5px;"></div>
                    <div id="simulateInHolidayWarning" class="text-small" style="color:#f44336; margin-top: 5px;"></div>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeModal('${modalId}')">Batal</button>
                    <button class="btn-save" onclick="executeSimulateIn()">✅ Simpan Absen Masuk</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const searchInput = document.getElementById('simulateInSearchInput');
    const studentListDiv = document.getElementById('simulateInStudentList');
    const holidayWarningSpan = document.getElementById('simulateInHolidayWarning');
    
    const todayStr = new Date().toISOString().split('T')[0];
    if (typeof isHoliday === 'function' && isHoliday(todayStr)) {
        holidayWarningSpan.innerHTML = "⚠️ Hari ini adalah hari libur (tidak akan ditampilkan di web, namun tetap bisa disimpan)";
    } else {
        holidayWarningSpan.innerHTML = "";
    }
    
    const renderStudentList = (filterText = '') => {
        const filtered = currentStudentsListForIn.filter(s => 
            s.nama && (s.nama.toLowerCase().includes(filterText.toLowerCase()) || 
                       s.id.toString().includes(filterText))
        );
        if (filtered.length === 0) {
            studentListDiv.innerHTML = '<div class="student-list-item" style="padding: 10px; text-align:center; color:#888;">📭 Tidak ada siswa yang cocok</div>';
            return;
        }
        let html = '';
        filtered.forEach(s => {
            html += `
                <div class="student-list-item" data-id="${s.id}" data-nama="${escapeHtml(s.nama)}" data-kelas="${s.kelas || ''}" data-jurusan="${s.jurusan || ''}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                    <strong>${s.id}</strong> - ${escapeHtml(s.nama)} <span style="color: #888;">(${s.kelas || '-'} / ${s.jurusan || '-'})</span>
                </div>
            `;
        });
        studentListDiv.innerHTML = html;
        document.querySelectorAll('#simulateInStudentList .student-list-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-id');
                const nama = el.getAttribute('data-nama');
                const kelas = el.getAttribute('data-kelas');
                const jurusan = el.getAttribute('data-jurusan');
                document.getElementById('selectedStudentIdIn').value = id;
                document.getElementById('selectedStudentNameIn').value = nama;
                document.getElementById('selectedStudentKelasIn').value = kelas;
                document.getElementById('selectedStudentJurusanIn').value = jurusan;
                searchInput.value = `${id} - ${nama}`;
                studentListDiv.innerHTML = `<div class="student-list-item" style="padding: 10px; color: #4caf50;">✅ Dipilih: ${nama} (ID: ${id})</div>`;
                checkExistingAttendanceForIn(id);
            });
        });
    };
    
    const checkExistingAttendanceForIn = (studentId) => {
        const todayStr = new Date().toISOString().split('T')[0];
        const warningSpan = document.getElementById('simulateInWarning');
        const existing = dbData.attendance.find(a => a.date === todayStr && a.studentId == studentId && (a.status === 'Hadir' || a.status === 'Pulang'));
        if (existing) {
            warningSpan.innerHTML = `⚠️ Siswa ini sudah absen masuk hari ini pukul ${existing.timeIn}. Jika tetap disimpan, akan mengganti data sebelumnya.`;
            warningSpan.style.color = '#f44336';
        } else {
            warningSpan.innerHTML = '';
        }
    };
    
    searchInput.addEventListener('input', (e) => renderStudentList(e.target.value));
    renderStudentList('');
}

async function executeSimulateIn() {
    const studentId = document.getElementById('selectedStudentIdIn').value;
    const nama = document.getElementById('selectedStudentNameIn').value;
    const kelas = document.getElementById('selectedStudentKelasIn').value;
    const jurusan = document.getElementById('selectedStudentJurusanIn').value;
    const selectStatus = document.getElementById('simulateInStatusSelect');
    
    if (!studentId || !nama) {
        showToast("❌ Pilih siswa terlebih dahulu!", "error");
        return;
    }
    
    const statusCondition = selectStatus.value;
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    const dateStr = now.toISOString().split('T')[0];
    
    let statusFinal = 'Hadir';
    if (statusCondition === 'izin') statusFinal = 'Izin';
    else if (statusCondition === 'sakit') statusFinal = 'Sakit';
    else if (statusCondition === 'alpha') statusFinal = 'Alpha';
    
    const existingAttendance = dbData.attendance.find(a => a.date === dateStr && a.studentId == studentId);
    if (existingAttendance && (existingAttendance.status === 'Hadir' || existingAttendance.status === 'Pulang')) {
        if (!confirm(`⚠️ Siswa ${nama} sudah absen masuk pukul ${existingAttendance.timeIn}. Timpa data?`)) {
            return;
        }
    }
    
    const btn = document.querySelector('#modal-simulate-in .btn-save');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Memproses...'; }
    
    try {
        const attendanceData = {
            id: parseInt(studentId),
            nama: nama,
            kelas: kelas,
            jurusan: jurusan,
            in: (statusCondition === 'hadir') ? timeStr : null,
            out: null,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            status: statusFinal
        };
        await db.ref(`absensi/${dateStr}/${studentId}`).set(attendanceData);
        
        if (statusCondition !== 'hadir') {
            await db.ref(`attendance_status/${dateStr}/${studentId}`).set({
                status: statusCondition,
                updatedBy: currentUser.nama || currentUser.email,
                updatedAt: firebase.database.ServerValue.TIMESTAMP
            });
        }
        
        showToast(`✅ Simulasi Absen ${statusFinal} berhasil untuk ${nama} (${timeStr})`, "success");
        
        if (typeof logActivity === 'function') {
            const statusText = statusCondition === 'hadir' ? 'Hadir' : statusCondition;
            logActivity('simulate_attendance_in', `Simulasi masuk: ${nama} (ID: ${studentId}) - Status: ${statusText}, Waktu: ${timeStr}`);
        }
        
        // ======================== KIRIM NOTIFIKASI WHATSAPP ========================
        if (statusCondition === 'hadir') {
            const isLate = timeStr > '07:30';
            const notifType = isLate ? 'late' : 'check_in';
            await sendParentNotification(studentId, nama, notifType, timeStr, dateStr);
        } else if (statusCondition === 'alpha') {
            await sendParentNotification(studentId, nama, 'alpha', timeStr, dateStr);
        }
        
        // Clear cache foto untuk siswa ini
        attendancePhotoCache.delete(studentId);
        
        closeModal('modal-simulate-in');
        if (typeof renderTable === 'function') setTimeout(() => renderTable(), 500);
    } catch (err) {
        showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

// ======================== SIMULASI SCAN PULANG (DENGAN NOTIFIKASI) ========================

let currentStudentsListForOut = [];

function openSimulateOutModal() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Admin, Guru, dan Developer yang dapat mensimulasikan pulang!", "error");
        return;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    let todayAttendance = dbData.attendance.filter(a => a.date === todayStr && a.status === 'Hadir');
    if (typeof filterAttendanceByHoliday === 'function') {
        todayAttendance = filterAttendanceByHoliday(todayAttendance);
    }
    
    if (todayAttendance.length === 0) {
        showToast("⚠️ Tidak ada siswa yang absen masuk hari ini (status Hadir)!", "warning");
        return;
    }
    
    currentStudentsListForOut = todayAttendance.map(a => {
        const student = dbData.users.find(u => u.id == a.studentId);
        return {
            id: a.studentId,
            nama: student?.nama || a.nama,
            kelas: student?.kelas || a.kelas,
            jurusan: student?.jurusan || a.jurusan,
            timeIn: a.timeIn || '-'
        };
    });
    
    const modalId = 'modal-simulate-out';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    const modalHtml = `
        <div id="${modalId}" class="modal-overlay open">
            <div class="modal-box" style="max-width: 500px;">
                <div class="modal-title">
                    <span>🏠 Simulasi Scan Pulang</span>
                    <span onclick="closeModal('${modalId}')">✖</span>
                </div>
                <div style="padding: 20px;">
                    <div class="form-group">
                        <label>🔍 Cari Siswa (Nama atau ID) - Hanya yang sudah absen masuk</label>
                        <input type="text" id="simulateOutSearchInput" class="form-control" placeholder="Ketik nama atau ID siswa..." style="width:100%; padding:10px; margin-bottom:10px;">
                        <div id="simulateOutStudentList" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 15px;">
                            <div class="student-list-item" style="padding: 10px; text-align:center; color:#888;">Ketik untuk mencari siswa</div>
                        </div>
                        <input type="hidden" id="selectedStudentIdOut" value="">
                        <input type="hidden" id="selectedStudentNameOut" value="">
                        <input type="hidden" id="selectedStudentTimeIn" value="">
                    </div>
                    <div id="simulateOutDelayWarning" class="text-small" style="color:#ff9800; margin-top: 5px;"></div>
                    <div id="simulateOutMinTimeWarning" class="text-small" style="color:#ff9800; margin-top: 5px;"></div>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeModal('${modalId}')">Batal</button>
                    <button class="btn-save" onclick="executeSimulateOut()">🏠 Simpan Pulang</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    const searchInput = document.getElementById('simulateOutSearchInput');
    const studentListDiv = document.getElementById('simulateOutStudentList');
    
    const renderStudentList = (filterText = '') => {
        const filtered = currentStudentsListForOut.filter(s => 
            s.nama && (s.nama.toLowerCase().includes(filterText.toLowerCase()) || 
                       s.id.toString().includes(filterText))
        );
        if (filtered.length === 0) {
            studentListDiv.innerHTML = '<div class="student-list-item" style="padding: 10px; text-align:center; color:#888;">📭 Tidak ada siswa yang cocok</div>';
            return;
        }
        let html = '';
        filtered.forEach(s => {
            html += `
                <div class="student-list-item" data-id="${s.id}" data-nama="${escapeHtml(s.nama)}" data-timein="${s.timeIn}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                    <strong>${s.id}</strong> - ${escapeHtml(s.nama)} <span style="color: #888;">Masuk: ${s.timeIn}</span>
                </div>
            `;
        });
        studentListDiv.innerHTML = html;
        document.querySelectorAll('#simulateOutStudentList .student-list-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-id');
                const nama = el.getAttribute('data-nama');
                const timeIn = el.getAttribute('data-timein');
                document.getElementById('selectedStudentIdOut').value = id;
                document.getElementById('selectedStudentNameOut').value = nama;
                document.getElementById('selectedStudentTimeIn').value = timeIn;
                searchInput.value = `${id} - ${nama}`;
                studentListDiv.innerHTML = `<div class="student-list-item" style="padding: 10px; color: #4caf50;">✅ Dipilih: ${nama} (ID: ${id})</div>`;
                updateDelayWarningForOut(id, timeIn);
                updateMinTimeWarning(timeIn);
            });
        });
    };
    
    const updateDelayWarningForOut = (studentId, timeIn) => {
        const warningSpan = document.getElementById('simulateOutDelayWarning');
        const student = dbData.users.find(u => u.id == studentId);
        const delayMinutes = parseInt(student?.delayOut) || 60;
        if (timeIn && timeIn !== '-') {
            const now = new Date();
            const [hours, minutes] = timeIn.split(':');
            const timeInDate = new Date();
            timeInDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
            const diffMinutes = (now - timeInDate) / (1000 * 60);
            if (diffMinutes < delayMinutes) {
                const remaining = Math.ceil(delayMinutes - diffMinutes);
                warningSpan.innerHTML = `⚠️ Delay pulang ${delayMinutes} menit. Belum mencapai waktu minimal (kurang ${remaining} menit). Tetap bisa dipulangkan secara paksa.`;
                warningSpan.style.color = '#ff9800';
            } else {
                warningSpan.innerHTML = `✅ Sudah memenuhi delay pulang (${delayMinutes} menit).`;
                warningSpan.style.color = '#4caf50';
            }
        } else {
            warningSpan.innerHTML = '';
        }
    };
    
    const updateMinTimeWarning = (timeIn) => {
        const warningSpan = document.getElementById('simulateOutMinTimeWarning');
        let minOutTime = '14:00';
        if (window.attendanceSettings && window.attendanceSettings.minOutTime) {
            minOutTime = window.attendanceSettings.minOutTime;
        }
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const [minHour, minMinute] = minOutTime.split(':').map(Number);
        if (currentHour < minHour || (currentHour === minHour && currentMinute < minMinute)) {
            warningSpan.innerHTML = `⚠️ Waktu pulang belum mencapai jam minimal (${minOutTime}). Tetap bisa dipulangkan paksa.`;
            warningSpan.style.color = '#ff9800';
        } else {
            warningSpan.innerHTML = '';
        }
    };
    
    searchInput.addEventListener('input', (e) => renderStudentList(e.target.value));
    renderStudentList('');
}

async function executeSimulateOut() {
    const studentId = document.getElementById('selectedStudentIdOut').value;
    const nama = document.getElementById('selectedStudentNameOut').value;
    const timeIn = document.getElementById('selectedStudentTimeIn').value;
    
    if (!studentId || !nama) {
        showToast("❌ Pilih siswa terlebih dahulu!", "error");
        return;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    const student = dbData.users.find(u => u.id == studentId);
    if (!student) {
        showToast("❌ Data siswa tidak ditemukan!", "error");
        closeModal('modal-simulate-out');
        return;
    }
    
    const now = new Date();
    const timeOutStr = now.toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    const delayMinutes = parseInt(student.delayOut) || 60;
    let warningMsg = '';
    if (timeIn && timeIn !== '-') {
        const [hours, minutes] = timeIn.split(':');
        const timeInDate = new Date();
        timeInDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        const diffMinutes = (now - timeInDate) / (1000 * 60);
        if (diffMinutes < delayMinutes) {
            const remaining = Math.ceil(delayMinutes - diffMinutes);
            warningMsg = ` (Belum ${remaining} menit lagi, force pulang)`;
            if (!confirm(`⚠️ Siswa ${nama} absen masuk pukul ${timeIn}. Delay pulang ${delayMinutes} menit.\n\nBelum mencapai waktu minimal pulang (kurang ${remaining} menit).\nTetap lanjutkan scan pulang?`)) {
                return;
            }
        }
    }
    
    let minOutTime = '14:00';
    if (window.attendanceSettings && window.attendanceSettings.minOutTime) {
        minOutTime = window.attendanceSettings.minOutTime;
    }
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const [minHour, minMinute] = minOutTime.split(':').map(Number);
    if (currentHour < minHour || (currentHour === minHour && currentMinute < minMinute)) {
        if (!confirm(`⚠️ Waktu pulang saat ini ${timeOutStr} belum mencapai jam minimal ${minOutTime}. Tetap lanjutkan?`)) {
            return;
        }
    }
    
    const btn = document.querySelector('#modal-simulate-out .btn-save');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Memproses...'; }
    
    try {
        const currentAttendance = await db.ref(`absensi/${todayStr}/${studentId}`).once('value');
        if (!currentAttendance.exists()) {
            showToast("❌ Data absensi tidak ditemukan untuk siswa ini!", "error");
            return;
        }
        await db.ref(`absensi/${todayStr}/${studentId}`).update({
            out: timeOutStr,
            status: 'Pulang'
        });
        showToast(`✅ ${nama} berhasil absen pulang pukul ${timeOutStr}${warningMsg}`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('simulate_attendance_out', `Simulasi pulang: ${nama} (ID: ${studentId}) - Waktu pulang: ${timeOutStr}${warningMsg}`);
        }
        
        // ======================== KIRIM NOTIFIKASI PULANG ========================
        await sendParentNotification(studentId, nama, 'check_out', timeOutStr, todayStr);
        
        closeModal('modal-simulate-out');
        if (typeof renderTable === 'function') setTimeout(() => renderTable(), 500);
    } catch (err) {
        showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

// ======================== FUNGSI LAMA (UNTUK KOMPATIBILITAS) ========================
window.simulateAttendance = openSimulateInModal;
window.simulateAttendanceOut = openSimulateOutModal;

// ======================== EXPORT FUNCTIONS ========================

function exportToExcel() {
    if (!dbData.attendance || dbData.attendance.length === 0) {
        showToast("❌ Tidak ada data absensi untuk diekspor!", "error");
        return;
    }
    let csv = "\uFEFFTanggal,Waktu Masuk,Waktu Pulang,ID,Nama,Kelas,Jurusan,Status\n";
    dbData.attendance.forEach(r => {
        csv += `"${r.date || '-'}","${r.timeIn || '-'}","${r.timeOut || '-'}","${r.studentId}","${escapeCsv(r.nama)}","${r.kelas || '-'}","${r.jurusan || '-'}","${r.status}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `laporan_absensi_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("📥 Laporan Excel berhasil diunduh", "success");
    
    if (typeof logActivity === 'function') {
        logActivity('export_attendance_excel', `Ekspor ${dbData.attendance.length} data absensi ke Excel`);
    }
}

function escapeCsv(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
    return str;
}

function resetAttendanceFilters() {
    const filterDate = document.getElementById('filterDate');
    const filterKelas = document.getElementById('filterKelas');
    const filterJurusan = document.getElementById('filterJurusan');
    if (filterDate) filterDate.value = 'all';
    if (filterKelas) filterKelas.value = 'all';
    if (filterJurusan) filterJurusan.value = 'all';
    renderTable();
    showToast("🔄 Filter telah direset", "info");
}

function filterByDateRange(startDate, endDate) {
    if (!startDate || !endDate) return;
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59);
    let filtered = dbData.attendance.filter(r => {
        const recordDate = new Date(r.date);
        return recordDate >= start && recordDate <= end;
    });
    if (typeof filterAttendanceByHoliday === 'function') {
        filtered = filterAttendanceByHoliday(filtered);
    }
    renderFilteredTable(filtered);
}

function renderFilteredTable(filteredData) {
    const tbody = document.getElementById('tbody-attendance');
    if (!tbody) return;
    
    filteredData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    tbody.innerHTML = '';
    if (filteredData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#888;">📭 Tidak ada data dalam rentang tanggal tersebut.<\/td><\/tr>`;
        return;
    }
    let rows = [];
    for (const row of filteredData) {
        const photoUrl = getAttendanceStudentPhotoUrl(row.studentId, row.nama);
        const studentInitial = row.nama ? row.nama.charAt(0).toUpperCase() : 'U';
        const outDisplay = row.timeOut ? `<br><span class="text-small" style="color:var(--danger)">🏠 Pulang: ${row.timeOut}</span>` : '';
        
        rows.push(`
            <tr>
                <td style="text-align:center;">
                    <img src="${photoUrl}" 
                         class="attendance-student-avatar"
                         style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;"
                         onerror="this.src='https://ui-avatars.com/api/?name=${studentInitial}&background=00bcd4&color=fff&size=100&bold=true'"
                         onclick="showAttendanceStudentPhoto('${row.studentId}', '${escapeHtml(row.nama)}', this.src)">
                </td>
                <td>⏰ ${row.timeIn || '-'}<br><span class="text-small">📅 ${row.date}</span>${outDisplay}</td>
                <td><strong>#${row.studentId}</strong></td>
                <td>${escapeHtml(row.nama)}</div>
                <td>${row.kelas || '-'}</div>
                <td>${row.jurusan || '-'}</div>
                <td><span style="color:${row.status === 'Pulang' ? 'var(--danger)' : 'var(--success)'}">${row.status === 'Pulang' ? '🏠' : '✅'} ${row.status}</span></div>
                <td class="role-guru role-admin role-developer"><button class="btn-icon delete" onclick="deleteAttendance('${row.id}')" title="Hapus Data">🗑️</button></div>
            </tr>
        `);
    }
    tbody.innerHTML = rows.join('');
}

// ======================== MANUAL ATTENDANCE STATUS (DENGAN LOG) ========================

function openAbsenceModal() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Admin, Guru, dan Developer yang dapat mengatur ketidakhadiran!", "error");
        return;
    }
    const modal = document.getElementById('modal-absence');
    if (!modal) {
        showToast("Fitur sedang dimuat, coba lagi nanti", "error");
        return;
    }
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('absenceDate').value = today;
    populateAbsenceFilters();
    modal.classList.add('open');
}

function populateAbsenceFilters() {
    const kelasSelect = document.getElementById('absenceKelas');
    const jurusanSelect = document.getElementById('absenceJurusan');
    if (!kelasSelect || !jurusanSelect) return;
    
    let kelasOptions = [];
    if (window.currentSchoolConfig?.classes?.length) {
        kelasOptions = window.currentSchoolConfig.classes;
    } else {
        const type = window.currentSchoolConfig?.type || 'smp';
        if (type === 'smp') kelasOptions = ['VII','VIII','IX'];
        else if (type === 'smk') kelasOptions = ['X','XI','XII'];
        else kelasOptions = ['VII','VIII','IX','X','XI','XII'];
    }
    kelasSelect.innerHTML = '<option value="all">📚 Semua Kelas</option>' + kelasOptions.map(k => `<option value="${k}">${k}</option>`).join('');
    
    let jurusanOptions = ['UMUM'];
    if (window.currentSchoolConfig?.majors?.length) jurusanOptions = window.currentSchoolConfig.majors;
    jurusanSelect.innerHTML = '<option value="all">🎓 Semua Jurusan</option>' + jurusanOptions.map(j => `<option value="${j}">${j}</option>`).join('');
}

async function loadAbsenceList() {
    const date = document.getElementById('absenceDate').value;
    if (!date) { showToast("Pilih tanggal terlebih dahulu!", "error"); return; }
    const kelas = document.getElementById('absenceKelas').value;
    const jurusan = document.getElementById('absenceJurusan').value;
    showToast("⏳ Memuat data siswa...", "info");
    
    let students = [...dbData.users];
    if (kelas !== 'all') students = students.filter(s => s.kelas === kelas);
    if (jurusan !== 'all') students = students.filter(s => s.jurusan === jurusan);
    students.sort((a,b) => a.id - b.id);
    
    const attendanceSnapshot = await db.ref(`absensi/${date}`).once('value');
    const attendanceData = attendanceSnapshot.val() || {};
    const statusSnapshot = await db.ref(`attendance_status/${date}`).once('value');
    const manualStatus = statusSnapshot.val() || {};
    
    const container = document.getElementById('absenceListContainer');
    if (students.length === 0) {
        container.innerHTML = '<p class="text-small" style="text-align:center;">📭 Tidak ada siswa dengan filter ini.</p>';
        return;
    }
    
    let html = `<div style="margin-bottom: 10px;"><small>⚠️ Siswa yang sudah absen (scan fingerprint) tidak dapat diubah statusnya.</small></div>`;
    for (const student of students) {
        const attendance = attendanceData[student.id];
        const isPresent = attendance && attendance.in;
        let statusValue = 'alpha';
        let disabled = false;
        let note = '';
        if (isPresent) {
            statusValue = 'hadir';
            disabled = true;
            note = '✅ (sudah absen)';
        } else {
            const saved = manualStatus[student.id];
            if (saved && saved.status) statusValue = saved.status;
            else statusValue = 'alpha';
            disabled = false;
        }
        const statusOptions = `
            <option value="hadir" ${statusValue === 'hadir' ? 'selected' : ''}>✅ Hadir</option>
            <option value="sakit" ${statusValue === 'sakit' ? 'selected' : ''}>🤒 Sakit</option>
            <option value="izin" ${statusValue === 'izin' ? 'selected' : ''}>📝 Izin</option>
            <option value="alpha" ${statusValue === 'alpha' ? 'selected' : ''}>❌ Alpha (Bolos)</option>
        `;
        html += `
            <div class="absence-student-row" data-id="${student.id}">
                <div class="absence-student-info">
                    <div class="absence-student-name">${escapeHtml(student.nama)}</div>
                    <div class="absence-student-detail">ID: ${student.id} | Kelas: ${student.kelas} | Jurusan: ${student.jurusan}</div>
                    ${note ? `<div class="text-small" style="color:var(--text-muted)">${note}</div>` : ''}
                </div>
                <div>
                    <select class="status-select ${statusValue}" data-id="${student.id}" ${disabled ? 'disabled' : ''}>
                        ${statusOptions}
                    </select>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
    document.querySelectorAll('.status-select:not([disabled])').forEach(select => {
        select.addEventListener('change', function() {
            this.className = `status-select ${this.value}`;
        });
    });
}

async function saveAllAbsenceStatus() {
    const date = document.getElementById('absenceDate').value;
    if (!date) { showToast("Tanggal tidak valid!", "error"); return; }
    const selects = document.querySelectorAll('#absenceListContainer .status-select:not([disabled])');
    if (selects.length === 0) {
        showToast("Tidak ada perubahan yang dapat disimpan (semua siswa sudah absen atau tidak ada data).", "info");
        return;
    }
    const updates = {};
    for (const select of selects) {
        const studentId = select.dataset.id;
        const status = select.value;
        if (status && status !== 'hadir') {
            updates[studentId] = { status, updatedBy: currentUser.nama || currentUser.email, updatedAt: firebase.database.ServerValue.TIMESTAMP };
        } else if (status === 'hadir') updates[studentId] = null;
    }
    const btn = document.querySelector('#modal-absence .btn-save');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '💾 Menyimpan...'; }
    try {
        const refPath = `attendance_status/${date}`;
        const currentData = (await db.ref(refPath).once('value')).val() || {};
        const finalUpdates = {};
        let updatedCount = 0;
        for (const [id, value] of Object.entries(updates)) {
            if (value === null) { if (currentData[id]) finalUpdates[id] = null; }
            else { finalUpdates[id] = value; updatedCount++; }
        }
        if (Object.keys(finalUpdates).length > 0) await db.ref(refPath).update(finalUpdates);
        showToast(`✅ Berhasil menyimpan data ketidakhadiran.`, "success");
        
        if (typeof logActivity === 'function' && updatedCount > 0) {
            let statusSummary = [];
            for (const [id, val] of Object.entries(finalUpdates)) {
                if (val && val.status) statusSummary.push(`ID ${id}: ${val.status}`);
            }
            logActivity('save_manual_attendance', `Tanggal ${date} - ${updatedCount} perubahan: ${statusSummary.slice(0, 5).join(', ')}${statusSummary.length > 5 ? '...' : ''}`);
        }
        
        if (typeof renderTable === 'function') renderTable();
        closeModal('modal-absence');
    } catch (err) {
        showToast("❌ Gagal menyimpan: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

// ======================== UTILITY ========================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function getTodayAttendanceStats() {
    const today = new Date().toISOString().split('T')[0];
    let todayData = dbData.attendance.filter(r => r.date === today);
    if (typeof filterAttendanceByHoliday === 'function') {
        todayData = filterAttendanceByHoliday(todayData);
    }
    return {
        hadir: todayData.filter(r => r.status === 'Hadir').length,
        pulang: todayData.filter(r => r.status === 'Pulang').length,
        total: todayData.length,
        uniqueStudents: [...new Set(todayData.map(r => r.studentId))].length
    };
}

function cleanupAttendanceUI() {
    if (attendanceDonutChart) { attendanceDonutChart.destroy(); attendanceDonutChart = null; }
    attendanceDataReadyListenerAdded = false;
    attendanceRetryCount = 0;
    attendancePhotoCache.clear();
    console.log("🧹 Attendance UI cleaned up");
}

// ======================== INISIALISASI ========================
setupAttendanceDataReadyListener();
setupAttendancePhotoListener(); // Mulai listener foto

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            waitForAttendanceElements(() => {
                populateFilters();
                populateDateFilter();
            });
        }, 100);
    });
} else {
    setTimeout(() => {
        waitForAttendanceElements(() => {
            populateFilters();
            populateDateFilter();
        });
    }, 100);
}

if (typeof window !== 'undefined' && window.dbData && window.dbData.attendance) {
    setTimeout(() => {
        waitForAttendanceElements(() => {
            if (typeof updateAttendanceDonutChart === 'function') updateAttendanceDonutChart();
            if (typeof renderTable === 'function') renderTable();
        });
    }, 100);
}

// ======================== EKSPOR KE GLOBAL ========================
window.renderTable = renderTable;
window.deleteAttendance = deleteAttendance;
window.simulateAttendance = openSimulateInModal;
window.simulateAttendanceOut = openSimulateOutModal;
window.openSimulateOutModal = openSimulateOutModal;
window.exportToExcel = exportToExcel;
window.resetAttendanceFilters = resetAttendanceFilters;
window.filterByDateRange = filterByDateRange;
window.getTodayAttendanceStats = getTodayAttendanceStats;
window.cleanupAttendanceUI = cleanupAttendanceUI;
window.initAttendanceUI = initAttendanceUI;
window.openAbsenceModal = openAbsenceModal;
window.loadAbsenceList = loadAbsenceList;
window.saveAllAbsenceStatus = saveAllAbsenceStatus;
window.updateAttendanceDonutChart = updateAttendanceDonutChart;
window.populateFilters = populateFilters;
window.populateDateFilter = populateDateFilter;
window.waitForAttendanceElements = waitForAttendanceElements;
// Ekspor fungsi foto
window.getAttendanceStudentPhotoUrl = getAttendanceStudentPhotoUrl;
window.clearAttendancePhotoCache = clearAttendancePhotoCache;
window.showAttendanceStudentPhoto = showAttendanceStudentPhoto;
// Ekspor fungsi notifikasi
window.sendParentNotification = sendParentNotification;

console.log("✅ attendance.js V5.0 loaded - Dengan integrasi WhatsApp notifikasi, foto siswa di tabel absensi, dan log aktivitas");