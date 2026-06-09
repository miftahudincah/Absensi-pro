// rekap-per-siswa.js - VERSION 2.1 (DENGAN PERIODE LENGKAP DI MODAL)
// Fitur Rekap Absensi per Siswa - Tampil dalam Modal
// PERUBAHAN V2.1: 
//   - Menambahkan pilihan periode lengkap di dalam modal
//   - Periode: Hari Ini, Minggu Ini, Bulan Ini, Semester Ini, Tahun Ini, Pertama Kali, Custom Range
//   - Periode dapat diubah langsung dari modal tanpa harus ke halaman utama
// ============================================================================

let currentRekapPerSiswaData = null;
let currentSelectedStudent = null;
let currentStudentList = [];
let currentStudentIndex = -1;
let currentModalPeriod = 'minggu'; // default period
let currentModalCustomStart = null;
let currentModalCustomEnd = null;
const rekapPhotoCache = new Map();

// ======================= FUNGSI PERIODE LENGKAP ========================

function getRekapDateRange(period, customStart = null, customEnd = null) {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    let label = '';
    
    switch(period) {
        case 'hari':
            start = new Date();
            start.setHours(0, 0, 0, 0);
            end = new Date();
            end.setHours(23, 59, 59, 999);
            label = `Hari Ini (${formatDateIndonesian(start)})`;
            break;
            
        case 'minggu':
            const day = now.getDay();
            const diffToMonday = (day === 0 ? 6 : day - 1);
            start.setDate(now.getDate() - diffToMonday);
            start.setHours(0, 0, 0, 0);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
            label = `Minggu Ini (${formatDateIndonesian(start)} - ${formatDateIndonesian(end)})`;
            break;
            
        case 'bulan':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            end.setHours(23, 59, 59, 999);
            label = `Bulan Ini (${formatMonthYear(start)})`;
            break;
            
        case 'semester':
            const semester = now.getMonth() < 6 ? 1 : 2;
            if (semester === 1) {
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 5, 30);
                label = `Semester Ganjil ${now.getFullYear()}`;
            } else {
                start = new Date(now.getFullYear(), 6, 1);
                end = new Date(now.getFullYear(), 11, 31);
                label = `Semester Genap ${now.getFullYear()}`;
            }
            end.setHours(23, 59, 59, 999);
            break;
            
        case 'tahun':
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31);
            end.setHours(23, 59, 59, 999);
            label = `Tahun ${now.getFullYear()}`;
            break;
            
        case 'pertama':
            label = 'Pertama Kali Absensi';
            return { start: null, end: now, label: label, isFirstTime: true };
            
        case 'custom':
            if (customStart && customEnd) {
                start = new Date(customStart);
                end = new Date(customEnd);
                end.setHours(23, 59, 59, 999);
                label = `Custom (${formatDateIndonesian(start)} - ${formatDateIndonesian(end)})`;
            }
            break;
            
        default:
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = now;
            label = 'Periode Default';
    }
    
    return { start, end, label };
}

function formatDateIndonesian(date) {
    if (!date || !(date instanceof Date)) return '';
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatMonthYear(date) {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatIndonesianDateShort(dateStr) {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parts[2]} ${bulan[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

// ======================= FUNGSI FOTO SISWA ========================

function getRekapStudentPhotoUrl(studentId, studentName) {
    if (!studentId) {
        const initial = studentName ? studentName.charAt(0).toUpperCase() : 'U';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=00bcd4&color=fff&size=100&bold=true`;
    }
    
    if (rekapPhotoCache.has(studentId)) {
        return rekapPhotoCache.get(studentId);
    }
    
    const userAuth = dbData?.users_auth?.find(u => u.fpId == studentId);
    
    let photoUrl;
    if (userAuth && userAuth.photoUrl && userAuth.photoUrl !== 'null' && userAuth.photoUrl !== 'undefined') {
        photoUrl = userAuth.photoUrl;
    } else {
        const initial = studentName ? studentName.charAt(0).toUpperCase() : 'U';
        photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=00bcd4&color=fff&size=100&bold=true`;
    }
    
    rekapPhotoCache.set(studentId, photoUrl);
    return photoUrl;
}

function refreshRekapPhotoCache() {
    rekapPhotoCache.clear();
    if (currentRekapPerSiswaData) {
        renderRekapPerSiswaModal(currentRekapPerSiswaData);
    }
    console.log("🖼️ Rekap photo cache cleared");
}

function setupRekapPhotoListener() {
    if (!db) return;
    
    db.ref('users_auth').on('child_changed', (snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.photoUrl && userData.fpId) {
            rekapPhotoCache.delete(userData.fpId);
            if (currentRekapPerSiswaData && currentRekapPerSiswaData.student.id == userData.fpId) {
                renderRekapPerSiswaModal(currentRekapPerSiswaData);
            }
        }
    });
}

// ======================= INISIALISASI ========================

function initRekapPerSiswa() {
    console.log("📋 Initializing Rekap per Siswa module (Modal version with period options)...");
    
    if (dbData && dbData.users && dbData.users.length > 0) {
        updateStudentList();
    } else {
        setTimeout(initRekapPerSiswa, 500);
    }
    
    setupRekapPhotoListener();
    
    // Set default custom dates
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    currentModalCustomStart = thirtyDaysAgo.toISOString().split('T')[0];
    currentModalCustomEnd = today.toISOString().split('T')[0];
}

function updateStudentList() {
    if (dbData && dbData.users) {
        currentStudentList = dbData.users
            .filter(s => s && s.id && s.nama && s.nama !== 'Tidak Diketahui' && s.nama.trim() !== '')
            .sort((a, b) => a.id - b.id);
        console.log(`📋 Student list updated: ${currentStudentList.length} students`);
    }
}

// ======================= FUNGSI MEMBUKA MODAL ========================

/**
 * Membuka modal detail rekap siswa
 * @param {string|number} studentId - ID siswa
 * @param {string} studentName - Nama siswa (opsional)
 */
async function openRekapPerSiswaModal(studentId, studentName) {
    if (!studentId) {
        if (typeof showToast === 'function') showToast("ID siswa tidak valid!", "error");
        return;
    }
    
    // Update daftar siswa
    updateStudentList();
    
    // Cari data siswa
    const student = dbData.users?.find(s => s.id == studentId);
    if (!student) {
        if (typeof showToast === 'function') showToast(`❌ Data siswa dengan ID ${studentId} tidak ditemukan!`, "error");
        return;
    }
    
    // Update current student index untuk navigasi
    currentStudentIndex = currentStudentList.findIndex(s => s.id == studentId);
    
    // Tampilkan loading
    if (typeof showToast === 'function') showToast(`📊 Memuat rekap ${student.nama}...`, "info");
    
    // Hitung data rekap dengan periode yang dipilih
    await loadRekapDataForModal(student);
}

async function loadRekapDataForModal(student) {
    let startDate, endDate, periodLabel;
    
    if (currentModalPeriod === 'custom' && currentModalCustomStart && currentModalCustomEnd) {
        startDate = new Date(currentModalCustomStart);
        endDate = new Date(currentModalCustomEnd);
        endDate.setHours(23, 59, 59, 999);
        periodLabel = `Custom (${formatIndonesianDateShort(currentModalCustomStart)} - ${formatIndonesianDateShort(currentModalCustomEnd)})`;
    } 
    else if (currentModalPeriod === 'pertama') {
        const firstAttendance = dbData.attendance
            .filter(a => a.studentId == student.id && a.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
        
        if (firstAttendance && firstAttendance.date) {
            startDate = new Date(firstAttendance.date);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            periodLabel = `Pertama Kali Absensi (${formatIndonesianDateShort(firstAttendance.date)} - Sekarang)`;
        } else {
            startDate = null;
            endDate = new Date();
            periodLabel = 'Belum Pernah Absen';
        }
    }
    else {
        const range = getRekapDateRange(currentModalPeriod);
        startDate = range.start;
        endDate = range.end;
        periodLabel = range.label;
    }
    
    if (startDate && endDate && startDate > endDate) {
        if (typeof showToast === 'function') showToast("⚠️ Tanggal mulai harus lebih kecil dari tanggal akhir!", "error");
        return;
    }
    
    // Hitung data rekap
    const rekapData = await calculateRekapForStudent(student, startDate, endDate, periodLabel);
    
    if (rekapData) {
        currentRekapPerSiswaData = rekapData;
        renderRekapPerSiswaModal(rekapData);
    }
}

/**
 * Menghitung rekap untuk satu siswa
 */
async function calculateRekapForStudent(student, startDate, endDate, periodLabel) {
    const studentId = student.id;
    
    // Jika startDate tidak ada (belum pernah absen)
    if (!startDate) {
        return {
            student,
            startDate: null,
            endDate: null,
            periodLabel: periodLabel || 'Belum Pernah Absen',
            totalDays: 0,
            hadir: 0,
            sakit: 0,
            izin: 0,
            alpha: 0,
            persentase: 0,
            statusGrade: 'Belum Absen',
            gradeColor: '#888',
            details: []
        };
    }
    
    let attendanceRecords = dbData.attendance.filter(a => a.studentId == studentId);
    attendanceRecords = attendanceRecords.filter(a => {
        const recordDate = new Date(a.date);
        return recordDate >= startDate && recordDate <= endDate;
    });
    
    if (typeof filterAttendanceByHoliday === 'function') {
        attendanceRecords = filterAttendanceByHoliday(attendanceRecords);
    }
    
    let manualStatusMap = {};
    if (typeof fetchManualStatusForRange === 'function') {
        manualStatusMap = await fetchManualStatusForRange(startDate, endDate);
    } else {
        const currentDate = new Date(startDate);
        const end = new Date(endDate);
        while (currentDate <= end) {
            const dateStr = currentDate.toISOString().split('T')[0];
            if (typeof isHoliday !== 'function' || !isHoliday(dateStr)) {
                try {
                    const snapshot = await db.ref(`attendance_status/${dateStr}`).once('value');
                    if (snapshot.exists()) {
                        manualStatusMap[dateStr] = snapshot.val();
                    }
                } catch(e) { console.warn(e); }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }
    
    // Generate semua tanggal dalam periode (hari sekolah saja)
    const allDates = [];
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const isHolidayCheck = (typeof isHoliday === 'function') ? isHoliday(dateStr) : false;
        if (!isHolidayCheck) {
            allDates.push(dateStr);
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const attendanceMap = new Map();
    attendanceRecords.forEach(record => {
        attendanceMap.set(record.date, record);
    });
    
    const details = [];
    let hadir = 0, sakit = 0, izin = 0, alpha = 0;
    
    for (const dateStr of allDates) {
        const record = attendanceMap.get(dateStr);
        const manual = manualStatusMap[dateStr]?.[studentId];
        let status = 'alpha';
        let statusIcon = '❌';
        let statusColor = '#f44336';
        let statusText = 'Alpha';
        let timeIn = '-', timeOut = '-';
        
        if (record && (record.status === 'Hadir' || record.status === 'Pulang')) {
            status = 'hadir';
            statusIcon = '✅';
            statusColor = '#4caf50';
            statusText = 'Hadir';
            timeIn = record.timeIn || '-';
            timeOut = record.timeOut || '-';
            hadir++;
        } else if (manual && manual.status) {
            if (manual.status === 'sakit') {
                status = 'sakit';
                statusIcon = '🤒';
                statusColor = '#ff9800';
                statusText = 'Sakit';
                sakit++;
            } else if (manual.status === 'izin') {
                status = 'izin';
                statusIcon = '📝';
                statusColor = '#2196f3';
                statusText = 'Izin';
                izin++;
            } else {
                status = 'alpha';
                statusIcon = '❌';
                statusColor = '#f44336';
                statusText = 'Alpha';
                alpha++;
            }
        } else {
            status = 'alpha';
            statusIcon = '❌';
            statusColor = '#f44336';
            statusText = 'Alpha';
            alpha++;
        }
        
        details.push({
            date: dateStr,
            dayName: formatDayName(dateStr),
            status,
            statusIcon,
            statusColor,
            statusText,
            timeIn,
            timeOut
        });
    }
    
    const totalDays = allDates.length;
    const persentase = totalDays > 0 ? ((hadir / totalDays) * 100).toFixed(1) : 0;
    
    let statusGrade = '', gradeColor = '';
    if (persentase >= 90) { statusGrade = 'Sangat Baik'; gradeColor = '#4caf50'; }
    else if (persentase >= 75) { statusGrade = 'Baik'; gradeColor = '#8bc34a'; }
    else if (persentase >= 60) { statusGrade = 'Cukup'; gradeColor = '#ffc107'; }
    else if (persentase >= 40) { statusGrade = 'Kurang'; gradeColor = '#ff9800'; }
    else { statusGrade = 'Buruk'; gradeColor = '#f44336'; }
    
    return {
        student,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        periodLabel: periodLabel,
        totalDays,
        hadir,
        sakit,
        izin,
        alpha,
        persentase,
        statusGrade,
        gradeColor,
        details
    };
}

function formatDayName(dateStr) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const date = new Date(dateStr);
    return days[date.getDay()];
}

// ======================= NAVIGASI SISWA ========================

async function navigateRekapStudent(direction) {
    const newIndex = currentStudentIndex + direction;
    if (newIndex >= 0 && newIndex < currentStudentList.length) {
        currentStudentIndex = newIndex;
        const student = currentStudentList[currentStudentIndex];
        if (student) {
            // Tampilkan loading di modal
            const modalContent = document.querySelector('#modal-rekap-per-siswa .modal-box > div:first-child');
            if (modalContent) {
                modalContent.innerHTML = '<div style="text-align:center; padding:40px;">⏳ Memuat data siswa...</div>';
            }
            await loadRekapDataForModal(student);
        }
    }
}

// ======================= FUNGSI PERIODE DI MODAL ========================

function changeModalPeriod(period) {
    currentModalPeriod = period;
    
    // Tampilkan/hide custom range inputs
    const customRangeDiv = document.getElementById('modal-custom-range');
    if (customRangeDiv) {
        customRangeDiv.style.display = period === 'custom' ? 'flex' : 'none';
    }
    
    // Reload data dengan periode baru
    if (currentRekapPerSiswaData && currentRekapPerSiswaData.student) {
        loadRekapDataForModal(currentRekapPerSiswaData.student);
    }
}

function updateModalCustomDates() {
    const startInput = document.getElementById('modal-custom-start');
    const endInput = document.getElementById('modal-custom-end');
    if (startInput && endInput && startInput.value && endInput.value) {
        currentModalCustomStart = startInput.value;
        currentModalCustomEnd = endInput.value;
        if (currentModalPeriod === 'custom' && currentRekapPerSiswaData && currentRekapPerSiswaData.student) {
            loadRekapDataForModal(currentRekapPerSiswaData.student);
        }
    }
}

// ======================= RENDER MODAL ========================

function renderRekapPerSiswaModal(data) {
    if (!data) return;
    
    const student = data.student;
    const hasAccount = dbData.users_auth?.some(u => u.fpId == student.id);
    const accountBadge = hasAccount 
        ? '<span class="badge-account" style="background:#4caf50; font-size:11px; margin-left:10px; padding:2px 8px; border-radius:20px;">✓ Berakun</span>' 
        : '<span class="badge-no-account" style="background:#888; font-size:11px; margin-left:10px; padding:2px 8px; border-radius:20px;">❌ Belum Berakun</span>';
    
    const avatarUrl = getRekapStudentPhotoUrl(student.id, student.nama);
    const studentInitial = student.nama ? student.nama.charAt(0).toUpperCase() : 'U';
    
    // Build detail tabel
    let tableRows = '';
    let no = 1;
    for (const item of data.details) {
        tableRows += `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px; text-align: center;">${no++}</td>
                <td style="padding: 10px; text-align: center;">${formatIndonesianDateShort(item.date)}</div>
                <td style="padding: 10px; text-align: center;">${item.dayName}</div>
                <td style="padding: 10px; text-align: center;">
                    <span style="color: ${item.statusColor}; font-weight: bold; display: inline-flex; align-items: center; gap: 4px;">
                        ${item.statusIcon} ${item.statusText}
                    </span>
                 </div>
                <td style="padding: 10px; text-align: center; font-family: monospace;">${item.timeIn}</div>
                <td style="padding: 10px; text-align: center; font-family: monospace;">${item.timeOut}</div>
            </tr>
        `;
    }
    
    const emptyMessage = data.totalDays === 0 ? `
        <div style="text-align:center; padding:40px; background: var(--bg-hover); border-radius: 16px; margin: 20px;">
            <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
            <h3 style="color: var(--text-primary);">Belum Ada Data Absensi</h3>
            <p style="color: var(--text-muted); margin-top: 8px;">
                Siswa <strong>${escapeHtml(student.nama)}</strong> (ID: ${student.id})<br>
                belum pernah melakukan absensi fingerprint.
            </p>
        </div>
    ` : `
        <div class="table-container" style="max-height: 350px; overflow-y: auto;">
            <table style="width: 100%; font-size: 13px;">
                <thead style="position: sticky; top: 0; background: var(--bg-card); z-index: 10;">
                    <tr style="background: var(--bg-secondary);">
                        <th style="padding: 10px; text-align: center;">No</th>
                        <th style="padding: 10px; text-align: center;">Tanggal</th>
                        <th style="padding: 10px; text-align: center;">Hari</th>
                        <th style="padding: 10px; text-align: center;">Status</th>
                        <th style="padding: 10px; text-align: center;">Jam Masuk</th>
                        <th style="padding: 10px; text-align: center;">Jam Pulang</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
        <div class="rekap-footer" style="margin-top: 15px; padding-top: 10px; text-align: center; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--border);">
            * Data dihitung berdasarkan hari sekolah (tidak termasuk hari libur mingguan & khusus)
        </div>
    `;
    
    // Navigasi prev/next buttons
    const navButtons = currentStudentList.length > 1 ? `
        <div style="display: flex; gap: 10px; align-items: center;">
            <button class="btn-icon" onclick="navigateRekapStudent(-1)" 
                    style="background: var(--bg-secondary); border: none; padding: 8px 16px; border-radius: 30px; cursor: pointer; ${currentStudentIndex <= 0 ? 'opacity: 0.5; pointer-events: none;' : ''}"
                    ${currentStudentIndex <= 0 ? 'disabled' : ''}>
                ◀ Sebelumnya
            </button>
            <span style="color: var(--text-muted); font-size: 12px;">${currentStudentIndex + 1} / ${currentStudentList.length}</span>
            <button class="btn-icon" onclick="navigateRekapStudent(1)" 
                    style="background: var(--bg-secondary); border: none; padding: 8px 16px; border-radius: 30px; cursor: pointer; ${currentStudentIndex >= currentStudentList.length - 1 ? 'opacity: 0.5; pointer-events: none;' : ''}"
                    ${currentStudentIndex >= currentStudentList.length - 1 ? 'disabled' : ''}>
                Selanjutnya ▶
            </button>
        </div>
    ` : '';
    
    // Pilihan periode yang sudah dipilih
    const periodOptions = `
        <select id="modal-period-select" onchange="changeModalPeriod(this.value)" style="padding: 8px 12px; border-radius: 30px; background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary);">
            <option value="hari" ${currentModalPeriod === 'hari' ? 'selected' : ''}>📅 Hari Ini</option>
            <option value="minggu" ${currentModalPeriod === 'minggu' ? 'selected' : ''}>📆 Minggu Ini</option>
            <option value="bulan" ${currentModalPeriod === 'bulan' ? 'selected' : ''}>📊 Bulan Ini</option>
            <option value="semester" ${currentModalPeriod === 'semester' ? 'selected' : ''}>📚 Semester Ini</option>
            <option value="tahun" ${currentModalPeriod === 'tahun' ? 'selected' : ''}>🗓️ Tahun Ini</option>
            <option value="pertama" ${currentModalPeriod === 'pertama' ? 'selected' : ''}>⭐ Pertama Kali</option>
            <option value="custom" ${currentModalPeriod === 'custom' ? 'selected' : ''}>📅 Custom Range</option>
        </select>
    `;
    
    // Custom range inputs
    const customRangeHtml = `
        <div id="modal-custom-range" style="display: ${currentModalPeriod === 'custom' ? 'flex' : 'none'}; gap: 10px; align-items: center; flex-wrap: wrap;">
            <input type="date" id="modal-custom-start" value="${currentModalCustomStart || ''}" style="padding: 8px 12px; border-radius: 30px; background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary);">
            <span>s/d</span>
            <input type="date" id="modal-custom-end" value="${currentModalCustomEnd || ''}" style="padding: 8px 12px; border-radius: 30px; background: var(--bg-secondary); border: 1px solid var(--border); color: var(--text-primary);">
            <button class="btn-action btn-primary" onclick="updateModalCustomDates()" style="padding: 6px 16px;">📅 Terapkan</button>
        </div>
    `;
    
    const modalHtml = `
        <div id="modal-rekap-per-siswa" class="modal-overlay open" style="z-index: 10000;">
            <div class="modal-box" style="max-width: 1000px; width: 90%; max-height: 85vh; overflow-y: auto; animation: modalSlideIn 0.3s ease;">
                <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; padding: 15px 20px; border-bottom: 1px solid var(--border);">
                    <span style="font-size: 1.2rem; font-weight: bold;">📋 Detail Rekap Absensi</span>
                    <div style="display: flex; gap: 15px; align-items: center;">
                        ${navButtons}
                        <span onclick="closeRekapPerSiswaModal()" style="cursor: pointer; font-size: 24px; padding: 0 8px;">✖</span>
                    </div>
                </div>
                
                <div style="padding: 20px;">
                    <!-- Header Info Siswa -->
                    <div style="display: flex; gap: 20px; align-items: center; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <img src="${avatarUrl}" 
                                 style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #00bcd4; background: var(--bg-card); cursor: pointer;"
                                 onerror="this.src='https://ui-avatars.com/api/?name=${studentInitial}&background=00bcd4&color=fff&size=100&bold=true'"
                                 onclick="showRekapStudentPhoto('${student.id}', '${escapeHtml(student.nama)}', this.src)">
                            <div>
                                <h2 style="margin: 0; color: var(--text-primary); font-size: 1.4rem;">
                                    ${escapeHtml(student.nama)}${accountBadge}
                                </h2>
                                <div style="color: var(--text-muted); margin-top: 5px; font-size: 0.85rem;">
                                    <span>🆔 ID: ${student.id}</span> | 
                                    <span>📚 Kelas: ${student.kelas || '-'}</span> | 
                                    <span>🎓 Jurusan: ${student.jurusan || '-'}</span>
                                </div>
                            </div>
                        </div>
                        <div style="flex: 1; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px;">
                            <button class="btn-action btn-success" onclick="exportCurrentRekapPerSiswaToExcel()" style="padding: 8px 16px;">📥 Excel</button>
                            <button class="btn-action btn-primary" onclick="exportCurrentRekapPerSiswaToPDF()" style="padding: 8px 16px;">📄 PDF</button>
                        </div>
                    </div>
                    
                    <!-- Pilihan Periode -->
                    <div style="margin-bottom: 20px; padding: 15px; background: var(--bg-hover); border-radius: 16px;">
                        <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap; margin-bottom: 10px;">
                            <label style="font-weight: 500;">📅 Pilih Periode:</label>
                            ${periodOptions}
                        </div>
                        ${customRangeHtml}
                    </div>
                    
                    <!-- Ringkasan Statistik -->
                    <div style="display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;">
                        <div class="rekap-stat-card" style="text-align: center; background: rgba(76, 175, 80, 0.15); padding: 8px 15px; border-radius: 12px; flex: 1; min-width: 70px;">
                            <div style="font-size: 24px; font-weight: bold; color: #4caf50;">${data.hadir}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">✅ Hadir</div>
                        </div>
                        <div class="rekap-stat-card" style="text-align: center; background: rgba(255, 152, 0, 0.15); padding: 8px 15px; border-radius: 12px; flex: 1; min-width: 70px;">
                            <div style="font-size: 24px; font-weight: bold; color: #ff9800;">${data.sakit}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">🤒 Sakit</div>
                        </div>
                        <div class="rekap-stat-card" style="text-align: center; background: rgba(33, 150, 243, 0.15); padding: 8px 15px; border-radius: 12px; flex: 1; min-width: 70px;">
                            <div style="font-size: 24px; font-weight: bold; color: #2196f3;">${data.izin}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">📝 Izin</div>
                        </div>
                        <div class="rekap-stat-card" style="text-align: center; background: rgba(244, 67, 54, 0.15); padding: 8px 15px; border-radius: 12px; flex: 1; min-width: 70px;">
                            <div style="font-size: 24px; font-weight: bold; color: #f44336;">${data.alpha}</div>
                            <div style="font-size: 11px; color: var(--text-muted);">❌ Alpha</div>
                        </div>
                        <div class="rekap-stat-card" style="text-align: center; background: rgba(0, 188, 212, 0.15); padding: 8px 15px; border-radius: 12px; flex: 1; min-width: 70px;">
                            <div style="font-size: 24px; font-weight: bold; color: #00bcd4;">${data.persentase}%</div>
                            <div style="font-size: 11px; color: var(--text-muted);">📊 Kehadiran</div>
                        </div>
                    </div>
                    
                    <!-- Periode dan Progress -->
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
                            <div style="color: var(--text-muted); font-size: 0.85rem;">
                                <strong>📅 Periode:</strong> <span id="modal-period-label">${data.periodLabel || formatIndonesianDateShort(data.startDate) + ' - ' + formatIndonesianDateShort(data.endDate)}</span>
                                <span style="margin-left: 15px;">📊 Total Hari Sekolah: <strong>${data.totalDays}</strong> hari</span>
                            </div>
                            <div>
                                <span class="rekap-grade-badge" style="background: ${data.gradeColor}; color: ${data.gradeColor === '#ffc107' ? '#333' : 'white'}; padding: 4px 12px; border-radius: 20px; font-weight: bold; font-size: 0.8rem;">
                                    ${data.statusGrade}
                                </span>
                            </div>
                        </div>
                        <div class="progress-bar" style="height: 8px; border-radius: 10px; background: var(--bg-hover);">
                            <div class="progress-fill" style="width: ${data.persentase}%; background: ${data.gradeColor}; border-radius: 10px; height: 100%;"></div>
                        </div>
                    </div>
                    
                    <!-- Tabel Detail -->
                    ${emptyMessage}
                </div>
                
                <div class="modal-actions" style="padding: 15px; border-top: 1px solid var(--border); text-align: center;">
                    <button class="btn-cancel" onclick="closeRekapPerSiswaModal()" style="padding: 8px 24px;">Tutup</button>
                </div>
            </div>
        </div>
    `;
    
    // Hapus modal lama jika ada
    const existingModal = document.getElementById('modal-rekap-per-siswa');
    if (existingModal) existingModal.remove();
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Update label periode di modal setelah render
    const periodLabelSpan = document.getElementById('modal-period-label');
    if (periodLabelSpan) {
        periodLabelSpan.textContent = data.periodLabel || `${formatIndonesianDateShort(data.startDate)} - ${formatIndonesianDateShort(data.endDate)}`;
    }
    
    if (typeof showToast === 'function' && data.totalDays > 0) {
        setTimeout(() => showToast(`✅ Rekap ${student.nama} selesai dimuat`, "success"), 500);
    }
}

function closeRekapPerSiswaModal() {
    const modal = document.getElementById('modal-rekap-per-siswa');
    if (modal) {
        modal.classList.remove('open');
        setTimeout(() => {
            if (modal.parentNode) modal.remove();
        }, 300);
    }
    currentRekapPerSiswaData = null;
}

// ======================= EKSPOR DARI MODAL ========================

async function exportCurrentRekapPerSiswaToExcel() {
    if (!currentRekapPerSiswaData) {
        if (typeof showToast === 'function') showToast("📭 Tidak ada data rekap per siswa untuk diekspor!", "warning");
        return;
    }
    
    const data = currentRekapPerSiswaData;
    const student = data.student;
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sistem Absensi';
    const dateNow = new Date().toLocaleDateString('id-ID');
    
    let csv = "\uFEFF";
    csv += `"LAPORAN REKAP ABSENSI PER SISWA"\n`;
    csv += `"${schoolName}"\n`;
    csv += `"Nama: ${student.nama}"\n`;
    csv += `"ID: ${student.id} | Kelas: ${student.kelas || '-'} | Jurusan: ${student.jurusan || '-'}"\n`;
    csv += `"Periode: ${data.periodLabel || formatIndonesianDateShort(data.startDate) + ' - ' + formatIndonesianDateShort(data.endDate)}"\n`;
    csv += `"Total Hari Sekolah: ${data.totalDays} hari"\n`;
    csv += `"Tanggal Cetak: ${dateNow}"\n`;
    csv += `\n`;
    csv += `"RINGKASAN"\n`;
    csv += `"Hadir","Sakit","Izin","Alpha","Persentase","Status"\n`;
    csv += `${data.hadir},${data.sakit},${data.izin},${data.alpha},${data.persentase}%,${data.statusGrade}\n`;
    csv += `\n`;
    csv += `"DETAIL ABSENSI HARIAN"\n`;
    csv += `"No","Tanggal","Hari","Status","Jam Masuk","Jam Pulang"\n`;
    
    let no = 1;
    for (const item of data.details) {
        csv += `${no},"${formatIndonesianDateShort(item.date)}","${item.dayName}","${item.statusText}","${item.timeIn}","${item.timeOut}"\n`;
        no++;
    }
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `rekap_siswa_${student.id}_${student.nama.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast("📥 Rekap per siswa berhasil diekspor ke Excel!", "success");
    
    if (typeof logActivity === 'function') {
        logActivity('export_rekap_per_siswa_excel', `Ekspor rekap per siswa: ${student.nama} (ID: ${student.id})`);
    }
}

async function exportCurrentRekapPerSiswaToPDF() {
    if (!currentRekapPerSiswaData) {
        if (typeof showToast === 'function') showToast("📭 Tidak ada data rekap per siswa untuk diekspor!", "warning");
        return;
    }
    
    const data = currentRekapPerSiswaData;
    const student = data.student;
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sistem Absensi';
    const dateNow = new Date().toLocaleDateString('id-ID');
    const timeNow = new Date().toLocaleTimeString('id-ID');
    
    let avatarUrl = getRekapStudentPhotoUrl(student.id, student.nama);
    const studentInitial = student.nama ? student.nama.charAt(0).toUpperCase() : 'U';
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Rekap Absensi ${student.nama} - ${schoolName}</title>
            <meta charset="UTF-8">
            <style>
                *{margin:0;padding:0;box-sizing:border-box}
                body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;background:white}
                .header{text-align:center;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #00bcd4}
                .header h1{color:#00bcd4;font-size:22px}
                .header h3{color:#666;font-size:14px;margin-top:5px}
                .student-info{display:flex;gap:20px;margin-bottom:20px;padding:15px;background:#f5f5f5;border-radius:12px;flex-wrap:wrap}
                .student-info img{width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid #00bcd4}
                .student-details h2{color:#333;margin-bottom:8px}
                .student-details p{color:#666;margin:4px 0}
                .summary{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:20px}
                .summary-card{flex:1;min-width:90px;text-align:center;padding:12px;border-radius:10px}
                .summary-card.hadir{background:#e8f5e9}
                .summary-card.sakit{background:#fff3e0}
                .summary-card.izin{background:#e3f2fd}
                .summary-card.alpha{background:#ffebee}
                .summary-card.persen{background:#e0f7fa}
                .summary-number{font-size:24px;font-weight:bold}
                .summary-label{font-size:11px;margin-top:5px;color:#555}
                .progress-container{background:#eee;border-radius:10px;height:10px;margin:15px 0}
                .progress-fill{background:#00bcd4;border-radius:10px;height:10px;width:0%}
                table{width:100%;border-collapse:collapse;margin-top:15px;font-size:11px}
                th,td{border:1px solid #ddd;padding:8px 6px;text-align:center}
                th{background:#00bcd4;color:white;font-weight:bold}
                .status-hadir{color:#4caf50;font-weight:bold}
                .status-sakit{color:#ff9800;font-weight:bold}
                .status-izin{color:#2196f3;font-weight:bold}
                .status-alpha{color:#f44336;font-weight:bold}
                .footer{text-align:center;margin-top:20px;padding-top:10px;font-size:9px;color:#888;border-top:1px solid #ddd}
                .grade-badge{display:inline-block;padding:4px 12px;border-radius:20px;font-weight:bold;font-size:12px}
                @media print{body{padding:0;margin:0}.no-print{display:none}}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${escapeHtml(schoolName)}</h1>
                <h3>LAPORAN REKAP ABSENSI PER SISWA</h3>
            </div>
            <div class="student-info">
                <img src="${avatarUrl}" onerror="this.src='https://ui-avatars.com/api/?name=${studentInitial}&background=00bcd4&color=fff&size=100&bold=true'">
                <div class="student-details">
                    <h2>${escapeHtml(student.nama)}</h2>
                    <p>🆔 ID: ${student.id} | 📚 Kelas: ${student.kelas || '-'} | 🎓 Jurusan: ${student.jurusan || '-'}</p>
                    <p>📅 Periode: ${data.periodLabel || formatIndonesianDateShort(data.startDate) + ' - ' + formatIndonesianDateShort(data.endDate)}</p>
                    <p>📊 Total Hari Sekolah: ${data.totalDays} hari</p>
                </div>
            </div>
            <div class="summary">
                <div class="summary-card hadir"><div class="summary-number" style="color:#4caf50">${data.hadir}</div><div class="summary-label">✅ Hadir</div></div>
                <div class="summary-card sakit"><div class="summary-number" style="color:#ff9800">${data.sakit}</div><div class="summary-label">🤒 Sakit</div></div>
                <div class="summary-card izin"><div class="summary-number" style="color:#2196f3">${data.izin}</div><div class="summary-label">📝 Izin</div></div>
                <div class="summary-card alpha"><div class="summary-number" style="color:#f44336">${data.alpha}</div><div class="summary-label">❌ Alpha</div></div>
                <div class="summary-card persen"><div class="summary-number" style="color:#00bcd4">${data.persentase}%</div><div class="summary-label">📊 Kehadiran</div></div>
            </div>
            <div class="progress-container"><div class="progress-fill" style="width: ${data.persentase}%; background: ${data.gradeColor}"></div></div>
            <div style="text-align:center; margin-bottom:10px">
                <span class="grade-badge" style="background: ${data.gradeColor}; color: ${data.gradeColor === '#ffc107' ? '#333' : 'white'}">${data.statusGrade}</span>
            </div>
            <table>
                <thead>
                    <tr><th>No</th><th>Tanggal</th><th>Hari</th><th>Status</th><th>Jam Masuk</th><th>Jam Pulang</th></tr>
                </thead>
                <tbody>
    `);
    
    let no = 1;
    for (const item of data.details) {
        let statusClass = '';
        if (item.status === 'hadir') statusClass = 'status-hadir';
        else if (item.status === 'sakit') statusClass = 'status-sakit';
        else if (item.status === 'izin') statusClass = 'status-izin';
        else statusClass = 'status-alpha';
        
        printWindow.document.write(`
            <tr>
                <td>${no++}</div>
                <td>${formatIndonesianDateShort(item.date)}</div>
                <td>${item.dayName}</div>
                <td class="${statusClass}">${item.statusText}</div>
                <td>${item.timeIn}</div>
                <td>${item.timeOut}</div>
            </tr>
        `);
    }
    
    printWindow.document.write(`
                </tbody>
            </table>
            <div class="footer">
                <p>Dicetak oleh: ${escapeHtml(currentUser?.nama || 'Admin')} | Tanggal: ${dateNow} ${timeNow}</p>
                <p>* Data dihitung berdasarkan hari sekolah (tidak termasuk hari libur mingguan & khusus)</p>
                <p>Sistem Absensi IoT - Fingerprint & Real-time</p>
            </div>
            <div class="no-print" style="text-align:center; margin-top:20px;">
                <button onclick="window.print()" style="padding:10px 20px; background:#00bcd4; color:white; border:none; border-radius:5px; cursor:pointer;">🖨️ Cetak / Simpan PDF</button>
                <button onclick="window.close()" style="padding:10px 20px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer; margin-left:10px;">✖ Tutup</button>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    if (typeof showToast === 'function') showToast("📄 Membuka halaman print...", "info");
    
    if (typeof logActivity === 'function') {
        logActivity('export_rekap_per_siswa_pdf', `Ekspor rekap per siswa ke PDF: ${student.nama} (ID: ${student.id})`);
    }
}

function showRekapStudentPhoto(studentId, studentName, photoUrl) {
    const userAuth = dbData?.users_auth?.find(u => u.fpId == studentId);
    const hasAccount = !!userAuth;
    const accountInfo = hasAccount 
        ? `✅ Sudah memiliki akun (${userAuth.email || userAuth.nama})` 
        : '❌ Belum memiliki akun. Foto menggunakan inisial nama.';
    
    let modalHtml = `
        <div id="modal-rekap-photo" class="modal-overlay open">
            <div class="modal-box" style="max-width: 500px; text-align: center;">
                <div class="modal-title">
                    <span>📸 Foto ${escapeHtml(studentName)}</span>
                    <span onclick="closeModal('modal-rekap-photo')">✖</span>
                </div>
                <div style="padding: 20px;">
                    <img src="${photoUrl}" 
                         style="max-width: 100%; max-height: 60vh; border-radius: 20px; object-fit: contain;"
                         onerror="this.src='https://ui-avatars.com/api/?name=${escapeHtml(studentName?.charAt(0) || 'U')}&background=00bcd4&color=fff&size=200&bold=true'">
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
                    <button class="btn-cancel" onclick="closeModal('modal-rekap-photo')">Tutup</button>
                </div>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('modal-rekap-photo');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function cleanupRekapPerSiswa() {
    currentRekapPerSiswaData = null;
    currentSelectedStudent = null;
    currentStudentList = [];
    currentStudentIndex = -1;
    rekapPhotoCache.clear();
    console.log("🧹 Rekap per Siswa system cleaned up");
}

// ======================= EKSPOR KE GLOBAL ========================
window.initRekapPerSiswa = initRekapPerSiswa;
window.openRekapPerSiswaModal = openRekapPerSiswaModal;
window.closeRekapPerSiswaModal = closeRekapPerSiswaModal;
window.navigateRekapStudent = navigateRekapStudent;
window.changeModalPeriod = changeModalPeriod;
window.updateModalCustomDates = updateModalCustomDates;
window.exportCurrentRekapPerSiswaToExcel = exportCurrentRekapPerSiswaToExcel;
window.exportCurrentRekapPerSiswaToPDF = exportCurrentRekapPerSiswaToPDF;
window.cleanupRekapPerSiswa = cleanupRekapPerSiswa;
window.getRekapStudentPhotoUrl = getRekapStudentPhotoUrl;
window.refreshRekapPhotoCache = refreshRekapPhotoCache;
window.showRekapStudentPhoto = showRekapStudentPhoto;
window.getRekapDateRange = getRekapDateRange;

console.log("✅ rekap-per-siswa.js V2.1 loaded - Modal dengan pilihan periode lengkap (Hari, Minggu, Bulan, Semester, Tahun, Pertama Kali, Custom)");