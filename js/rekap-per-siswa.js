// rekap-per-siswa.js - VERSION 1.0
// Fitur Rekap Absensi per Siswa (Detail Harian)
// Menampilkan detail kehadiran individual siswa dalam periode tertentu
// ============================================================================

let currentRekapPerSiswaData = null;
let currentSelectedStudent = null;

// ======================= INISIALISASI ========================

function initRekapPerSiswa() {
    console.log("📋 Initializing Rekap per Siswa module...");
    
    if (dbData && dbData.users && dbData.users.length > 0) {
        populateRekapPerSiswaSelect();
    } else {
        setTimeout(initRekapPerSiswa, 500);
    }
    
    // Tambahkan listener untuk perubahan periode
    const periodSelect = document.getElementById('rekapPeriod');
    if (periodSelect) {
        periodSelect.addEventListener('change', () => {
            if (document.getElementById('rekapPerSiswaContainer')?.style.display === 'block') {
                loadRekapPerSiswa();
            }
        });
    }
    
    const customStart = document.getElementById('rekapStartDate');
    const customEnd = document.getElementById('rekapEndDate');
    if (customStart) customStart.addEventListener('change', () => {
        if (document.getElementById('rekapPeriod')?.value === 'custom' && 
            document.getElementById('rekapPerSiswaContainer')?.style.display === 'block') {
            loadRekapPerSiswa();
        }
    });
    if (customEnd) customEnd.addEventListener('change', () => {
        if (document.getElementById('rekapPeriod')?.value === 'custom' && 
            document.getElementById('rekapPerSiswaContainer')?.style.display === 'block') {
            loadRekapPerSiswa();
        }
    });
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
    students.forEach(student => {
        const avatarUrl = typeof getStudentAvatar === 'function' ? 
            getStudentAvatar(student.id, student.nama) : 
            `https://ui-avatars.com/api/?name=${encodeURIComponent(student.nama)}&background=00bcd4&color=fff&size=32`;
        select.innerHTML += `<option value="${student.id}" data-avatar="${avatarUrl}">${student.id} - ${escapeHtml(student.nama)} (${student.kelas || '-'} / ${student.jurusan || '-'})</option>`;
    });
    
    if (previousValue && students.some(s => s.id == previousValue)) {
        select.value = previousValue;
    }
    
    console.log(`✅ Populated ${students.length} students in rekap per siswa select`);
}

// ======================= LOAD DATA REKAP PER SISWA ========================

async function loadRekapPerSiswa() {
    const select = document.getElementById('rekapPerSiswaSelect');
    const studentId = select?.value;
    
    if (!studentId) {
        showToast("📭 Pilih siswa terlebih dahulu!", "warning");
        return;
    }
    
    const student = dbData.users?.find(s => s.id == studentId);
    if (!student) {
        showToast("❌ Data siswa tidak ditemukan!", "error");
        return;
    }
    
    currentSelectedStudent = student;
    
    const periodSelect = document.getElementById('rekapPeriod');
    const period = periodSelect ? periodSelect.value : 'minggu';
    let startDate, endDate;
    
    if (period === 'custom') {
        const startInput = document.getElementById('rekapStartDate').value;
        const endInput = document.getElementById('rekapEndDate').value;
        if (!startInput || !endInput) {
            showToast("📅 Pilih tanggal mulai dan akhir terlebih dahulu!", "warning");
            return;
        }
        startDate = new Date(startInput);
        endDate = new Date(endInput);
        endDate.setHours(23, 59, 59, 999);
    } else {
        const range = getDateRange(period);
        startDate = range.start;
        endDate = range.end;
    }
    
    if (startDate > endDate) {
        showToast("⚠️ Tanggal mulai harus lebih kecil dari tanggal akhir!", "error");
        return;
    }
    
    showToast(`⏳ Memuat rekap ${student.nama}...`, "info");
    
    const container = document.getElementById('rekapPerSiswaContainer');
    const contentDiv = document.getElementById('rekapPerSiswaContent');
    
    if (container) container.style.display = 'block';
    if (contentDiv) contentDiv.innerHTML = '<div style="text-align:center; padding:40px;">⏳ Menghitung data kehadiran...</div>';
    
    try {
        // Ambil data absensi siswa dalam periode
        let attendanceRecords = dbData.attendance.filter(a => a.studentId == studentId);
        attendanceRecords = attendanceRecords.filter(a => {
            const recordDate = new Date(a.date);
            return recordDate >= startDate && recordDate <= endDate;
        });
        
        // Filter hari libur jika fungsi tersedia
        if (typeof filterAttendanceByHoliday === 'function') {
            attendanceRecords = filterAttendanceByHoliday(attendanceRecords);
        }
        
        // Ambil data manual status
        let manualStatusMap = {};
        if (typeof fetchManualStatusForRange === 'function') {
            manualStatusMap = await fetchManualStatusForRange(startDate, endDate);
        } else {
            // Fallback: ambil manual status untuk periode
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
        
        // Buat map untuk quick lookup
        const attendanceMap = new Map();
        attendanceRecords.forEach(record => {
            attendanceMap.set(record.date, record);
        });
        
        // Build detail attendance
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
        
        currentRekapPerSiswaData = {
            student,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
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
        
        showToast(`✅ Rekap ${student.nama} selesai (${totalDays} hari sekolah)`, "success");
        
    } catch (error) {
        console.error("Error loading rekap per siswa:", error);
        if (contentDiv) {
            contentDiv.innerHTML = `<div style="text-align:center; padding:40px; color:#f44336;">❌ Gagal memuat data: ${error.message}</div>`;
        }
        showToast("❌ Gagal memuat rekap per siswa", "error");
    }
}

// ======================= RENDER REKAP PER SISWA ========================

function formatDayName(dateStr) {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const date = new Date(dateStr);
    return days[date.getDay()];
}

function formatIndonesianDate(dateStr) {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parts[2]} ${bulan[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

function renderRekapPerSiswa() {
    const contentDiv = document.getElementById('rekapPerSiswaContent');
    if (!contentDiv || !currentRekapPerSiswaData) return;
    
    const data = currentRekapPerSiswaData;
    const student = data.student;
    
    // Avatar URL
    let avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.nama)}&background=00bcd4&color=fff&size=100&bold=true`;
    if (typeof getStudentAvatar === 'function') {
        avatarUrl = getStudentAvatar(student.id, student.nama);
    }
    
    let html = `
        <div class="rekap-per-siswa-header" style="display: flex; gap: 20px; align-items: center; margin-bottom: 25px; padding-bottom: 20px; border-bottom: 1px solid var(--border); flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 15px;">
                <img src="${avatarUrl}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #00bcd4;" 
                     onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(student.nama)}&background=00bcd4&color=fff&size=100&bold=true'">
                <div>
                    <h2 style="margin: 0; color: var(--text-primary);">${escapeHtml(student.nama)}</h2>
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
                    <strong>📅 Periode:</strong> ${formatIndonesianDate(data.startDate)} - ${formatIndonesianDate(data.endDate)}
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
                <td style="padding: 10px; text-align: center;">${formatIndonesianDate(item.date)}</td>
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

// ======================= EXPORT FUNCTIONS ========================

async function exportRekapPerSiswaToExcel() {
    if (!currentRekapPerSiswaData) {
        showToast("📭 Tidak ada data rekap per siswa untuk diekspor!", "warning");
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
    csv += `"Periode: ${formatIndonesianDate(data.startDate)} - ${formatIndonesianDate(data.endDate)}"\n`;
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
        csv += `${no},"${formatIndonesianDate(item.date)}","${item.dayName}","${item.statusText}","${item.timeIn}","${item.timeOut}"\n`;
        no++;
    }
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `rekap_siswa_${student.id}_${student.nama.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("📥 Rekap per siswa berhasil diekspor ke Excel!", "success");
    
    if (typeof logActivity === 'function') {
        logActivity('export_rekap_per_siswa_excel', `Ekspor rekap per siswa: ${student.nama} (ID: ${student.id}), periode ${data.startDate} s/d ${data.endDate}`);
    }
}

async function exportRekapPerSiswaToPDF() {
    if (!currentRekapPerSiswaData) {
        showToast("📭 Tidak ada data rekap per siswa untuk diekspor!", "warning");
        return;
    }
    
    const data = currentRekapPerSiswaData;
    const student = data.student;
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sistem Absensi';
    const dateNow = new Date().toLocaleDateString('id-ID');
    const timeNow = new Date().toLocaleTimeString('id-ID');
    
    // Dapatkan avatar URL untuk print
    let avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(student.nama)}&background=00bcd4&color=fff&size=100&bold=true`;
    if (typeof getStudentAvatar === 'function') {
        avatarUrl = getStudentAvatar(student.id, student.nama);
    }
    
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
                .student-info img{width:80px;height:80px;border-radius:50%;object-fit:cover}
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
                <img src="${avatarUrl}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(student.nama)}&background=00bcd4&color=fff&size=100&bold=true'">
                <div class="student-details">
                    <h2>${escapeHtml(student.nama)}</h2>
                    <p>🆔 ID: ${student.id} | 📚 Kelas: ${student.kelas || '-'} | 🎓 Jurusan: ${student.jurusan || '-'}</p>
                    <p>📅 Periode: ${formatIndonesianDate(data.startDate)} - ${formatIndonesianDate(data.endDate)}</p>
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
                <td>${no++}</td>
                <td>${formatIndonesianDate(item.date)}</td>
                <td>${item.dayName}</td>
                <td class="${statusClass}">${item.statusText}</td>
                <td>${item.timeIn}</td>
                <td>${item.timeOut}</td>
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
    showToast("📄 Membuka halaman print...", "info");
    
    if (typeof logActivity === 'function') {
        logActivity('export_rekap_per_siswa_pdf', `Ekspor rekap per siswa ke PDF: ${student.nama} (ID: ${student.id}), periode ${data.startDate} s/d ${data.endDate}`);
    }
}

// ======================= UTILITY ========================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= CLEANUP ========================

function cleanupRekapPerSiswa() {
    currentRekapPerSiswaData = null;
    currentSelectedStudent = null;
    console.log("🧹 Rekap per Siswa system cleaned up");
}

// ======================= EKSPOR KE GLOBAL ========================
window.initRekapPerSiswa = initRekapPerSiswa;
window.populateRekapPerSiswaSelect = populateRekapPerSiswaSelect;
window.loadRekapPerSiswa = loadRekapPerSiswa;
window.exportRekapPerSiswaToExcel = exportRekapPerSiswaToExcel;
window.exportRekapPerSiswaToPDF = exportRekapPerSiswaToPDF;
window.cleanupRekapPerSiswa = cleanupRekapPerSiswa;

console.log("✅ rekap-per-siswa.js V1.0 loaded");