// rekap.js - VERSION 3.4 (DUKUNGAN HARI LIBUR)
// Fitur Rekap Absensi per Siswa
// Mendukung periode: Minggu, Bulan, Semester, dan Custom Range
// Mendukung status: Hadir, Sakit, Izin, Alpha (termasuk manual dari attendance_status)
// PERUBAHAN V3.4:
//   - Menghitung total hari sekolah hanya hari kerja (Senin-Jumat) yang bukan libur
//   - Data absensi yang diproses hanya yang bukan hari libur
//   - Mengintegrasikan fungsi isHoliday dan filterAttendanceByHoliday dari setting.js
// ============================================================================

let currentRekapData = [];
let rekapInitDone = false;
let rekapPieChart = null;
let rekapBarChart = null;
let rekapDataReadyListenerAdded = false;
let rekapUiReadyListenerAdded = false;
let isLoadingRekap = false;

// ======================= FALLBACK JIKA FUNGSI DARI SETTING.JS BELUM ADA =======================
if (typeof isHoliday === 'undefined') {
    window.isHoliday = function(dateStr) { return false; };
    console.log("⚠️ rekap.js: Fungsi isHoliday tidak ditemukan, menggunakan fallback (tidak ada hari libur)");
}
if (typeof filterAttendanceByHoliday === 'undefined') {
    window.filterAttendanceByHoliday = function(arr) { return arr; };
    console.log("⚠️ rekap.js: Fungsi filterAttendanceByHoliday tidak ditemukan, menggunakan fallback");
}
if (typeof getHolidayCountInRange === 'undefined') {
    window.getHolidayCountInRange = function(startDate, endDate) { return 0; };
}

// ======================= EVENT LISTENER ========================

function setupRekapDataReadyListener() {
    if (rekapDataReadyListenerAdded) return;
    rekapDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for rekap module");

    window.addEventListener('dataReady', (e) => {
        console.log("📊 rekap.js: dataReady received, initializing rekap system");
        if (!rekapInitDone) {
            initRekap();
        } else {
            loadRekap();
        }
    });
}

function setupRekapUiReadyListener() {
    if (rekapUiReadyListenerAdded) return;
    rekapUiReadyListenerAdded = true;
    console.log("📡 Setting up uiReady event listener for rekap module");

    window.addEventListener('uiReady', () => {
        if (rekapInitDone) {
            if (document.getElementById('tab-rekap')?.classList.contains('active')) {
                loadRekap();
            }
        }
    });
}

// ======================= INISIALISASI =======================

function initRekap() {
    if (rekapInitDone) return;
    console.log("📊 Initializing rekap system...");
    
    const periodSelect = document.getElementById('rekapPeriod');
    if (!periodSelect) {
        console.log("⏳ Menunggu DOM ready untuk rekap...");
        setTimeout(initRekap, 500);
        return;
    }
    
    const newPeriodSelect = periodSelect.cloneNode(true);
    periodSelect.parentNode.replaceChild(newPeriodSelect, periodSelect);
    
    newPeriodSelect.addEventListener('change', function() {
        const customGroup = document.getElementById('customRangeGroup');
        if (customGroup) customGroup.style.display = this.value === 'custom' ? 'flex' : 'none';
        loadRekap();
    });
    
    const startInput = document.getElementById('rekapStartDate');
    const endInput = document.getElementById('rekapEndDate');
    if (startInput) {
        const newStart = startInput.cloneNode(true);
        startInput.parentNode.replaceChild(newStart, startInput);
        newStart.addEventListener('change', () => {
            if (newPeriodSelect.value === 'custom') loadRekap();
        });
    }
    if (endInput) {
        const newEnd = endInput.cloneNode(true);
        endInput.parentNode.replaceChild(newEnd, endInput);
        newEnd.addEventListener('change', () => {
            if (newPeriodSelect.value === 'custom') loadRekap();
        });
    }
    
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - 30);
    const startInputElem = document.getElementById('rekapStartDate');
    const endInputElem = document.getElementById('rekapEndDate');
    if (startInputElem && !startInputElem.value) startInputElem.value = formatDateForInput(startDate);
    if (endInputElem && !endInputElem.value) endInputElem.value = formatDateForInput(today);
    
    const defaultPeriod = localStorage.getItem('rekapLastPeriod') || 'minggu';
    newPeriodSelect.value = defaultPeriod;
    const customRangeGroup = document.getElementById('customRangeGroup');
    if (customRangeGroup) customRangeGroup.style.display = defaultPeriod === 'custom' ? 'flex' : 'none';
    
    rekapInitDone = true;
    setTimeout(() => loadRekap(), 100);
}

function formatDateForInput(date) {
    return date.toISOString().split('T')[0];
}

// ======================= PERIODE HELPER =======================

function getDateRange(period, startDate = null, endDate = null) {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    
    switch(period) {
        case 'minggu':
            const day = now.getDay();
            const diffToMonday = (day === 0 ? 6 : day - 1);
            start.setDate(now.getDate() - diffToMonday);
            start.setHours(0, 0, 0, 0);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
            break;
        case 'bulan':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            end.setHours(23, 59, 59, 999);
            break;
        case 'semester':
            const semester = now.getMonth() < 6 ? 1 : 2;
            if (semester === 1) {
                start = new Date(now.getFullYear(), 0, 1);
                end = new Date(now.getFullYear(), 5, 30);
            } else {
                start = new Date(now.getFullYear(), 6, 1);
                end = new Date(now.getFullYear(), 11, 31);
            }
            end.setHours(23, 59, 59, 999);
            break;
        case 'custom':
            if (startDate && endDate) {
                start = new Date(startDate);
                end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
            }
            break;
        default:
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date();
    }
    return { start, end };
}

function formatDateRangeDisplay(start, end) {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return `${start.toLocaleDateString('id-ID', options)} - ${end.toLocaleDateString('id-ID', options)}`;
}

function getCacheKey(period, startDate, endDate) {
    if (period === 'custom') {
        return `rekap_custom_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;
    }
    return `rekap_${period}_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}`;
}

// ======================= HITUNG TOTAL HARI SEKOLAH (KURANGI HARI LIBUR) =======================

function countSchoolDays(startDate, endDate) {
    let count = 0;
    let currentDate = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    while (currentDate <= end) {
        const dayOfWeek = currentDate.getDay();
        const dateStr = currentDate.toISOString().split('T')[0];
        // Hanya hitung jika hari kerja (Senin-Jumat) dan bukan hari libur
        if (dayOfWeek >= 1 && dayOfWeek <= 5 && !isHoliday(dateStr)) {
            count++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return count > 0 ? count : 1;
}

// ======================= AMBIL DATA MANUAL STATUS DALAM RENTANG (HANYA TANGGAL BUKAN LIBUR) =======================
async function fetchManualStatusForRange(startDate, endDate) {
    const manualData = {};
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    const datePromises = [];
    const dateStrings = [];
    
    // Kumpulkan semua tanggal yang BUKAN libur
    while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (!isHoliday(dateStr)) {
            dateStrings.push(dateStr);
            datePromises.push(db.ref(`attendance_status/${dateStr}`).once('value'));
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    if (datePromises.length === 0) return manualData;
    
    console.log(`📡 Fetching manual status for ${datePromises.length} non-holiday dates in parallel...`);
    
    const snapshots = await Promise.all(datePromises);
    snapshots.forEach((snapshot, idx) => {
        if (snapshot.exists()) {
            manualData[dateStrings[idx]] = snapshot.val();
        }
    });
    
    console.log(`✅ Loaded manual status for ${Object.keys(manualData).length} non-holiday dates`);
    return manualData;
}

// ======================= HITUNG REKAP PER SISWA (DENGAN MANUAL STATUS & LIBUR) =======================

async function calculateStudentRekap(attendanceData, studentsData, startDate, endDate) {
    const studentMap = new Map();
    
    // Filter absensi berdasarkan rentang dan hari libur
    let filteredAttendance = attendanceData.filter(a => {
        const recordDate = new Date(a.date);
        return recordDate >= startDate && recordDate <= endDate;
    });
    // Hapus data yang tanggalnya libur
    filteredAttendance = filterAttendanceByHoliday(filteredAttendance);
    
    const totalSchoolDays = countSchoolDays(startDate, endDate);
    const manualStatusMap = await fetchManualStatusForRange(startDate, endDate);
    
    console.log(`📊 Periode: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`);
    console.log(`📊 Total hari sekolah (setelah kurangi libur): ${totalSchoolDays}`);
    console.log(`📊 Total data absensi fisik setelah filter libur: ${filteredAttendance.length}`);
    console.log(`📊 Total data manual status (non-libur): ${Object.keys(manualStatusMap).length} tanggal`);
    
    studentsData.forEach(student => {
        if (student && student.id) {
            studentMap.set(student.id.toString(), {
                id: student.id,
                nama: student.nama || 'Tidak Diketahui',
                kelas: student.kelas || '-',
                jurusan: student.jurusan || '-',
                hadir: 0,
                sakit: 0,
                izin: 0,
                alpha: 0,
                totalDays: totalSchoolDays
            });
        }
    });
    
    // Proses data absensi fisik (sudah terfilter libur)
    filteredAttendance.forEach(record => {
        const studentId = record.studentId.toString();
        const studentData = studentMap.get(studentId);
        if (studentData) {
            let status = record.status || '';
            if (!status) status = record.timeOut ? 'Pulang' : 'Hadir';
            if (status === 'Hadir' || status === 'Pulang') studentData.hadir++;
            else if (status === 'Sakit') studentData.sakit++;
            else if (status === 'Izin') studentData.izin++;
            else if (status === 'Alpha') studentData.alpha++;
            else studentData.hadir++;
        }
    });
    
    // Proses manual status (hanya tanggal non-libur)
    for (const [dateStr, statuses] of Object.entries(manualStatusMap)) {
        // Pastikan tanggal masih dalam rentang (redundan, karena sudah difilter)
        const recordDate = new Date(dateStr);
        if (recordDate < startDate || recordDate > endDate) continue;
        if (isHoliday(dateStr)) continue; // safety, seharusnya sudah tidak ada
        
        for (const [studentId, statusInfo] of Object.entries(statuses)) {
            const studentData = studentMap.get(studentId);
            if (!studentData) continue;
            
            // Cek apakah sudah ada absensi fisik pada tanggal tersebut (hadir/pulang)
            const hasPhysical = filteredAttendance.some(a => a.date === dateStr && a.studentId == studentId && (a.status === 'Hadir' || a.status === 'Pulang'));
            if (hasPhysical) continue;
            
            const manualStatus = statusInfo.status;
            if (manualStatus === 'sakit') studentData.sakit++;
            else if (manualStatus === 'izin') studentData.izin++;
            else if (manualStatus === 'alpha') studentData.alpha++;
        }
    }
    
    const results = [];
    for (const [id, data] of studentMap) {
        const totalKehadiran = data.hadir;
        const percentage = (totalKehadiran / data.totalDays) * 100;
        let status = '', statusClass = '';
        if (percentage >= 90) { status = 'Sangat Baik'; statusClass = 'rekap-status-sangat-baik'; }
        else if (percentage >= 75) { status = 'Baik'; statusClass = 'rekap-status-baik'; }
        else if (percentage >= 60) { status = 'Cukup'; statusClass = 'rekap-status-cukup'; }
        else if (percentage >= 40) { status = 'Kurang'; statusClass = 'rekap-status-kurang'; }
        else { status = 'Buruk'; statusClass = 'rekap-status-buruk'; }
        results.push({ ...data, percentage: percentage.toFixed(1), status, statusClass });
    }
    results.sort((a, b) => parseFloat(b.percentage) - parseFloat(a.percentage));
    return results;
}

// ======================= RENDER REKAP TABLE =======================

function renderRekapTable(data) {
    let tbody = document.getElementById('rekapTbody');
    if (!tbody) {
        console.warn("⚠️ rekapTbody not found, attempting to create dynamically...");
        const tabRekap = document.getElementById('tab-rekap');
        if (tabRekap) {
            let table = tabRekap.querySelector('table');
            if (!table) {
                table = document.createElement('table');
                table.innerHTML = `
                    <thead>
                        <tr>
                            <th>No</th><th>ID FP</th><th>Nama</th><th>Kelas</th><th>Jurusan</th>
                            <th>Total Hari</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpha</th>
                            <th>Persentase</th><th>Status</th>
                        </tr>
                    </thead>
                `;
                tabRekap.querySelector('.table-container')?.appendChild(table);
            }
            tbody = table.querySelector('tbody');
            if (!tbody) {
                tbody = document.createElement('tbody');
                tbody.id = 'rekapTbody';
                table.appendChild(tbody);
            }
            console.log("✅ rekapTbody created dynamically");
        }
        if (!tbody) {
            console.error("❌ Failed to create rekapTbody");
            return;
        }
    }

    if (!data || data.length === 0) {
        let message = "📭 Tidak ada data siswa dalam periode yang dipilih.";
        if (typeof dbData !== 'undefined' && dbData.users && dbData.users.length === 0) {
            message = "⏳ Data siswa belum dimuat. Silakan tunggu atau refresh halaman.";
        } else if (typeof dbData !== 'undefined' && dbData.attendance && dbData.attendance.length === 0) {
            message = "📭 Belum ada catatan absensi sama sekali.";
        }
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:40px;">${message}<\/td><\/tr>`;
        updateRekapSummary([]);
        return;
    }
    
    const validData = data.filter(item => item.nama && item.nama !== 'Tidak Diketahui');
    if (validData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:40px;">📭 Tidak ada data absensi dalam periode yang dipilih.<\/td><\/tr>`;
        updateRekapSummary([]);
        return;
    }
    
    tbody.innerHTML = '';
    validData.forEach((item, index) => {
        let persenColor = '#4caf50';
        if (item.percentage < 75) persenColor = '#ffc107';
        if (item.percentage < 60) persenColor = '#ff9800';
        if (item.percentage < 40) persenColor = '#f44336';
        const tooltip = `${item.hadir} hadir dari ${item.totalDays} hari sekolah (setelah dikurangi libur)`;
        tbody.innerHTML += `
            <tr>
                <td>${index + 1}<\/td>
                <td><strong>#${item.id}<\/strong><\/td>
                <td>${escapeHtml(item.nama)}<\/td>
                <td>${item.kelas}<\/td>
                <td>${item.jurusan}<\/td>
                <td style="text-align:center;">${item.totalDays}<\/td>
                <td style="color:#4caf50; font-weight:bold; text-align:center;">${item.hadir}<\/td>
                <td style="color:#ff9800; text-align:center;">${item.sakit}<\/td>
                <td style="color:#2196f3; text-align:center;">${item.izin}<\/td>
                <td style="color:#f44336; text-align:center;">${item.alpha}<\/td>
                <td style="text-align:center;"><span class="rekap-percentage" style="color:${persenColor}; font-weight:bold; cursor:help;" title="${tooltip}">${item.percentage}%<\/span><\/td>
                <td style="text-align:center;"><span class="rekap-badge ${item.statusClass}">${item.status}<\/span><\/td>
            <\/tr>
        `;
    });
    updateRekapSummary(validData);
}

function updateRekapSummary(data) {
    let summaryContainer = document.getElementById('rekapSummary');
    if (!summaryContainer) {
        const container = document.querySelector('#tab-rekap .table-container');
        if (container && !document.getElementById('rekapSummary')) {
            const summaryDiv = document.createElement('div');
            summaryDiv.id = 'rekapSummary';
            summaryDiv.style.marginBottom = '15px';
            summaryDiv.style.padding = '10px';
            summaryDiv.style.background = '#1e1e1e';
            summaryDiv.style.borderRadius = '8px';
            container.insertAdjacentElement('beforebegin', summaryDiv);
            summaryContainer = summaryDiv;
        } else return;
    }
    
    if (!data || data.length === 0) {
        summaryContainer.innerHTML = '';
        return;
    }
    
    const totalSiswa = data.length;
    const totalHadir = data.reduce((sum, s) => sum + s.hadir, 0);
    const totalSakit = data.reduce((sum, s) => sum + s.sakit, 0);
    const totalIzin = data.reduce((sum, s) => sum + s.izin, 0);
    const totalAlpha = data.reduce((sum, s) => sum + s.alpha, 0);
    const rataRata = data.reduce((sum, s) => sum + parseFloat(s.percentage), 0) / totalSiswa || 0;
    const sangatBaik = data.filter(s => s.status === 'Sangat Baik').length;
    const baik = data.filter(s => s.status === 'Baik').length;
    const cukup = data.filter(s => s.status === 'Cukup').length;
    const kurang = data.filter(s => s.status === 'Kurang').length;
    const buruk = data.filter(s => s.status === 'Buruk').length;
    
    summaryContainer.innerHTML = `
        <div style="display: flex; gap: 20px; flex-wrap: wrap; justify-content: space-between;">
            <div style="display: flex; gap: 30px; flex-wrap: wrap;">
                <div><span style="color: #4a90e2;">👥 Total Siswa:</span> <strong>${totalSiswa}</strong><\/div>
                <div><span style="color: #4caf50;">✅ Total Hadir:</span> <strong>${totalHadir}</strong><\/div>
                <div><span style="color: #ff9800;">🤒 Total Sakit:</span> <strong>${totalSakit}</strong><\/div>
                <div><span style="color: #2196f3;">📝 Total Izin:</span> <strong>${totalIzin}</strong><\/div>
                <div><span style="color: #f44336;">❌ Total Alpha:</span> <strong>${totalAlpha}</strong><\/div>
                <div><span style="color: #4a90e2;">📊 Rata-rata:</span> <strong>${rataRata.toFixed(1)}%</strong><\/div>
            <\/div>
            <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                <span class="badge" style="background:#4caf50;">🏆 Sangat Baik: ${sangatBaik}<\/span>
                <span class="badge" style="background:#8bc34a; color:#333;">👍 Baik: ${baik}<\/span>
                <span class="badge" style="background:#ffc107; color:#333;">📊 Cukup: ${cukup}<\/span>
                <span class="badge" style="background:#ff9800;">⚠️ Kurang: ${kurang}<\/span>
                <span class="badge" style="background:#f44336;">❗ Buruk: ${buruk}<\/span>
            <\/div>
        <\/div>
    `;
}

// ======================= CHART FUNCTIONS =======================

function renderRekapCharts(data, startDate, endDate) {
    const totalHadir = data.reduce((sum, d) => sum + d.hadir, 0);
    const totalSakit = data.reduce((sum, d) => sum + d.sakit, 0);
    const totalIzin = data.reduce((sum, d) => sum + d.izin, 0);
    const totalAlpha = data.reduce((sum, d) => sum + d.alpha, 0);
    
    const pieCtx = document.getElementById('rekapPieChart')?.getContext('2d');
    if (pieCtx) {
        if (rekapPieChart) {
            try { rekapPieChart.destroy(); } catch(e) {}
            rekapPieChart = null;
        }
        rekapPieChart = new Chart(pieCtx, {
            type: 'pie',
            data: {
                labels: ['Hadir', 'Sakit', 'Izin', 'Alpha'],
                datasets: [{
                    data: [totalHadir, totalSakit, totalIzin, totalAlpha],
                    backgroundColor: ['#4caf50', '#ff9800', '#2196f3', '#f44336'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#fff' } },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} kali` } }
                }
            }
        });
    }
    
    // Bar chart berdasarkan tanggal (hanya non-libur)
    const attendanceByDate = {};
    let filteredAttendance = dbData.attendance.filter(a => {
        const recordDate = new Date(a.date);
        return recordDate >= startDate && recordDate <= endDate;
    });
    filteredAttendance = filterAttendanceByHoliday(filteredAttendance);
    filteredAttendance.forEach(a => {
        if (!attendanceByDate[a.date]) attendanceByDate[a.date] = 0;
        attendanceByDate[a.date]++;
    });
    const sortedDates = Object.keys(attendanceByDate).sort();
    const barCtx = document.getElementById('rekapBarChart')?.getContext('2d');
    if (barCtx) {
        if (rekapBarChart) {
            try { rekapBarChart.destroy(); } catch(e) {}
            rekapBarChart = null;
        }
        rekapBarChart = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: sortedDates.map(d => d.split('-').slice(2).join('-')),
                datasets: [{
                    label: 'Jumlah Absensi',
                    data: sortedDates.map(d => attendanceByDate[d]),
                    backgroundColor: '#00bcd4',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { labels: { color: '#fff' } },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.raw} transaksi` } }
                },
                scales: {
                    y: { beginAtZero: true, grid: { color: '#333' }, ticks: { color: '#ccc' } },
                    x: { ticks: { color: '#ccc', maxRotation: 45, autoSkip: true } }
                }
            }
        });
    }
}

// ======================= LOAD REKAP (DENGAN CACHING) =======================

async function loadRekap(retryCount = 0, forceRefresh = false) {
    const MAX_RETRY = 5;
    const RETRY_DELAY = 1000;

    if (isLoadingRekap) {
        console.log("⏳ Rekap sedang dimuat, skip duplicate call");
        return;
    }

    if (!dbData || !dbData.attendance || !dbData.users) {
        console.log("⏳ loadRekap: dbData belum siap, schedule ulang...");
        if (retryCount < MAX_RETRY) {
            setTimeout(() => loadRekap(retryCount + 1, forceRefresh), RETRY_DELAY);
        } else {
            const tbody = document.getElementById('rekapTbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:40px;">❌ Gagal memuat data rekap (database tidak siap).<\/td><\/tr>`;
            }
            if (typeof showToast === 'function') showToast("❌ Gagal memuat data rekap (database tidak siap)", "error");
        }
        return;
    }

    if (dbData.users.length === 0) {
        console.warn(`⚠️ loadRekap: dbData.users masih kosong (retry ${retryCount+1}/${MAX_RETRY})`);
        if (retryCount < MAX_RETRY) {
            setTimeout(() => loadRekap(retryCount + 1, forceRefresh), RETRY_DELAY);
            return;
        } else {
            const tbody = document.getElementById('rekapTbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:30px;">⏳ Data siswa belum dimuat. Silakan refresh halaman atau tunggu sebentar.<\/td><\/tr>`;
            }
            if (typeof showToast === 'function') showToast("⚠️ Data siswa belum tersedia, coba muat ulang halaman", "warning");
            return;
        }
    }

    const periodSelect = document.getElementById('rekapPeriod');
    if (!periodSelect) {
        setTimeout(() => loadRekap(retryCount, forceRefresh), 500);
        return;
    }

    const period = periodSelect.value;
    let startDate, endDate;
    if (period === 'custom') {
        const startInput = document.getElementById('rekapStartDate').value;
        const endInput = document.getElementById('rekapEndDate').value;
        if (!startInput || !endInput) {
            if (typeof showToast === 'function') showToast("⚠️ Pilih tanggal mulai dan akhir!", "error");
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
        if (typeof showToast === 'function') showToast("⚠️ Tanggal mulai harus lebih kecil dari tanggal akhir!", "error");
        return;
    }

    // Cek cache di sessionStorage
    const cacheKey = getCacheKey(period, startDate, endDate);
    if (!forceRefresh && sessionStorage.getItem(cacheKey)) {
        try {
            const cached = JSON.parse(sessionStorage.getItem(cacheKey));
            if (cached && cached.data && cached.data.length > 0) {
                console.log("📊 Load rekap from cache:", cacheKey);
                currentRekapData = cached.data;
                renderRekapTable(currentRekapData);
                renderRekapCharts(currentRekapData, startDate, endDate);
                const totalSiswa = currentRekapData.filter(s => s.nama && s.nama !== 'Tidak Diketahui').length;
                const rataRata = totalSiswa ? (currentRekapData.reduce((sum, s) => sum + parseFloat(s.percentage), 0) / totalSiswa) : 0;
                console.log(`📊 Rekap dari cache: ${totalSiswa} siswa, rata-rata: ${rataRata.toFixed(1)}%`);
                return;
            }
        } catch(e) {
            console.warn("Cache parsing error:", e);
            sessionStorage.removeItem(cacheKey);
        }
    }

    localStorage.setItem('rekapLastPeriod', period);
    const periodDisplay = formatDateRangeDisplay(startDate, endDate);
    console.log(`📊 Load rekap (fresh): ${period} (${periodDisplay})`);
    if (typeof showToast === 'function') showToast(`📊 Menghitung rekap periode: ${periodDisplay}...`, "info");

    isLoadingRekap = true;
    
    const tbody = document.getElementById('rekapTbody');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:40px;">⏳ Menghitung data rekap... (${periodDisplay})<\/td><\/tr>`;
    }

    try {
        currentRekapData = await calculateStudentRekap(dbData.attendance, dbData.users, startDate, endDate);
        
        try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ data: currentRekapData, timestamp: Date.now() }));
        } catch(e) { console.warn("Cache storage error:", e); }
        
        renderRekapTable(currentRekapData);
        renderRekapCharts(currentRekapData, startDate, endDate);

        const totalSiswa = currentRekapData.filter(s => s.nama && s.nama !== 'Tidak Diketahui').length;
        const rataRata = totalSiswa ? (currentRekapData.reduce((sum, s) => sum + parseFloat(s.percentage), 0) / totalSiswa) : 0;
        console.log(`📊 Rekap selesai: ${totalSiswa} siswa, rata-rata kehadiran: ${rataRata.toFixed(1)}%`);
        
        if (typeof showToast === 'function') showToast(`✅ Rekap selesai: ${totalSiswa} siswa, rata-rata ${rataRata.toFixed(1)}%`, "success");
    } catch (error) {
        console.error("Error calculating rekap:", error);
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:40px;">❌ Gagal menghitung rekap: ${error.message}<\/td><\/tr>`;
        }
        if (typeof showToast === 'function') showToast("❌ Gagal menghitung rekap: " + error.message, "error");
    } finally {
        isLoadingRekap = false;
    }
}

// ======================= EXPORT FUNCTIONS =======================

function exportRekapToExcel() {
    if (!currentRekapData || currentRekapData.length === 0) {
        if (typeof showToast === 'function') showToast("❌ Tidak ada data untuk diekspor!", "error");
        return;
    }
    const periodSelect = document.getElementById('rekapPeriod');
    const periodText = periodSelect ? periodSelect.options[periodSelect.selectedIndex]?.text : 'Rekap';
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sistem Absensi';
    const dateNow = new Date().toLocaleDateString('id-ID');
    let csv = "\uFEFF";
    csv += `"LAPORAN REKAP ABSENSI SISWA"\n"${schoolName}"\n"Periode: ${periodText}"\n"Tanggal cetak: ${dateNow}"\n\n`;
    csv += `No,ID FP,Nama Siswa,Kelas,Jurusan,Total Hari,Hadir,Sakit,Izin,Alpha,Persentase,Status\n`;
    let no = 1;
    currentRekapData.forEach(item => {
        if (item.nama && item.nama !== 'Tidak Diketahui') {
            csv += `${no},${item.id},"${item.nama}",${item.kelas},${item.jurusan},${item.totalDays},${item.hadir},${item.sakit},${item.izin},${item.alpha},${item.percentage}%,${item.status}\n`;
            no++;
        }
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `rekap_absensi_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast("📥 Rekap berhasil diekspor ke Excel!", "success");
}

function exportRekapToPDF() {
    if (!currentRekapData || currentRekapData.length === 0) {
        if (typeof showToast === 'function') showToast("❌ Tidak ada data untuk diekspor!", "error");
        return;
    }
    const periodSelect = document.getElementById('rekapPeriod');
    const periodText = periodSelect ? periodSelect.options[periodSelect.selectedIndex]?.text : 'Rekap';
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sistem Absensi';
    const dateNow = new Date().toLocaleDateString('id-ID');
    const timeNow = new Date().toLocaleTimeString('id-ID');
    const validData = currentRekapData.filter(item => item.nama && item.nama !== 'Tidak Diketahui');
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head><title>Rekap Absensi - ${schoolName}</title><meta charset="UTF-8">
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;background:white}
            .header{text-align:center;margin-bottom:20px;padding-bottom:10px;border-bottom:2px solid #00bcd4}
            .header h1{color:#00bcd4}
            .info{margin-bottom:20px;padding:10px;background:#f5f5f5;border-radius:8px;font-size:12px}
            table{width:100%;border-collapse:collapse;margin-top:10px;font-size:11px}
            th,td{border:1px solid #ddd;padding:8px 6px;text-align:center}
            th{background:#00bcd4;color:white}
            .text-left{text-align:left}
            .footer{text-align:center;margin-top:20px;padding-top:10px;font-size:10px;color:#888;border-top:1px solid #ddd}
            .badge-sangat-baik{background:#4caf50;color:white;padding:2px 8px;border-radius:12px;display:inline-block}
            .badge-baik{background:#8bc34a;color:#333;padding:2px 8px;border-radius:12px;display:inline-block}
            .badge-cukup{background:#ffc107;color:#333;padding:2px 8px;border-radius:12px;display:inline-block}
            .badge-kurang{background:#ff9800;color:white;padding:2px 8px;border-radius:12px;display:inline-block}
            .badge-buruk{background:#f44336;color:white;padding:2px 8px;border-radius:12px;display:inline-block}
            @media print{body{padding:0;margin:0}.no-print{display:none}}
        </style>
        </head>
        <body>
            <div class="header"><h1>${escapeHtml(schoolName)}</h1><h3>LAPORAN REKAP ABSENSI SISWA</h3><p>Periode: ${escapeHtml(periodText)}</p></div>
            <div class="info"><strong>📅 Tanggal Cetak:</strong> ${dateNow} | ${timeNow}<br><strong>👥 Total Siswa:</strong> ${validData.length} orang<br><strong>📊 Rata-rata Kehadiran:</strong> ${(validData.reduce((sum, s) => sum + parseFloat(s.percentage), 0) / validData.length || 0).toFixed(1)}%</div>
            <table><thead><tr><th>No</th><th>ID FP</th><th>Nama Siswa</th><th>Kelas</th><th>Jurusan</th><th>Total Hari</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpha</th><th>Persentase</th><th>Status</th></tr></thead><tbody>
    `);
    let no = 1;
    validData.forEach(item => {
        let badgeClass = '';
        if (item.status === 'Sangat Baik') badgeClass = 'badge-sangat-baik';
        else if (item.status === 'Baik') badgeClass = 'badge-baik';
        else if (item.status === 'Cukup') badgeClass = 'badge-cukup';
        else if (item.status === 'Kurang') badgeClass = 'badge-kurang';
        else badgeClass = 'badge-buruk';
        printWindow.document.write(`
            <tr>
                <td>${no}<\/td>
                <td>${item.id}<\/td>
                <td class="text-left">${escapeHtml(item.nama)}<\/td>
                <td>${item.kelas}<\/td>
                <td>${item.jurusan}<\/td>
                <td>${item.totalDays}<\/td>
                <td>${item.hadir}<\/td>
                <td>${item.sakit}<\/td>
                <td>${item.izin}<\/td>
                <td>${item.alpha}<\/td>
                <td>${item.percentage}%<\/td>
                <td><span class="${badgeClass}">${item.status}<\/span><\/td>
            <\/tr>
        `);
        no++;
    });
    printWindow.document.write(`
            </tbody>
        <\/table>
        <div class="footer"><p>Dicetak oleh: ${escapeHtml(currentUser?.nama || 'Admin')} | Sistem Absensi Terintegrasi - ESP32 Fingerprint</p><p>* Laporan ini dihasilkan secara otomatis oleh sistem</p></div>
        <div class="no-print" style="text-align:center; margin-top:20px;"><button onclick="window.print()" style="padding:10px 20px; background:#00bcd4; color:white; border:none; border-radius:5px; cursor:pointer;">🖨️ Cetak / Simpan PDF</button><button onclick="window.close()" style="padding:10px 20px; background:#666; color:white; border:none; border-radius:5px; cursor:pointer; margin-left:10px;">✖ Tutup</button></div>
        <script>console.log("PDF siap dicetak");<\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
    if (typeof showToast === 'function') showToast("📄 Membuka halaman print...", "info");
}

// ======================= UTILITY =======================

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function cleanupRekap() {
    rekapInitDone = false;
    currentRekapData = [];
    if (rekapPieChart) { 
        try { rekapPieChart.destroy(); } catch(e) {}
        rekapPieChart = null; 
    }
    if (rekapBarChart) { 
        try { rekapBarChart.destroy(); } catch(e) {}
        rekapBarChart = null; 
    }
    rekapDataReadyListenerAdded = false;
    rekapUiReadyListenerAdded = false;
    isLoadingRekap = false;
    console.log("🧹 Rekap system cleaned up");
}

// ======================= INISIALISASI EVENT LISTENER ========================
setupRekapDataReadyListener();
setupRekapUiReadyListener();

if (typeof window !== 'undefined' && window.dbData && window.dbData.attendance && window.dbData.users) {
    console.log("📊 rekap.js: Data already available, initializing rekap immediately");
    setTimeout(() => {
        if (!rekapInitDone) initRekap();
    }, 100);
}

// ======================= EKSPOR KE GLOBAL =======================
window.loadRekap = loadRekap;
window.exportRekapToExcel = exportRekapToExcel;
window.exportRekapToPDF = exportRekapToPDF;
window.initRekap = initRekap;
window.cleanupRekap = cleanupRekap;

console.log("✅ rekap.js V3.4 loaded - Dukungan hari libur untuk rekap absensi");