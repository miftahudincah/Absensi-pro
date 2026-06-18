// staff-attendance-filter.js - VERSION 2.0
// Fitur Filter Periode Lengkap untuk Absensi Staff
// Mendukung: Hari Ini, Kemarin, Minggu Ini, Bulan Ini, Custom Range
// ============================================================================

let staffAttendanceDataCache = {};
let currentStaffPeriod = 'today';
let currentStaffStartDate = null;
let currentStaffEndDate = null;

// ======================= FUNGSI UTILITY PERIODE ========================

function getStaffDateRange(period, customStart = null, customEnd = null) {
    const now = new Date();
    let start = new Date();
    let end = new Date();
    let label = '';
    
    switch(period) {
        case 'today':
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            label = `Hari Ini (${formatStaffDateIndonesian(start)})`;
            break;
            
        case 'yesterday':
            start.setDate(now.getDate() - 1);
            start.setHours(0, 0, 0, 0);
            end.setDate(now.getDate() - 1);
            end.setHours(23, 59, 59, 999);
            label = `Kemarin (${formatStaffDateIndonesian(start)})`;
            break;
            
        case 'week':
            const day = now.getDay();
            const diffToMonday = (day === 0 ? 6 : day - 1);
            start.setDate(now.getDate() - diffToMonday);
            start.setHours(0, 0, 0, 0);
            end.setDate(start.getDate() + 6);
            end.setHours(23, 59, 59, 999);
            label = `Minggu Ini (${formatStaffDateIndonesian(start)} - ${formatStaffDateIndonesian(end)})`;
            break;
            
        case 'month':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            end.setHours(23, 59, 59, 999);
            label = `Bulan Ini (${formatStaffMonthYear(start)})`;
            break;
            
        case 'custom':
            if (customStart && customEnd) {
                start = new Date(customStart);
                end = new Date(customEnd);
                end.setHours(23, 59, 59, 999);
                label = `Custom (${formatStaffDateIndonesian(start)} - ${formatStaffDateIndonesian(end)})`;
            }
            break;
            
        default:
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            label = 'Hari Ini';
    }
    
    return { start, end, label };
}

function formatStaffDateIndonesian(date) {
    if (!date || !(date instanceof Date)) return '';
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatStaffMonthYear(date) {
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

// ======================= FILTER UI ========================

function filterStaffAttendance() {
    const periodSelect = document.getElementById('filterStaffPeriod');
    const customRangeGroup = document.getElementById('staffCustomRangeGroup');
    
    if (!periodSelect) return;
    
    const period = periodSelect.value;
    currentStaffPeriod = period;
    
    // Tampilkan/sembunyikan custom range
    if (customRangeGroup) {
        customRangeGroup.style.display = period === 'custom' ? 'flex' : 'none';
    }
    
    // Set default dates untuk custom range jika belum ada
    if (period === 'custom') {
        const startInput = document.getElementById('staffStartDate');
        const endInput = document.getElementById('staffEndDate');
        
        if (startInput && !startInput.value) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            startInput.value = thirtyDaysAgo.toISOString().split('T')[0];
        }
        if (endInput && !endInput.value) {
            const today = new Date();
            endInput.value = today.toISOString().split('T')[0];
        }
        
        applyStaffCustomRange();
    } else {
        loadStaffAttendanceByPeriod(period);
    }
}

function applyStaffCustomRange() {
    const startInput = document.getElementById('staffStartDate');
    const endInput = document.getElementById('staffEndDate');
    
    if (!startInput || !endInput) return;
    if (!startInput.value || !endInput.value) {
        if (window.showToast) window.showToast('Pilih tanggal mulai dan akhir!', 'error');
        return;
    }
    
    const startDate = new Date(startInput.value);
    const endDate = new Date(endInput.value);
    
    if (startDate > endDate) {
        if (window.showToast) window.showToast('Tanggal mulai harus lebih kecil dari tanggal akhir!', 'error');
        return;
    }
    
    loadStaffAttendanceByPeriod('custom', startInput.value, endInput.value);
}

// ======================= LOAD DATA STAFF ATTENDANCE ========================

async function loadStaffAttendanceByPeriod(period, customStart = null, customEnd = null) {
    console.log(`📊 Loading staff attendance for period: ${period}`);
    
    if (!window.firebase || !window.firebase.database) {
        console.log('⏳ Firebase not ready, retrying...');
        setTimeout(() => loadStaffAttendanceByPeriod(period, customStart, customEnd), 500);
        return;
    }
    
    const range = getStaffDateRange(period, customStart, customEnd);
    currentStaffStartDate = range.start;
    currentStaffEndDate = range.end;
    
    // Update judul periode di header jika ada
    const periodLabel = document.getElementById('staffPeriodLabel');
    if (periodLabel) periodLabel.textContent = range.label;
    
    // Tampilkan loading
    const tbody = document.getElementById('tbody-staff-attendance');
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px;">
            <div class="loading-spinner" style="display:inline-block; width:30px; height:30px; border:3px solid var(--border); border-top-color:#00bcd4; border-radius:50%; animation: spin 1s linear infinite;"></div>
            <div style="margin-top:12px;">⏳ Memuat data absensi staff untuk periode ${range.label}...</div>
        <\/td><\/tr>`;
    }
    
    try {
        // Ambil semua data absensi staff
        const snapshot = await window.firebase.database().ref('staff_attendance').once('value');
        const allData = snapshot.val() || {};
        
        // Filter berdasarkan rentang tanggal
        const filteredData = {};
        let totalHadir = 0;
        let uniqueStaff = new Set();
        let daysWithAttendance = new Set();
        
        for (const [dateStr, dailyData] of Object.entries(allData)) {
            const recordDate = new Date(dateStr);
            if (recordDate >= range.start && recordDate <= range.end) {
                filteredData[dateStr] = dailyData;
                daysWithAttendance.add(dateStr);
                
                // Hitung statistik
                if (dailyData) {
                    Object.values(dailyData).forEach(record => {
                        if (record.staffId) uniqueStaff.add(record.staffId);
                        if (record.status === 'hadir' || record.status === 'pulang') {
                            totalHadir++;
                        } else if (record.timeIn) {
                            totalHadir++;
                        }
                    });
                }
            }
        }
        
        // Konversi ke array untuk sorting
        const sortedDates = Object.keys(filteredData).sort();
        const attendanceList = [];
        
        for (const dateStr of sortedDates) {
            const dailyData = filteredData[dateStr];
            if (dailyData) {
                for (const [staffId, record] of Object.entries(dailyData)) {
                    attendanceList.push({
                        id: `${dateStr}_${staffId}`,
                        date: dateStr,
                        staffId: staffId,
                        ...record
                    });
                }
            }
        }
        
        // Sort by date descending
        attendanceList.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        // Update statistik
        updateStaffAttendanceStats(attendanceList, uniqueStaff.size, daysWithAttendance.size);
        
        // Render tabel
        renderStaffAttendanceTableFiltered(attendanceList);
        
    } catch (error) {
        console.error('Error loading staff attendance:', error);
        const tbody = document.getElementById('tbody-staff-attendance');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:#f44336;">
                ❌ Gagal memuat data: ${error.message}
            <\/td><\/tr>`;
        }
    }
}

function updateStaffAttendanceStats(attendanceList, totalStaff, totalDays) {
    const totalHadir = attendanceList.filter(a => a.status === 'hadir' || a.status === 'pulang' || a.timeIn).length;
    const avgAttendance = totalStaff > 0 ? ((totalHadir / (totalStaff * totalDays)) * 100).toFixed(1) : 0;
    
    const hadirSpan = document.getElementById('staffTotalHadir');
    const daysSpan = document.getElementById('staffTotalDays');
    const avgSpan = document.getElementById('staffAvgAttendance');
    const staffSpan = document.getElementById('staffTotalStaff');
    
    if (hadirSpan) hadirSpan.textContent = totalHadir;
    if (daysSpan) daysSpan.textContent = totalDays;
    if (avgSpan) avgSpan.textContent = `${avgAttendance}%`;
    if (staffSpan) staffSpan.textContent = totalStaff;
}

function renderStaffAttendanceTableFiltered(attendanceList) {
    const tbody = document.getElementById('tbody-staff-attendance');
    if (!tbody) return;
    
    if (attendanceList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px;">
            📭 Tidak ada data absensi staff pada periode yang dipilih.
        <\/td><\/tr>`;
        return;
    }
    
    const canDelete = window.canDeleteStaffAttendance ? window.canDeleteStaffAttendance() : false;
    const isStaffTU = window.currentUser?.role === 'staff_tu';
    const canManageWhatsApp = window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'developer');
    
    tbody.innerHTML = '';
    
    for (const row of attendanceList) {
        const photoUrl = getStaffPhotoUrlFilter(row.staffId, row.nama);
        const initial = row.nama ? row.nama.charAt(0).toUpperCase() : 'G';
        
        // Format status
        let statusHtml = '';
        if (row.status === 'pulang') {
            statusHtml = `<span style="color:#f44336;">🏠 Pulang (${row.timeOut || '-'})</span>`;
        } else if (row.timeIn) {
            statusHtml = `<span style="color:#4caf50;">✅ ${row.timeIn}</span>`;
        } else {
            statusHtml = `<span style="color:#888;">⏳ Belum absen</span>`;
        }
        
        // Tombol aksi
        let actionButtons = '';
        if (canDelete) {
            actionButtons = `<button onclick="window.deleteStaffAttendance('${row.date}', '${row.staffId}')" style="background:#f44336; border:none; border-radius:8px; padding:5px 10px; cursor:pointer; color:white; margin-right:5px;" title="Hapus">🗑️</button>`;
        }
        if (canManageWhatsApp) {
            actionButtons += `<button onclick="window.openStaffContactModal('${row.staffId}', '${escapeHtmlStaff(row.nama)}')" style="background:#25D366; border:none; border-radius:8px; padding:5px 10px; cursor:pointer; color:white;" title="Set WhatsApp">📱</button>`;
        }
        if (!actionButtons) {
            actionButtons = isStaffTU ? '<span style="color:#888;">🔒 Read only</span>' : '-';
        }
        
        tbody.innerHTML += `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding:12px;">
                    <img src="${photoUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" 
                         onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff'"
                         onclick="showStaffPhotoModal('${row.staffId}', '${escapeHtmlStaff(row.nama)}', this.src)"
                         style="cursor:pointer;">
                </td>
                <td style="padding:12px;">${formatIndonesianDateShort(row.date)}</td>
                <td style="padding:12px;">${row.timeIn || '-'}</td>
                <td style="padding:12px;">${row.timeOut || '-'}</td>
                <td style="padding:12px;"><strong>${escapeHtmlStaff(row.staffId)}</strong></td>
                <td style="padding:12px;">${escapeHtmlStaff(row.nama)}</td>
                <td style="padding:12px;">${escapeHtmlStaff(row.jabatan || '-')}</td>
                <td style="padding:12px;">${statusHtml}</td>
                <td style="padding:12px;">${actionButtons}</td>
            </table>
        `;
    }
}

function getStaffPhotoUrlFilter(staffId, staffName) {
    if (!staffId) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(staffName?.charAt(0) || 'G')}&background=ff9800&color=fff`;
    }
    
    // Cek di user auth untuk foto
    if (window.dbData && window.dbData.users_auth) {
        const userAuth = window.dbData.users_auth.find(u => u.staffId == staffId || u.uid == staffId);
        if (userAuth && userAuth.photoUrl && userAuth.photoUrl !== 'null') {
            return userAuth.photoUrl;
        }
    }
    
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(staffName?.charAt(0) || 'G')}&background=ff9800&color=fff`;
}

function escapeHtmlStaff(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= OVERRIDE FUNGSI LAMA ========================

// Override renderStaffAttendanceTable yang lama
const originalRenderStaffAttendanceTable = window.renderStaffAttendanceTable;
if (originalRenderStaffAttendanceTable) {
    window.renderStaffAttendanceTable = function() {
        // Gunakan filter yang sudah dipilih
        const periodSelect = document.getElementById('filterStaffPeriod');
        if (periodSelect) {
            const period = periodSelect.value;
            if (period === 'custom') {
                const startInput = document.getElementById('staffStartDate');
                const endInput = document.getElementById('staffEndDate');
                if (startInput && endInput && startInput.value && endInput.value) {
                    loadStaffAttendanceByPeriod('custom', startInput.value, endInput.value);
                } else {
                    loadStaffAttendanceByPeriod('today');
                }
            } else {
                loadStaffAttendanceByPeriod(period);
            }
        } else {
            loadStaffAttendanceByPeriod('today');
        }
    };
}

// Override fungsi export untuk menggunakan data yang sudah difilter
const originalExportStaffAttendanceToExcel = window.exportStaffAttendanceToExcel;
if (originalExportStaffAttendanceToExcel) {
    window.exportStaffAttendanceToExcel = async function() {
        if (!window.currentUser || (window.currentUser.role !== 'admin' && window.currentUser.role !== 'developer')) {
            if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
            return;
        }
        
        // Ambil data dari tabel yang sudah dirender
        const rows = document.querySelectorAll('#tbody-staff-attendance tr');
        if (!rows.length || rows[0].textContent.includes('Tidak ada data')) {
            if (window.showToast) window.showToast("❌ Tidak ada data untuk diekspor!", "error");
            return;
        }
        
        const periodSelect = document.getElementById('filterStaffPeriod');
        const periodText = periodSelect ? periodSelect.options[periodSelect.selectedIndex]?.text : 'Absensi Staff';
        
        let csv = "\uFEFFTanggal,Waktu Masuk,Waktu Pulang,ID,Nama Staff,Jabatan,Status\n";
        
        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 8) {
                const tanggal = cells[1]?.textContent.trim() || '';
                const waktuMasuk = cells[2]?.textContent.trim() || '';
                const waktuPulang = cells[3]?.textContent.trim() || '';
                const id = cells[4]?.textContent.trim() || '';
                const nama = cells[5]?.textContent.trim() || '';
                const jabatan = cells[6]?.textContent.trim() || '';
                let status = cells[7]?.textContent.trim() || '';
                status = status.replace('✅', '').replace('🏠', '').trim();
                
                csv += `"${tanggal}","${waktuMasuk}","${waktuPulang}","${id}","${nama}","${jabatan}","${status}"\n`;
            }
        }
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `absensi_staff_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        
        if (window.showToast) window.showToast("📥 Laporan berhasil diunduh!", "success");
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('export_staff_attendance_excel', `Ekspor absensi staff periode ${periodText}`);
        }
    };
}

// Inisialisasi
function initStaffAttendanceFilter() {
    console.log("📊 Initializing Staff Attendance Filter...");
    
    // Setup event listener untuk filter period
    const periodSelect = document.getElementById('filterStaffPeriod');
    if (periodSelect) {
        // Hapus listener lama jika ada
        const newSelect = periodSelect.cloneNode(true);
        periodSelect.parentNode.replaceChild(newSelect, periodSelect);
        
        newSelect.addEventListener('change', function() {
            filterStaffAttendance();
        });
        
        // Set default ke today
        newSelect.value = 'today';
    }
    
    // Setup default dates untuk custom range
    const startInput = document.getElementById('staffStartDate');
    const endInput = document.getElementById('staffEndDate');
    
    if (startInput && !startInput.value) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        startInput.value = thirtyDaysAgo.toISOString().split('T')[0];
    }
    if (endInput && !endInput.value) {
        const today = new Date();
        endInput.value = today.toISOString().split('T')[0];
    }
    
    // Load data awal
    setTimeout(() => {
        loadStaffAttendanceByPeriod('today');
    }, 500);
}

// Ekspor ke global
window.filterStaffAttendance = filterStaffAttendance;
window.applyStaffCustomRange = applyStaffCustomRange;
window.loadStaffAttendanceByPeriod = loadStaffAttendanceByPeriod;
window.initStaffAttendanceFilter = initStaffAttendanceFilter;

console.log("✅ staff-attendance-filter.js loaded - Staff attendance with period filter ready!");