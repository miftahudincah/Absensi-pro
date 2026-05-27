// rekap-per-siswa.js - VERSION 1.4 (DENGAN DUKUNGAN PARAMETER STUDENT ID & INTEGRASI KLIK BARIS)
// Fitur Rekap Absensi per Siswa (Detail Harian dengan Foto)
// PERUBAHAN V1.4: 
//   - Menambahkan dukungan parameter studentId pada loadRekapPerSiswa()
//   - Menambahkan fungsi loadRekapPerSiswaByStudentId() untuk panggilan eksternal
//   - Memastikan container rekap per siswa terbuka saat dipanggil dari luar
//   - Menambahkan auto-refresh dropdown jika siswa belum ada di dropdown
//   - Menambahkan efek highlight saat dipanggil dari rekap utama
// ============================================================================

let currentRekapPerSiswaData = null;
let currentSelectedStudent = null;
const rekapPhotoCache = new Map();

// ======================= FUNGSI PERIODE LENGKAP ========================

/**
 * Mendapatkan range tanggal berdasarkan periode yang dipilih
 * @param {string} period - 'minggu', 'bulan', 'semester', 'tahun', 'pertama', 'custom'
 * @param {Date} customStart - tanggal mulai custom (opsional)
 * @param {Date} customEnd - tanggal akhir custom (opsional)
 * @returns {{start: Date, end: Date, label: string}}
 */
function getRekapDateRange(period, customStart = null, customEnd = null) {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    let label = '';
    
    switch(period) {
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
            // Range dari tanggal pertama kali siswa pernah absen sampai sekarang
            label = 'Pertama Kali Absensi';
            // Akan diisi nanti setelah data siswa diambil
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
        renderRekapPerSiswa();
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
                renderRekapPerSiswa();
            }
        }
    });
}

// ======================= INISIALISASI ========================

function initRekapPerSiswa() {
    console.log("📋 Initializing Rekap per Siswa module...");
    
    if (dbData && dbData.users && dbData.users.length > 0) {
        populateRekapPerSiswaSelect();
    } else {
        setTimeout(initRekapPerSiswa, 500);
    }
    
    const periodSelect = document.getElementById('rekapPerSiswaPeriod');
    if (periodSelect) {
        periodSelect.addEventListener('change', () => {
            const customGroup = document.getElementById('rekapPerSiswaCustomRange');
            if (customGroup) {
                customGroup.style.display = periodSelect.value === 'custom' ? 'flex' : 'none';
            }
            if (document.getElementById('rekapPerSiswaContainer')?.style.display === 'block') {
                loadRekapPerSiswa();
            }
        });
    }
    
    const customStart = document.getElementById('rekapPerSiswaStartDate');
    const customEnd = document.getElementById('rekapPerSiswaEndDate');
    if (customStart) customStart.addEventListener('change', () => {
        if (document.getElementById('rekapPerSiswaPeriod')?.value === 'custom' && 
            document.getElementById('rekapPerSiswaContainer')?.style.display === 'block') {
            loadRekapPerSiswa();
        }
    });
    if (customEnd) customEnd.addEventListener('change', () => {
        if (document.getElementById('rekapPerSiswaPeriod')?.value === 'custom' && 
            document.getElementById('rekapPerSiswaContainer')?.style.display === 'block') {
            loadRekapPerSiswa();
        }
    });
    
    // Set default custom dates (30 hari terakhir)
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    if (customStart && !customStart.value) customStart.value = thirtyDaysAgo.toISOString().split('T')[0];
    if (customEnd && !customEnd.value) customEnd.value = today.toISOString().split('T')[0];
    
    setupRekapPhotoListener();
}

function populateRekapPerSiswaSelect() {
    const select = document.getElementById('rekapPerSiswaSelect');
    if (!select) return;
    
    const previousValue = select.value;
    select.innerHTML = '<option value="">-- Pilih Siswa --</option>';
    
    if (!dbData.users || dbData.users.length === 0) {
        select.innerHTML += '<option value="" disabled>📭 Belum ada data siswa</option>';
        return;
    }
    
    const students = [...dbData.users].sort((a, b) => a.id - b.id);
    for (const student of students) {
        const photoUrl = getRekapStudentPhotoUrl(student.id, student.nama);
        select.innerHTML += `<option value="${student.id}" data-avatar="${photoUrl}">${student.id} - ${escapeHtml(student.nama)} (${student.kelas || '-'} / ${student.jurusan || '-'})</option>`;
    }
    
    if (previousValue && students.some(s => s.id == previousValue)) {
        select.value = previousValue;
    }
    
    console.log(`✅ Populated ${students.length} students in rekap per siswa select`);
}

// ======================= LOAD DATA REKAP PER SISWA ========================

/**
 * Load rekap per siswa
 * @param {string|number} studentId - Optional student ID (jika tidak diberikan, ambil dari dropdown)
 * @returns {Promise<void>}
 */
async function loadRekapPerSiswa(studentId = null) {
    const select = document.getElementById('rekapPerSiswaSelect');
    
    // Jika studentId diberikan, set dropdown ke nilai tersebut
    if (studentId !== null && studentId !== undefined && select) {
        // Cari option dengan value yang cocok
        let optionFound = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value == studentId) {
                select.selectedIndex = i;
                optionFound = true;
                break;
            }
        }
        
        // Jika tidak ditemukan, refresh dropdown terlebih dahulu
        if (!optionFound) {
            console.log(`Student ID ${studentId} not found in dropdown, refreshing...`);
            await populateRekapPerSiswaSelect();
            
            // Coba lagi setelah refresh
            for (let i = 0; i < select.options.length; i++) {
                if (select.options[i].value == studentId) {
                    select.selectedIndex = i;
                    optionFound = true;
                    break;
                }
            }
        }
        
        if (!optionFound) {
            console.warn(`Student ID ${studentId} still not found after refresh`);
            if (typeof showToast === 'function') {
                showToast(`⚠️ Data siswa dengan ID ${studentId} tidak ditemukan`, "warning");
            }
            return;
        }
    }
    
    const selectedStudentId = select?.value;
    
    if (!selectedStudentId) {
        if (typeof showToast === 'function') showToast("📭 Pilih siswa terlebih dahulu!", "warning");
        return;
    }
    
    const student = dbData.users?.find(s => s.id == selectedStudentId);
    if (!student) {
        if (typeof showToast === 'function') showToast("❌ Data siswa tidak ditemukan!", "error");
        return;
    }
    
    currentSelectedStudent = student;
    
    const periodSelect = document.getElementById('rekapPerSiswaPeriod');
    const period = periodSelect ? periodSelect.value : 'minggu';
    let startDate, endDate, periodLabel;
    
    if (period === 'custom') {
        const startInput = document.getElementById('rekapPerSiswaStartDate').value;
        const endInput = document.getElementById('rekapPerSiswaEndDate').value;
        if (!startInput || !endInput) {
            if (typeof showToast === 'function') showToast("📅 Pilih tanggal mulai dan akhir terlebih dahulu!", "warning");
            return;
        }
        startDate = new Date(startInput);
        endDate = new Date(endInput);
        endDate.setHours(23, 59, 59, 999);
        periodLabel = `Custom (${formatIndonesianDateShort(startInput)} - ${formatIndonesianDateShort(endInput)})`;
    } 
    else if (period === 'pertama') {
        // Cari tanggal pertama kali siswa pernah absen
        const firstAttendance = dbData.attendance
            .filter(a => a.studentId == selectedStudentId && a.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
        
        if (firstAttendance && firstAttendance.date) {
            startDate = new Date(firstAttendance.date);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            periodLabel = `Pertama Kali Absensi (${formatIndonesianDateShort(firstAttendance.date)} - Sekarang)`;
        } else {
            // Jika belum pernah absen sama sekali
            startDate = new Date();
            startDate.setMonth(startDate.getMonth() - 1);
            endDate = new Date();
            periodLabel = 'Belum Pernah Absen';
            if (typeof showToast === 'function') showToast("⚠️ Siswa ini belum pernah melakukan absensi sama sekali!", "warning");
        }
    }
    else {
        const range = getRekapDateRange(period);
        startDate = range.start;
        endDate = range.end;
        periodLabel = range.label;
    }
    
    if (startDate && endDate && startDate > endDate) {
        if (typeof showToast === 'function') showToast("⚠️ Tanggal mulai harus lebih kecil dari tanggal akhir!", "error");
        return;
    }
    
    // Update label periode yang ditampilkan
    const periodLabelSpan = document.getElementById('rekapPerSiswaPeriodLabel');
    if (periodLabelSpan && periodLabel) {
        periodLabelSpan.textContent = periodLabel;
    }
    
    if (typeof showToast === 'function') showToast(`⏳ Memuat rekap ${student.nama}...`, "info");
    
    const container = document.getElementById('rekapPerSiswaContainer');
    const contentDiv = document.getElementById('rekapPerSiswaContent');
    
    if (container) container.style.display = 'block';
    if (contentDiv) contentDiv.innerHTML = '<div style="text-align:center; padding:40px;">⏳ Menghitung data kehadiran...</div>';
    
    try {
        // Jika startDate tidak ada (belum pernah absen)
        if (!startDate) {
            renderEmptyRekap(student, periodLabel);
            if (typeof showToast === 'function') showToast(`📭 ${student.nama} belum memiliki data absensi`, "info");
            return;
        }
        
        let attendanceRecords = dbData.attendance.filter(a => a.studentId == selectedStudentId);
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
            const manual = manualStatusMap[dateStr]?.[selectedStudentId];
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
        
        currentRekapPerSiswaData = {
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
        
        renderRekapPerSiswa();
        if (typeof showToast === 'function') showToast(`✅ Rekap ${student.nama} selesai (${totalDays} hari sekolah)`, "success");
        
    } catch (error) {
        console.error("Error loading rekap per siswa:", error);
        if (contentDiv) {
            contentDiv.innerHTML = `<div style="text-align:center; padding:40px; color:#f44336;">❌ Gagal memuat data: ${error.message}</div>`;
        }
        if (typeof showToast === 'function') showToast("❌ Gagal memuat rekap per siswa", "error");
    }
}

/**
 * Load rekap per siswa berdasarkan student ID (fungsi untuk panggilan eksternal)
 * @param {string|number} studentId - ID siswa
 * @param {boolean} scrollToContainer - Apakah akan scroll ke container
 * @returns {Promise<void>}
 */
async function loadRekapPerSiswaByStudentId(studentId, scrollToContainer = true) {
    if (!studentId) {
        if (typeof showToast === 'function') showToast("ID siswa tidak valid!", "error");
        return;
    }
    
    // Cari data siswa
    const student = dbData.users?.find(s => s.id == studentId);
    if (!student) {
        if (typeof showToast === 'function') showToast(`❌ Data siswa dengan ID ${studentId} tidak ditemukan!`, "error");
        return;
    }
    
    // Pastikan container terlihat
    const container = document.getElementById('rekapPerSiswaContainer');
    if (container) {
        container.style.display = 'block';
        
        if (scrollToContainer) {
            // Scroll ke container dengan efek smooth
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
            
            // Beri efek highlight
            container.style.transition = 'box-shadow 0.3s';
            container.style.boxShadow = '0 0 0 2px #00bcd4, 0 4px 20px rgba(0,188,212,0.3)';
            setTimeout(() => {
                container.style.boxShadow = '';
            }, 1500);
        }
    }
    
    // Refresh dropdown jika perlu
    const select = document.getElementById('rekapPerSiswaSelect');
    if (select) {
        let optionFound = false;
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value == studentId) {
                optionFound = true;
                break;
            }
        }
        
        if (!optionFound) {
            await populateRekapPerSiswaSelect();
        }
    }
    
    // Load rekap
    await loadRekapPerSiswa(studentId);
}

function renderEmptyRekap(student, periodLabel) {
    currentRekapPerSiswaData = null;
    const contentDiv = document.getElementById('rekapPerSiswaContent');
    if (!contentDiv) return;
    
    contentDiv.innerHTML = `
        <div style="text-align:center; padding:40px; background: var(--bg-hover); border-radius: 16px;">
            <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
            <h3 style="color: var(--text-primary);">Belum Ada Data Absensi</h3>
            <p style="color: var(--text-muted); margin-top: 8px;">
                Siswa <strong>${escapeHtml(student.nama)}</strong> (ID: ${student.id})<br>
                belum pernah melakukan absensi fingerprint.
            </p>
            <p style="color: var(--text-muted); font-size: 12px; margin-top: 16px;">
                Periode: ${periodLabel || 'Pertama Kali Absensi'}
            </p>
        </div>
    `;
}

// ======================= RENDER REKAP PER SISWA ========================

function formatDayName(dateStr) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const date = new Date(dateStr);
    return days[date.getDay()];
}

function renderRekapPerSiswa() {
    const contentDiv = document.getElementById('rekapPerSiswaContent');
    if (!contentDiv || !currentRekapPerSiswaData) return;
    
    const data = currentRekapPerSiswaData;
    const student = data.student;
    
    let avatarUrl = getRekapStudentPhotoUrl(student.id, student.nama);
    const studentInitial = student.nama ? student.nama.charAt(0).toUpperCase() : 'U';
    
    // Cek apakah siswa memiliki akun
    const hasAccount = dbData.users_auth?.some(u => u.fpId == student.id);
    const accountBadge = hasAccount 
        ? '<span class="badge-account" style="background:#4caf50; font-size:11px; margin-left:10px; padding:2px 8px; border-radius:20px;">✓ Berakun</span>' 
        : '<span class="badge-no-account" style="background:#888; font-size:11px; margin-left:10px; padding:2px 8px; border-radius:20px;">❌ Belum Berakun</span>';
    
    let html = `
        <div class="rekap-per-siswa-header" style="display: flex; gap: 20px; align-items: center; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 15px;">
                <img src="${avatarUrl}" 
                     class="rekap-student-avatar"
                     style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #00bcd4; background: var(--bg-card); cursor: pointer;"
                     onerror="this.src='https://ui-avatars.com/api/?name=${studentInitial}&background=00bcd4&color=fff&size=100&bold=true'"
                     onclick="showRekapStudentPhoto('${student.id}', '${escapeHtml(student.nama)}', this.src)">
                <div>
                    <h2 style="margin: 0; color: var(--text-primary);">
                        ${escapeHtml(student.nama)}${accountBadge}
                    </h2>
                    <div style="color: var(--text-muted); margin-top: 5px;">
                        <span>🆔 ID: ${student.id}</span> | 
                        <span>📚 Kelas: ${student.kelas || '-'}</span> | 
                        <span>🎓 Jurusan: ${student.jurusan || '-'}</span>
                    </div>
                </div>
            </div>
            <div style="flex: 1; display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 15px;">
                <div class="rekap-stat-card" style="text-align: center; background: rgba(76, 175, 80, 0.15); padding: 10px 18px; border-radius: 12px;">
                    <div style="font-size: 28px; font-weight: bold; color: #4caf50;">${data.hadir}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">✅ Hadir</div>
                </div>
                <div class="rekap-stat-card" style="text-align: center; background: rgba(255, 152, 0, 0.15); padding: 10px 18px; border-radius: 12px;">
                    <div style="font-size: 28px; font-weight: bold; color: #ff9800;">${data.sakit}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">🤒 Sakit</div>
                </div>
                <div class="rekap-stat-card" style="text-align: center; background: rgba(33, 150, 243, 0.15); padding: 10px 18px; border-radius: 12px;">
                    <div style="font-size: 28px; font-weight: bold; color: #2196f3;">${data.izin}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">📝 Izin</div>
                </div>
                <div class="rekap-stat-card" style="text-align: center; background: rgba(244, 67, 54, 0.15); padding: 10px 18px; border-radius: 12px;">
                    <div style="font-size: 28px; font-weight: bold; color: #f44336;">${data.alpha}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">❌ Alpha</div>
                </div>
                <div class="rekap-stat-card" style="text-align: center; background: rgba(0, 188, 212, 0.15); padding: 10px 18px; border-radius: 12px;">
                    <div style="font-size: 28px; font-weight: bold; color: #00bcd4;">${data.persentase}%</div>
                    <div style="font-size: 12px; color: var(--text-muted);">📊 Kehadiran</div>
                </div>
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px;">
                <div style="color: var(--text-muted);">
                    <strong>📅 Periode:</strong> <span id="rekapPerSiswaPeriodDisplay">${data.periodLabel || formatIndonesianDateShort(data.startDate) + ' - ' + formatIndonesianDateShort(data.endDate)}</span>
                    <span style="margin-left: 15px;">📊 Total Hari Sekolah: <strong>${data.totalDays}</strong> hari</span>
                </div>
                <div>
                    <span class="rekap-grade-badge" style="background: ${data.gradeColor}; color: ${data.gradeColor === '#ffc107' ? '#333' : 'white'}; padding: 6px 14px; border-radius: 20px; font-weight: bold;">
                        ${data.statusGrade}
                    </span>
                </div>
            </div>
            <div class="progress-bar" style="height: 10px; border-radius: 10px; background: var(--bg-hover);">
                <div class="progress-fill" style="width: ${data.persentase}%; background: ${data.gradeColor}; border-radius: 10px; height: 100%;"></div>
            </div>
        </div>
        
        <div class="table-container" style="max-height: 450px; overflow-y: auto;">
            <table style="width: 100%;">
                <thead style="position: sticky; top: 0; background: var(--bg-card);">
                    <tr style="background: var(--bg-secondary);">
                        <th style="padding: 12px; text-align: center;">No</th>
                        <th style="padding: 12px; text-align: center;">Tanggal</th>
                        <th style="padding: 12px; text-align: center;">Hari</th>
                        <th style="padding: 12px; text-align: center;">Status</th>
                        <th style="padding: 12px; text-align: center;">Jam Masuk</th>
                        <th style="padding: 12px; text-align: center;">Jam Pulang</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    let no = 1;
    for (const item of data.details) {
        html += `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px; text-align: center;">${no++}</td>
                <td style="padding: 10px; text-align: center;">${formatIndonesianDateShort(item.date)}</td>
                <td style="padding: 10px; text-align: center;">${item.dayName}</td>
                <td style="padding: 10px; text-align: center;">
                    <span style="color: ${item.statusColor}; font-weight: bold; display: inline-flex; align-items: center; gap: 4px;">
                        ${item.statusIcon} ${item.statusText}
                    </span>
                </td>
                <td style="padding: 10px; text-align: center; font-family: monospace;">${item.timeIn}</td>
                <td style="padding: 10px; text-align: center; font-family: monospace;">${item.timeOut}</td>
            </tr>
        `;
    }
    
    html += `
                </tbody>
            </table>
        </div>
        <div class="rekap-footer" style="margin-top: 15px; padding-top: 10px; text-align: center; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--border);">
            * Data dihitung berdasarkan hari sekolah (tidak termasuk hari libur mingguan & khusus)
        </div>
    `;
    
    contentDiv.innerHTML = html;
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

// ======================= EXPORT FUNCTIONS ========================

async function exportRekapPerSiswaToExcel() {
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

async function exportRekapPerSiswaToPDF() {
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

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function cleanupRekapPerSiswa() {
    currentRekapPerSiswaData = null;
    currentSelectedStudent = null;
    rekapPhotoCache.clear();
    console.log("🧹 Rekap per Siswa system cleaned up");
}

// ======================= EKSPOR KE GLOBAL ========================
window.initRekapPerSiswa = initRekapPerSiswa;
window.populateRekapPerSiswaSelect = populateRekapPerSiswaSelect;
window.loadRekapPerSiswa = loadRekapPerSiswa;
window.loadRekapPerSiswaByStudentId = loadRekapPerSiswaByStudentId;
window.exportRekapPerSiswaToExcel = exportRekapPerSiswaToExcel;
window.exportRekapPerSiswaToPDF = exportRekapPerSiswaToPDF;
window.cleanupRekapPerSiswa = cleanupRekapPerSiswa;
window.getRekapStudentPhotoUrl = getRekapStudentPhotoUrl;
window.refreshRekapPhotoCache = refreshRekapPhotoCache;
window.showRekapStudentPhoto = showRekapStudentPhoto;
window.getRekapDateRange = getRekapDateRange;

console.log("✅ rekap-per-siswa.js V1.4 loaded - Dengan dukungan parameter student ID & integrasi klik baris");