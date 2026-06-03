// staff-attendance.js - VERSION 1.0
// Absensi Guru/Karyawan
// ============================================================================

let staffAttendanceDonutChart = null;
let staffAttendanceListener = null;

// ======================= RENDER TABEL ABSENSI STAFF ========================

function renderStaffAttendanceTable() {
    console.log("📊 renderStaffAttendanceTable dipanggil");
    
    let tbody = document.getElementById('tbody-staff-attendance');
    if (!tbody) {
        const tabStaffAttendance = document.getElementById('tab-staff-attendance');
        if (tabStaffAttendance) {
            const tableContainer = tabStaffAttendance.querySelector('.table-container');
            if (tableContainer) {
                let table = tableContainer.querySelector('table');
                if (!table) {
                    table = document.createElement('table');
                    table.innerHTML = `
                        <thead>
                            <tr>
                                <th>Foto</th>
                                <th>Waktu</th>
                                <th>ID</th>
                                <th>Nama</th>
                                <th>Jabatan</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff-attendance"></tbody>
                    `;
                    tableContainer.appendChild(table);
                }
                tbody = document.getElementById('tbody-staff-attendance');
            }
        }
    }
    
    if (!tbody) return;
    
    const filterDate = document.getElementById('filterStaffDate')?.value || 'today';
    const todayStr = new Date().toISOString().split('T')[0];
    let targetDate = filterDate === 'today' ? todayStr : filterDate;
    
    db.ref(`staff_attendance/${targetDate}`).once('value', (snapshot) => {
        const data = snapshot.val();
        const attendanceList = [];
        
        if (data) {
            Object.keys(data).forEach(key => {
                attendanceList.push({ id: key, ...data[key] });
            });
        }
        
        attendanceList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        if (attendanceList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px;">📭 Belum ada data absensi staff pada tanggal ${targetDate}<\/td><\/tr>`;
            updateStaffAttendanceStats(attendanceList, targetDate);
            return;
        }
        
        const canDelete = canManageStaff();
        
        tbody.innerHTML = '';
        
        for (const row of attendanceList) {
            const photoUrl = getStaffPhotoUrl(row.staffId, row.nama);
            const initial = row.nama ? row.nama.charAt(0).toUpperCase() : 'G';
            const timeDisplay = row.timeIn || '-';
            const isLate = row.timeIn && row.timeIn > '07:30';
            
            let statusHtml = '';
            if (row.status === 'pulang') {
                statusHtml = `<span style="color:var(--danger); font-weight:500;">🏠 Pulang (${row.timeOut || '-'})</span>`;
            } else if (isLate) {
                statusHtml = `<span style="color:#ff9800; font-weight:500;">⏰ Terlambat (${row.timeIn})</span>`;
            } else {
                statusHtml = `<span style="color:var(--success); font-weight:500;">✅ Hadir (${row.timeIn})</span>`;
            }
            
            let actionButtons = '';
            if (canDelete) {
                actionButtons = `<button class="btn-icon delete" onclick="deleteStaffAttendance('${targetDate}', '${row.staffId}')" title="Hapus">🗑️</button>`;
            }
            
            tbody.innerHTML += `
                <tr>
                    <td style="text-align:center;">
                        <img src="${photoUrl}" 
                             style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;"
                             onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff&size=100&bold=true'"
                             onclick="showStaffPhotoModal('${row.staffId}', '${escapeHtmlStaff(row.nama)}', this.src)">
                    </td>
                    <td>${timeDisplay}<br><small>${row.date || targetDate}</small></td>
                    <td><strong>${row.staffId}</strong></td>
                    <td>${escapeHtmlStaff(row.nama)}</td>
                    <td>${row.jabatan || '-'}</td>
                    <td>${statusHtml}</td>
                    <td>${actionButtons}</td>
                </tr>
            `;
        }
        
        updateStaffAttendanceStats(attendanceList, targetDate);
    });
}

function updateStaffAttendanceStats(attendanceList, date) {
    let statsContainer = document.getElementById('staffAttendanceStats');
    if (!statsContainer) {
        const controlsBar = document.querySelector('#tab-staff-attendance .controls-bar');
        if (controlsBar) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'staffAttendanceStats';
            statsContainer.style.marginBottom = '10px';
            controlsBar.insertAdjacentElement('afterend', statsContainer);
        } else return;
    }
    
    const hadir = attendanceList.filter(a => a.status !== 'pulang').length;
    const sudahPulang = attendanceList.filter(a => a.status === 'pulang').length;
    
    statsContainer.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;padding:10px;background:var(--bg-hover);border-radius:8px;margin-bottom:15px;">
            <div><span style="color:#4caf50;">✅ Hadir:</span> <strong>${hadir}</strong> orang</div>
            <div><span style="color:#f44336;">🏠 Sudah Pulang:</span> <strong>${sudahPulang}</strong> orang</div>
            <div><span style="color:#ff9800;">📅 Tanggal:</span> <strong>${date}</strong></div>
        </div>
    `;
}

// ======================= SIMULASI ABSEN STAFF ========================

let currentStaffListForAttendance = [];

function openSimulateStaffInModal() {
    if (!canManageStaff()) {
        showToast("⛔ Hanya Admin, Guru, dan Developer yang dapat mensimulasikan absen staff!", "error");
        return;
    }
    
    // Ambil data staff dari database
    db.ref('staff').once('value', (snapshot) => {
        const data = snapshot.val();
        currentStaffListForAttendance = [];
        
        if (data) {
            Object.keys(data).forEach(key => {
                currentStaffListForAttendance.push({ id: key, ...data[key] });
            });
        }
        
        if (currentStaffListForAttendance.length === 0) {
            showToast("❌ Belum ada data staff! Silakan tambah staff terlebih dahulu.", "error");
            return;
        }
        
        const modalId = 'modal-simulate-staff-in';
        let existingModal = document.getElementById(modalId);
        if (existingModal) existingModal.remove();
        
        const modalHtml = `
            <div id="${modalId}" class="modal-overlay open">
                <div class="modal-box" style="max-width: 500px;">
                    <div class="modal-title">
                        <span>📷 Absen Masuk Staff</span>
                        <span onclick="closeModal('${modalId}')">✖</span>
                    </div>
                    <div style="padding: 20px;">
                        <div class="form-group">
                            <label>🔍 Cari Staff (Nama atau ID)</label>
                            <input type="text" id="simulateStaffSearchInput" class="form-control" placeholder="Ketik nama atau ID staff..." style="width:100%; padding:10px; margin-bottom:10px;">
                            <div id="simulateStaffList" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 15px;">
                                <div class="staff-list-item" style="padding: 10px; text-align:center; color:#888;">Ketik untuk mencari staff</div>
                            </div>
                            <input type="hidden" id="selectedStaffId" value="">
                            <input type="hidden" id="selectedStaffName" value="">
                            <input type="hidden" id="selectedStaffJabatan" value="">
                        </div>
                        <div id="simulateStaffWarning" class="text-small" style="color:#ff9800; margin-top: 5px;"></div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn-cancel" onclick="closeModal('${modalId}')">Batal</button>
                        <button class="btn-save" onclick="executeSimulateStaffIn()">✅ Simpan Absen Masuk</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const searchInput = document.getElementById('simulateStaffSearchInput');
        const staffListDiv = document.getElementById('simulateStaffList');
        
        const renderStaffList = (filterText = '') => {
            const filtered = currentStaffListForAttendance.filter(s => 
                s.nama && (s.nama.toLowerCase().includes(filterText.toLowerCase()) || 
                           s.id.toString().includes(filterText))
            );
            if (filtered.length === 0) {
                staffListDiv.innerHTML = '<div class="staff-list-item" style="padding: 10px; text-align:center; color:#888;">📭 Tidak ada staff yang cocok</div>';
                return;
            }
            let html = '';
            filtered.forEach(s => {
                html += `
                    <div class="staff-list-item" data-id="${s.id}" data-nama="${escapeHtml(s.nama)}" data-jabatan="${s.jabatan || ''}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                        <strong>${s.id}</strong> - ${escapeHtml(s.nama)} <span style="color: #888;">(${s.jabatan || '-'})</span>
                    </div>
                `;
            });
            staffListDiv.innerHTML = html;
            document.querySelectorAll('#simulateStaffList .staff-list-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.getAttribute('data-id');
                    const nama = el.getAttribute('data-nama');
                    const jabatan = el.getAttribute('data-jabatan');
                    document.getElementById('selectedStaffId').value = id;
                    document.getElementById('selectedStaffName').value = nama;
                    document.getElementById('selectedStaffJabatan').value = jabatan;
                    searchInput.value = `${id} - ${nama}`;
                    staffListDiv.innerHTML = `<div class="staff-list-item" style="padding: 10px; color: #4caf50;">✅ Dipilih: ${nama} (ID: ${id})</div>`;
                    checkExistingStaffAttendance(id);
                });
            });
        };
        
        const checkExistingStaffAttendance = (staffId) => {
            const todayStr = new Date().toISOString().split('T')[0];
            const warningSpan = document.getElementById('simulateStaffWarning');
            db.ref(`staff_attendance/${todayStr}/${staffId}`).once('value', (snapshot) => {
                const existing = snapshot.val();
                if (existing && existing.status !== 'pulang') {
                    warningSpan.innerHTML = `⚠️ Staff ini sudah absen masuk hari ini pukul ${existing.timeIn}. Jika tetap disimpan, akan mengganti data sebelumnya.`;
                    warningSpan.style.color = '#f44336';
                } else {
                    warningSpan.innerHTML = '';
                }
            });
        };
        
        searchInput.addEventListener('input', (e) => renderStaffList(e.target.value));
        renderStaffList('');
    });
}

async function executeSimulateStaffIn() {
    const staffId = document.getElementById('selectedStaffId').value;
    const nama = document.getElementById('selectedStaffName').value;
    const jabatan = document.getElementById('selectedStaffJabatan').value;
    
    if (!staffId || !nama) {
        showToast("❌ Pilih staff terlebih dahulu!", "error");
        return;
    }
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    const dateStr = now.toISOString().split('T')[0];
    
    const btn = document.querySelector('#modal-simulate-staff-in .btn-save');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Memproses...'; }
    
    try {
        const attendanceData = {
            staffId: staffId,
            nama: nama,
            jabatan: jabatan,
            timeIn: timeStr,
            timeOut: null,
            status: 'hadir',
            date: dateStr,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        await db.ref(`staff_attendance/${dateStr}/${staffId}`).set(attendanceData);
        
        showToast(`✅ Absen masuk berhasil untuk ${nama} (${timeStr})`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('simulate_staff_attendance_in', `Absen masuk staff: ${nama} (ID: ${staffId}) - Waktu: ${timeStr}`);
        }
        
        closeModal('modal-simulate-staff-in');
        renderStaffAttendanceTable();
        
    } catch (err) {
        showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

// ======================= ABSEN PULANG STAFF ========================

let currentStaffListForOut = [];

function openSimulateStaffOutModal() {
    if (!canManageStaff()) {
        showToast("⛔ Hanya Admin, Guru, dan Developer yang dapat mensimulasikan pulang staff!", "error");
        return;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    db.ref(`staff_attendance/${todayStr}`).once('value', (snapshot) => {
        const data = snapshot.val();
        currentStaffListForOut = [];
        
        if (data) {
            Object.keys(data).forEach(key => {
                const record = data[key];
                if (record && record.status !== 'pulang') {
                    currentStaffListForOut.push({ id: key, ...record });
                }
            });
        }
        
        if (currentStaffListForOut.length === 0) {
            showToast("⚠️ Tidak ada staff yang absen masuk hari ini!", "warning");
            return;
        }
        
        const modalId = 'modal-simulate-staff-out';
        let existingModal = document.getElementById(modalId);
        if (existingModal) existingModal.remove();
        
        const modalHtml = `
            <div id="${modalId}" class="modal-overlay open">
                <div class="modal-box" style="max-width: 500px;">
                    <div class="modal-title">
                        <span>🏠 Absen Pulang Staff</span>
                        <span onclick="closeModal('${modalId}')">✖</span>
                    </div>
                    <div style="padding: 20px;">
                        <div class="form-group">
                            <label>🔍 Pilih Staff (yang sudah absen masuk)</label>
                            <input type="text" id="simulateStaffOutSearchInput" class="form-control" placeholder="Ketik nama atau ID staff..." style="width:100%; padding:10px; margin-bottom:10px;">
                            <div id="simulateStaffOutList" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 15px;">
                                <div class="staff-list-item" style="padding: 10px; text-align:center; color:#888;">Ketik untuk mencari staff</div>
                            </div>
                            <input type="hidden" id="selectedStaffOutId" value="">
                            <input type="hidden" id="selectedStaffOutName" value="">
                            <input type="hidden" id="selectedStaffOutTimeIn" value="">
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn-cancel" onclick="closeModal('${modalId}')">Batal</button>
                        <button class="btn-save" onclick="executeSimulateStaffOut()">🏠 Simpan Pulang</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const searchInput = document.getElementById('simulateStaffOutSearchInput');
        const staffListDiv = document.getElementById('simulateStaffOutList');
        
        const renderStaffList = (filterText = '') => {
            const filtered = currentStaffListForOut.filter(s => 
                s.nama && (s.nama.toLowerCase().includes(filterText.toLowerCase()) || 
                           s.staffId?.toString().includes(filterText))
            );
            if (filtered.length === 0) {
                staffListDiv.innerHTML = '<div class="staff-list-item" style="padding: 10px; text-align:center; color:#888;">📭 Tidak ada staff yang cocok</div>';
                return;
            }
            let html = '';
            filtered.forEach(s => {
                html += `
                    <div class="staff-list-item" data-id="${s.staffId}" data-nama="${escapeHtml(s.nama)}" data-timein="${s.timeIn}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                        <strong>${s.staffId}</strong> - ${escapeHtml(s.nama)} <span style="color: #888;">Masuk: ${s.timeIn}</span>
                    </div>
                `;
            });
            staffListDiv.innerHTML = html;
            document.querySelectorAll('#simulateStaffOutList .staff-list-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.getAttribute('data-id');
                    const nama = el.getAttribute('data-nama');
                    const timeIn = el.getAttribute('data-timein');
                    document.getElementById('selectedStaffOutId').value = id;
                    document.getElementById('selectedStaffOutName').value = nama;
                    document.getElementById('selectedStaffOutTimeIn').value = timeIn;
                    searchInput.value = `${id} - ${nama}`;
                    staffListDiv.innerHTML = `<div class="staff-list-item" style="padding: 10px; color: #4caf50;">✅ Dipilih: ${nama} (ID: ${id})</div>`;
                });
            });
        };
        
        searchInput.addEventListener('input', (e) => renderStaffList(e.target.value));
        renderStaffList('');
    });
}

async function executeSimulateStaffOut() {
    const staffId = document.getElementById('selectedStaffOutId').value;
    const nama = document.getElementById('selectedStaffOutName').value;
    
    if (!staffId || !nama) {
        showToast("❌ Pilih staff terlebih dahulu!", "error");
        return;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeOutStr = now.toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    
    const btn = document.querySelector('#modal-simulate-staff-out .btn-save');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Memproses...'; }
    
    try {
        const currentAttendance = await db.ref(`staff_attendance/${todayStr}/${staffId}`).once('value');
        if (!currentAttendance.exists()) {
            showToast("❌ Data absensi tidak ditemukan untuk staff ini!", "error");
            return;
        }
        
        await db.ref(`staff_attendance/${todayStr}/${staffId}`).update({
            timeOut: timeOutStr,
            status: 'pulang',
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        showToast(`✅ ${nama} berhasil absen pulang pukul ${timeOutStr}`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('simulate_staff_attendance_out', `Absen pulang staff: ${nama} (ID: ${staffId}) - Waktu: ${timeOutStr}`);
        }
        
        closeModal('modal-simulate-staff-out');
        renderStaffAttendanceTable();
        
    } catch (err) {
        showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

// ======================= HAPUS ABSENSI STAFF ========================

async function deleteStaffAttendance(date, staffId) {
    if (!canManageStaff()) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    if (!confirm("⚠️ Hapus data absensi staff ini?")) return;
    
    try {
        await db.ref(`staff_attendance/${date}/${staffId}`).remove();
        showToast("✅ Data absensi berhasil dihapus!", "success");
        
        if (typeof logActivity === 'function') {
            logActivity('delete_staff_attendance', `Hapus absensi staff ID: ${staffId} tanggal ${date}`);
        }
        
        renderStaffAttendanceTable();
    } catch (err) {
        showToast("❌ Gagal: " + err.message, "error");
    }
}

// ======================= INITIALIZATION ========================

function initStaffAttendance() {
    console.log("📊 Initializing Staff Attendance system...");
    
    if (!canManageStaff()) {
        console.log("🔒 Staff Attendance: No access for role:", currentUser?.role);
        return;
    }
    
    addStaffAttendanceTab();
    setupStaffAttendanceListener();
}

function addStaffAttendanceTab() {
    if (document.getElementById('tab-staff-attendance')) return;
    
    // Tambahkan tab button ke dropdown Menu Utama
    const dropdownMainContent = document.getElementById('dropdownMainContent');
    if (dropdownMainContent) {
        const staffAttendanceBtn = document.createElement('button');
        staffAttendanceBtn.setAttribute('onclick', "switchTab('staff-attendance'); closeAllDropdowns()");
        staffAttendanceBtn.innerHTML = '📋 Absensi Staff';
        
        // Cari posisi setelah Absensi
        const attendanceBtn = Array.from(dropdownMainContent.children).find(btn => btn.textContent.includes('Absensi'));
        if (attendanceBtn && attendanceBtn.nextSibling) {
            dropdownMainContent.insertBefore(staffAttendanceBtn, attendanceBtn.nextSibling);
        } else {
            dropdownMainContent.appendChild(staffAttendanceBtn);
        }
    }
    
    // Tambahkan tab content
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && !document.getElementById('tab-staff-attendance')) {
        const staffAttendanceTabHtml = `
            <div id="tab-staff-attendance" class="tab-content role-admin role-guru role-developer">
                <div class="controls-bar">
                    <div class="filter-group">
                        <label>📅 Tanggal:</label>
                        <select id="filterStaffDate" onchange="renderStaffAttendanceTable()">
                            <option value="today">📆 Hari Ini</option>
                        </select>
                    </div>
                    <div style="margin-left:auto; display:flex; gap:10px;">
                        <button class="btn-action btn-primary" onclick="openSimulateStaffInModal()">📷 Absen Masuk Staff</button>
                        <button class="btn-action btn-secondary" onclick="openSimulateStaffOutModal()" style="background:#ff9800;">🏠 Absen Pulang Staff</button>
                        <button class="btn-action btn-success" onclick="exportStaffAttendanceToExcel()">📥 Export Excel</button>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Foto</th>
                                <th>Waktu</th>
                                <th>ID</th>
                                <th>Nama</th>
                                <th>Jabatan</th>
                                <th>Status</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff-attendance">
                            <tr><td colspan="7" style="text-align:center; padding:30px;">⏳ Memuat data...<\/td><\/tr>
                        </tbody>
                    没有人
                </div>
            </div>
        `;
        dashboardSection.insertAdjacentHTML('beforeend', staffAttendanceTabHtml);
        
        // Populate date options
        const dateSelect = document.getElementById('filterStaffDate');
        if (dateSelect) {
            for (let i = 1; i <= 7; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const dayName = date.toLocaleDateString('id-ID', { weekday: 'long' });
                dateSelect.innerHTML += `<option value="${dateStr}">${dayName}, ${dateStr}</option>`;
            }
        }
    }
}

function setupStaffAttendanceListener() {
    db.ref('staff_attendance').on('value', (snapshot) => {
        if (document.getElementById('tab-staff-attendance')?.classList.contains('active')) {
            renderStaffAttendanceTable();
        }
    });
}

// ======================= EXPORT EXCEL ========================

async function exportStaffAttendanceToExcel() {
    const filterDate = document.getElementById('filterStaffDate')?.value || 'today';
    const todayStr = new Date().toISOString().split('T')[0];
    let targetDate = filterDate === 'today' ? todayStr : filterDate;
    
    const snapshot = await db.ref(`staff_attendance/${targetDate}`).once('value');
    const data = snapshot.val();
    const attendanceList = [];
    
    if (data) {
        Object.keys(data).forEach(key => {
            attendanceList.push({ id: key, ...data[key] });
        });
    }
    
    if (attendanceList.length === 0) {
        showToast("❌ Tidak ada data untuk diekspor!", "error");
        return;
    }
    
    let csv = "\uFEFFID,Nama,Jabatan,Waktu Masuk,Waktu Pulang,Status,Tanggal\n";
    attendanceList.forEach(a => {
        csv += `"${a.staffId}","${a.nama}","${a.jabatan || '-'}","${a.timeIn || '-'}","${a.timeOut || '-'}","${a.status === 'pulang' ? 'Pulang' : 'Hadir'}","${targetDate}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `absensi_staff_${targetDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("📥 Laporan absensi staff berhasil diunduh!", "success");
    
    if (typeof logActivity === 'function') {
        logActivity('export_staff_attendance_excel', `Ekspor absensi staff tanggal ${targetDate} (${attendanceList.length} data)`);
    }
}

// Override switchTab
const originalSwitchTabForStaffAtt = window.switchTab;
if (originalSwitchTabForStaffAtt) {
    window.switchTab = function(tabId) {
        originalSwitchTabForStaffAtt(tabId);
        if (tabId === 'staff-attendance') {
            setTimeout(() => renderStaffAttendanceTable(), 100);
        }
    };
}

// Ekspor ke global
window.initStaffAttendance = initStaffAttendance;
window.renderStaffAttendanceTable = renderStaffAttendanceTable;
window.openSimulateStaffInModal = openSimulateStaffInModal;
window.openSimulateStaffOutModal = openSimulateStaffOutModal;
window.deleteStaffAttendance = deleteStaffAttendance;
window.exportStaffAttendanceToExcel = exportStaffAttendanceToExcel;

console.log("✅ staff-attendance.js V1.0 loaded - Absensi Guru/Karyawan");