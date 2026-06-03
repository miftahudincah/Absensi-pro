// staff-attendance.js - VERSION 1.1 (FIXED - With Role-Based Menu Visibility)
// Absensi Guru/Karyawan - Hanya untuk role Admin, Guru, Developer
// ============================================================================

let staffAttendanceDonutChart = null;
let staffAttendanceListener = null;
let staffAttendanceInitialized = false;

// ======================= CEK AKSES ========================

function canManageStaff() {
    if (!currentUser) return false;
    return (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer');
}

function isStaffAttendanceVisible() {
    if (!currentUser) return false;
    // Menu Absensi Staff hanya untuk Admin, Guru, dan Developer
    // SISWA TIDAK BISA MELIHAT MENU ABSENSI STAFF
    return (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer');
}

// ======================= RENDER TABEL ABSENSI STAFF ========================

function renderStaffAttendanceTable() {
    console.log("📊 renderStaffAttendanceTable dipanggil");
    
    // Jika user tidak berhak, jangan tampilkan
    if (!isStaffAttendanceVisible()) {
        console.log("🔒 Staff Attendance table hidden for role:", currentUser?.role);
        const tbody = document.getElementById('tbody-staff-attendance');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px;">
                🔒 Anda tidak memiliki akses ke halaman ini.
            <\/td><\/tr>`;
        }
        return;
    }
    
    let tbody = document.getElementById('tbody-staff-attendance');
    if (!tbody) {
        const tabStaffAttendance = document.getElementById('tab-staff-attendance');
        if (tabStaffAttendance) {
            const tableContainer = tabStaffAttendance.querySelector('.table-container');
            if (tableContainer) {
                let table = tableContainer.querySelector('table');
                if (!table) {
                    table = document.createElement('table');
                    table.style.width = '100%';
                    table.style.borderCollapse = 'collapse';
                    table.innerHTML = `
                        <thead>
                            <tr>
                                <th style="padding:12px;">Foto</th>
                                <th style="padding:12px;">Waktu</th>
                                <th style="padding:12px;">ID</th>
                                <th style="padding:12px;">Nama</th>
                                <th style="padding:12px;">Jabatan</th>
                                <th style="padding:12px;">Status</th>
                                <th style="padding:12px;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff-attendance"></tbody>
                    `;
                    tableContainer.appendChild(table);
                    console.log("✅ Created staff attendance table dynamically");
                }
                tbody = document.getElementById('tbody-staff-attendance');
            }
        }
    }
    
    if (!tbody) {
        console.error("❌ tbody-staff-attendance not found");
        return;
    }
    
    const filterDate = document.getElementById('filterStaffDate')?.value || 'today';
    const todayStr = new Date().toISOString().split('T')[0];
    let targetDate = filterDate === 'today' ? todayStr : filterDate;
    
    // Tampilkan loading
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px;">
        <div style="display:inline-block; width:30px; height:30px; border:3px solid var(--border); border-top-color:#00bcd4; border-radius:50%; animation: spin 1s linear infinite;"></div>
        <div style="margin-top:10px;">⏳ Memuat data absensi staff...</div>
    <\/td><\/tr>`;
    
    firebase.database().ref(`staff_attendance/${targetDate}`).once('value', (snapshot) => {
        const data = snapshot.val();
        const attendanceList = [];
        
        if (data) {
            Object.keys(data).forEach(key => {
                attendanceList.push({ id: key, ...data[key] });
            });
        }
        
        attendanceList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        if (attendanceList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px;">
                📭 Belum ada data absensi staff pada tanggal ${targetDate}
                <br><br>
                <small>💡 Klik tombol "Absen Masuk Staff" untuk menambahkan absensi.</small>
            <\/td><\/tr>`;
            updateStaffAttendanceStats(attendanceList, targetDate);
            return;
        }
        
        const canDelete = canManageStaff();
        tbody.innerHTML = '';
        
        for (const row of attendanceList) {
            const photoUrl = getStaffPhotoUrlForAttendance(row.staffId, row.nama);
            const initial = row.nama ? row.nama.charAt(0).toUpperCase() : 'G';
            const timeDisplay = row.timeIn || '-';
            const isLate = row.timeIn && row.timeIn > '07:30';
            
            let statusHtml = '';
            if (row.status === 'pulang') {
                statusHtml = `<span style="color:#f44336; font-weight:500;">🏠 Pulang (${row.timeOut || '-'})</span>`;
            } else if (isLate) {
                statusHtml = `<span style="color:#ff9800; font-weight:500;">⏰ Terlambat (${row.timeIn})</span>`;
            } else {
                statusHtml = `<span style="color:#4caf50; font-weight:500;">✅ Hadir (${row.timeIn})</span>`;
            }
            
            let actionButtons = '';
            if (canDelete) {
                actionButtons = `<button onclick="deleteStaffAttendance('${targetDate}', '${row.staffId}')" title="Hapus" style="background:#f44336; border:none; border-radius:8px; padding:5px 10px; cursor:pointer; color:white;">🗑️</button>`;
            } else {
                actionButtons = '-';
            }
            
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="text-align:center; padding:8px;">
                        <img src="${photoUrl}" 
                             style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;"
                             onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff&size=100&bold=true'"
                             onclick="showStaffPhotoModalForAttendance('${row.staffId}', '${escapeHtmlStaffAttendance(row.nama)}', this.src)">
                    <\/td>
                    <td style="padding:8px;">${escapeHtmlStaffAttendance(timeDisplay)}<br><small>${row.date || targetDate}</small><\/td>
                    <td style="padding:8px;"><strong>${escapeHtmlStaffAttendance(row.staffId)}</strong><\/td>
                    <td style="padding:8px;">${escapeHtmlStaffAttendance(row.nama)}<\/td>
                    <td style="padding:8px;">${escapeHtmlStaffAttendance(row.jabatan || '-')}<\/td>
                    <td style="padding:8px;">${statusHtml}<\/td>
                    <td style="padding:8px;">${actionButtons}<\/td>
                </tr>
            `;
        }
        
        updateStaffAttendanceStats(attendanceList, targetDate);
    }).catch(err => {
        console.error("Error loading staff attendance:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#f44336;">
            ❌ Gagal memuat data: ${err.message}<br>
            <button onclick="renderStaffAttendanceTable()" style="margin-top:10px; padding:8px 20px; border-radius:20px; border:none; background:#00bcd4; color:white; cursor:pointer;">🔄 Coba Lagi</button>
        <\/td><\/tr>`;
    });
}

function getStaffPhotoUrlForAttendance(staffId, staffName) {
    if (!staffId) {
        const initial = staffName ? staffName.charAt(0).toUpperCase() : 'G';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=ff9800&color=fff&size=100&bold=true`;
    }
    
    // Cek cache
    if (window.staffPhotoCache && window.staffPhotoCache.has(staffId)) {
        return window.staffPhotoCache.get(staffId);
    }
    
    let userAuth = null;
    if (window.dbData && window.dbData.users_auth) {
        userAuth = window.dbData.users_auth.find(u => u.staffId == staffId || u.uid == staffId);
        if (!userAuth) {
            userAuth = window.dbData.users_auth.find(u => u.email === staffId);
        }
    }
    
    let photoUrl;
    if (userAuth && userAuth.photoUrl && userAuth.photoUrl !== 'null' && userAuth.photoUrl !== 'undefined') {
        photoUrl = userAuth.photoUrl;
    } else {
        const initial = staffName ? staffName.charAt(0).toUpperCase() : 'G';
        photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=ff9800&color=fff&size=100&bold=true`;
    }
    
    // Simpan ke cache jika tersedia
    if (window.staffPhotoCache) {
        window.staffPhotoCache.set(staffId, photoUrl);
    }
    
    return photoUrl;
}

function updateStaffAttendanceStats(attendanceList, date) {
    let statsContainer = document.getElementById('staffAttendanceStats');
    if (!statsContainer) {
        const controlsBar = document.querySelector('#tab-staff-attendance .controls-bar');
        if (controlsBar) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'staffAttendanceStats';
            statsContainer.style.marginBottom = '15px';
            controlsBar.insertAdjacentElement('afterend', statsContainer);
        } else return;
    }
    
    const hadir = attendanceList.filter(a => a.status !== 'pulang').length;
    const sudahPulang = attendanceList.filter(a => a.status === 'pulang').length;
    const terlambat = attendanceList.filter(a => a.timeIn && a.timeIn > '07:30' && a.status !== 'pulang').length;
    
    statsContainer.innerHTML = `
        <div style="display:flex; gap:20px; flex-wrap:wrap; padding:12px; background:var(--bg-hover); border-radius:12px; margin-bottom:15px;">
            <div>✅ <strong style="color:#4caf50;">Hadir:</strong> ${hadir} orang</div>
            <div>🏠 <strong style="color:#f44336;">Sudah Pulang:</strong> ${sudahPulang} orang</div>
            <div>⏰ <strong style="color:#ff9800;">Terlambat:</strong> ${terlambat} orang</div>
            <div>📅 <strong>Tanggal:</strong> ${date}</div>
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
    firebase.database().ref('staff').once('value', (snapshot) => {
        const data = snapshot.val();
        currentStaffListForAttendance = [];
        
        if (data) {
            Object.keys(data).forEach(key => {
                currentStaffListForAttendance.push({ id: key, ...data[key] });
            });
        }
        
        // Juga ambil dari users_auth yang memiliki role guru
        if (window.dbData && window.dbData.users_auth) {
            const guruUsers = window.dbData.users_auth.filter(u => u.role === 'guru' || u.role === 'developer');
            guruUsers.forEach(user => {
                const existing = currentStaffListForAttendance.find(s => s.id === user.uid || s.id === user.staffId);
                if (!existing) {
                    currentStaffListForAttendance.push({
                        id: user.uid,
                        nama: user.nama || user.email?.split('@')[0] || 'Unknown',
                        jabatan: user.role === 'developer' ? 'Developer' : 'Guru',
                        email: user.email,
                        source: 'user_auth'
                    });
                }
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
            <div id="${modalId}" class="modal-overlay open" style="display:flex; align-items:center; justify-content:center; z-index:10000;">
                <div class="modal-box" style="max-width: 500px; background:var(--bg-card); border-radius:20px;">
                    <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                        <span>📷 Absen Masuk Staff</span>
                        <span onclick="closeModal('${modalId}')" style="cursor:pointer; font-size:24px;">✖</span>
                    </div>
                    <div style="padding: 20px;">
                        <div class="form-group">
                            <label>🔍 Cari Staff (Nama atau ID)</label>
                            <input type="text" id="simulateStaffSearchInput" placeholder="Ketik nama atau ID staff..." style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary); margin-bottom:10px;">
                            <div id="simulateStaffList" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 15px;">
                                <div style="padding: 10px; text-align:center; color:#888;">Ketik untuk mencari staff</div>
                            </div>
                            <input type="hidden" id="selectedStaffId" value="">
                            <input type="hidden" id="selectedStaffName" value="">
                            <input type="hidden" id="selectedStaffJabatan" value="">
                        </div>
                        <div id="simulateStaffWarning" class="text-small" style="color:#ff9800; margin-top: 5px;"></div>
                    </div>
                    <div class="modal-actions" style="padding:15px 20px; border-top:1px solid var(--border); display:flex; gap:10px; justify-content:flex-end;">
                        <button class="btn-cancel" onclick="closeModal('${modalId}')" style="padding:8px 20px; border-radius:20px; border:none; cursor:pointer;">Batal</button>
                        <button class="btn-save" onclick="executeSimulateStaffIn()" style="padding:8px 20px; border-radius:20px; border:none; background:#4caf50; color:white; cursor:pointer;">✅ Simpan Absen Masuk</button>
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
                staffListDiv.innerHTML = '<div style="padding: 10px; text-align:center; color:#888;">📭 Tidak ada staff yang cocok</div>';
                return;
            }
            let html = '';
            filtered.forEach(s => {
                html += `
                    <div class="staff-list-item" data-id="${s.id}" data-nama="${escapeHtmlStaffAttendance(s.nama)}" data-jabatan="${s.jabatan || ''}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                        <strong>${escapeHtmlStaffAttendance(s.id)}</strong> - ${escapeHtmlStaffAttendance(s.nama)} <span style="color: #888;">(${s.jabatan || '-'})</span>
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
                    staffListDiv.innerHTML = `<div style="padding: 10px; color: #4caf50;">✅ Dipilih: ${nama} (ID: ${id})</div>`;
                    checkExistingStaffAttendance(id);
                });
            });
        };
        
        const checkExistingStaffAttendance = (staffId) => {
            const todayStr = new Date().toISOString().split('T')[0];
            const warningSpan = document.getElementById('simulateStaffWarning');
            firebase.database().ref(`staff_attendance/${todayStr}/${staffId}`).once('value', (snapshot) => {
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
        
        await firebase.database().ref(`staff_attendance/${dateStr}/${staffId}`).set(attendanceData);
        
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
    
    firebase.database().ref(`staff_attendance/${todayStr}`).once('value', (snapshot) => {
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
            <div id="${modalId}" class="modal-overlay open" style="display:flex; align-items:center; justify-content:center; z-index:10000;">
                <div class="modal-box" style="max-width: 500px; background:var(--bg-card); border-radius:20px;">
                    <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                        <span>🏠 Absen Pulang Staff</span>
                        <span onclick="closeModal('${modalId}')" style="cursor:pointer; font-size:24px;">✖</span>
                    </div>
                    <div style="padding: 20px;">
                        <div class="form-group">
                            <label>🔍 Pilih Staff (yang sudah absen masuk)</label>
                            <input type="text" id="simulateStaffOutSearchInput" placeholder="Ketik nama atau ID staff..." style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary); margin-bottom:10px;">
                            <div id="simulateStaffOutList" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 15px;">
                                <div style="padding: 10px; text-align:center; color:#888;">Ketik untuk mencari staff</div>
                            </div>
                            <input type="hidden" id="selectedStaffOutId" value="">
                            <input type="hidden" id="selectedStaffOutName" value="">
                            <input type="hidden" id="selectedStaffOutTimeIn" value="">
                        </div>
                    </div>
                    <div class="modal-actions" style="padding:15px 20px; border-top:1px solid var(--border); display:flex; gap:10px; justify-content:flex-end;">
                        <button class="btn-cancel" onclick="closeModal('${modalId}')" style="padding:8px 20px; border-radius:20px; border:none; cursor:pointer;">Batal</button>
                        <button class="btn-save" onclick="executeSimulateStaffOut()" style="padding:8px 20px; border-radius:20px; border:none; background:#ff9800; color:white; cursor:pointer;">🏠 Simpan Pulang</button>
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
                staffListDiv.innerHTML = '<div style="padding: 10px; text-align:center; color:#888;">📭 Tidak ada staff yang cocok</div>';
                return;
            }
            let html = '';
            filtered.forEach(s => {
                html += `
                    <div class="staff-list-item" data-id="${s.staffId}" data-nama="${escapeHtmlStaffAttendance(s.nama)}" data-timein="${s.timeIn}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                        <strong>${escapeHtmlStaffAttendance(s.staffId)}</strong> - ${escapeHtmlStaffAttendance(s.nama)} <span style="color: #888;">Masuk: ${s.timeIn}</span>
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
                    staffListDiv.innerHTML = `<div style="padding: 10px; color: #4caf50;">✅ Dipilih: ${nama} (ID: ${id})</div>`;
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
        const currentAttendance = await firebase.database().ref(`staff_attendance/${todayStr}/${staffId}`).once('value');
        if (!currentAttendance.exists()) {
            showToast("❌ Data absensi tidak ditemukan untuk staff ini!", "error");
            return;
        }
        
        await firebase.database().ref(`staff_attendance/${todayStr}/${staffId}`).update({
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
        await firebase.database().ref(`staff_attendance/${date}/${staffId}`).remove();
        showToast("✅ Data absensi berhasil dihapus!", "success");
        
        if (typeof logActivity === 'function') {
            logActivity('delete_staff_attendance', `Hapus absensi staff ID: ${staffId} tanggal ${date}`);
        }
        
        renderStaffAttendanceTable();
    } catch (err) {
        showToast("❌ Gagal: " + err.message, "error");
    }
}

// ======================= MODAL FOTO ========================

function showStaffPhotoModalForAttendance(staffId, staffName, photoUrl) {
    const modalHtml = `
        <div id="modal-staff-photo-attendance" class="modal-overlay open" style="display:flex; align-items:center; justify-content:center; z-index:10000;">
            <div class="modal-box" style="max-width: 500px; text-align: center; background:var(--bg-card); border-radius:20px;">
                <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                    <span>📸 Foto ${escapeHtmlStaffAttendance(staffName)}</span>
                    <span onclick="closeModal('modal-staff-photo-attendance')" style="cursor:pointer; font-size:24px;">✖</span>
                </div>
                <div style="padding: 20px;">
                    <img src="${photoUrl}" style="max-width: 100%; max-height: 60vh; border-radius: 20px; object-fit: contain;">
                    <p style="margin-top: 15px;">
                        <strong>${escapeHtmlStaffAttendance(staffName)}</strong><br>
                        <span style="color: var(--text-muted);">ID: ${staffId}</span>
                    </p>
                </div>
                <div class="modal-actions" style="padding:15px 20px; border-top:1px solid var(--border);">
                    <button class="btn-cancel" onclick="closeModal('modal-staff-photo-attendance')" style="padding:8px 20px; border-radius:20px; border:none; cursor:pointer;">Tutup</button>
                </div>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('modal-staff-photo-attendance');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ======================= EXPORT EXCEL ========================

async function exportStaffAttendanceToExcel() {
    if (!isStaffAttendanceVisible()) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    const filterDate = document.getElementById('filterStaffDate')?.value || 'today';
    const todayStr = new Date().toISOString().split('T')[0];
    let targetDate = filterDate === 'today' ? todayStr : filterDate;
    
    const snapshot = await firebase.database().ref(`staff_attendance/${targetDate}`).once('value');
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

// ======================= INITIALIZATION ========================

function initStaffAttendance() {
    if (staffAttendanceInitialized) {
        console.log("📊 Staff Attendance system already initialized");
        return;
    }
    
    console.log("📊 Initializing Staff Attendance system...");
    
    // Tunggu currentUser
    if (!currentUser) {
        console.log("⏳ Waiting for currentUser...");
        setTimeout(initStaffAttendance, 500);
        return;
    }
    
    if (!isStaffAttendanceVisible()) {
        console.log("🔒 Staff Attendance: No access for role:", currentUser?.role);
        return;
    }
    
    addStaffAttendanceTab();
    setupStaffAttendanceListener();
    
    staffAttendanceInitialized = true;
}

function addStaffAttendanceTab() {
    // Hanya tambah tab jika user berhak
    if (!isStaffAttendanceVisible()) {
        console.log("🔒 Staff Attendance tab not added - user role:", currentUser?.role);
        return;
    }
    
    if (document.getElementById('tab-staff-attendance')) return;
    
    // Tambahkan tab button ke dropdown Menu Utama
    const dropdownMainContent = document.getElementById('dropdownMainContent');
    if (dropdownMainContent) {
        const existingBtn = Array.from(dropdownMainContent.children).find(btn => btn.innerHTML === '📋 Absensi Staff');
        if (!existingBtn) {
            const staffAttendanceBtn = document.createElement('button');
            staffAttendanceBtn.setAttribute('onclick', "switchTab('staff-attendance'); closeAllDropdowns()");
            staffAttendanceBtn.innerHTML = '📋 Absensi Staff';
            staffAttendanceBtn.className = 'role-admin role-guru role-developer';
            
            // Cari posisi setelah Absensi Siswa
            const attendanceBtn = Array.from(dropdownMainContent.children).find(btn => btn.textContent.includes('Absensi Siswa'));
            if (attendanceBtn && attendanceBtn.nextSibling) {
                dropdownMainContent.insertBefore(staffAttendanceBtn, attendanceBtn.nextSibling);
            } else {
                dropdownMainContent.appendChild(staffAttendanceBtn);
            }
            console.log("✅ Staff Attendance button added to dropdown");
        }
    }
    
    // Tambahkan tab content
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && !document.getElementById('tab-staff-attendance')) {
        const staffAttendanceTabHtml = `
            <div id="tab-staff-attendance" class="tab-content role-admin role-guru role-developer">
                <div class="info-banner" style="background: var(--bg-hover); padding: 12px 16px; border-radius: 12px; margin-bottom: 15px; border-left: 4px solid #00bcd4;">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <span style="font-size: 24px;">💡</span>
                        <div>
                            <strong>Info:</strong> Absensi untuk Guru dan Karyawan.
                            <ul style="margin: 5px 0 0 20px; font-size: 12px;">
                                <li>📷 <strong>Absen Masuk</strong> - Mencatat waktu kedatangan</li>
                                <li>🏠 <strong>Absen Pulang</strong> - Mencatat waktu kepulangan</li>
                                <li>📥 <strong>Export Excel</strong> - Download laporan absensi</li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="controls-bar">
                    <div class="filter-group">
                        <label>📅 Tanggal:</label>
                        <select id="filterStaffDate" onchange="renderStaffAttendanceTable()" style="padding:8px; border-radius:8px; border:1px solid var(--border); background:var(--bg-input); color:var(--text-primary);">
                            <option value="today">📆 Hari Ini</option>
                        </select>
                    </div>
                    <div style="margin-left:auto; display:flex; gap:10px;">
                        <button class="btn-action btn-primary" onclick="openSimulateStaffInModal()" style="background:#00bcd4; border:none; border-radius:8px; padding:8px 16px; color:white; cursor:pointer;">📷 Absen Masuk Staff</button>
                        <button class="btn-action btn-secondary" onclick="openSimulateStaffOutModal()" style="background:#ff9800; border:none; border-radius:8px; padding:8px 16px; color:white; cursor:pointer;">🏠 Absen Pulang Staff</button>
                        <button class="btn-action btn-success" onclick="exportStaffAttendanceToExcel()" style="background:#4caf50; border:none; border-radius:8px; padding:8px 16px; color:white; cursor:pointer;">📥 Export Excel</button>
                    </div>
                </div>
                <div class="table-container" style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-hover);">
                                <th style="padding:12px; text-align:left;">Foto</th>
                                <th style="padding:12px; text-align:left;">Waktu</th>
                                <th style="padding:12px; text-align:left;">ID</th>
                                <th style="padding:12px; text-align:left;">Nama</th>
                                <th style="padding:12px; text-align:left;">Jabatan</th>
                                <th style="padding:12px; text-align:left;">Status</th>
                                <th style="padding:12px; text-align:left;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff-attendance">
                            <tr><td colspan="7" style="text-align:center; padding:30px;">⏳ Memuat data...<\/td><\/tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        dashboardSection.insertAdjacentHTML('beforeend', staffAttendanceTabHtml);
        
        // Populate date options (7 hari terakhir)
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
        console.log("✅ Staff Attendance tab content added");
    }
}

function setupStaffAttendanceListener() {
    firebase.database().ref('staff_attendance').on('value', () => {
        if (document.getElementById('tab-staff-attendance')?.classList.contains('active') && isStaffAttendanceVisible()) {
            renderStaffAttendanceTable();
        }
    });
}

// Override switchTab
if (typeof window.switchTab === 'function') {
    const originalSwitchTabForStaffAtt = window.switchTab;
    window.switchTab = function(tabId) {
        originalSwitchTabForStaffAtt(tabId);
        if (tabId === 'staff-attendance' && isStaffAttendanceVisible()) {
            setTimeout(() => renderStaffAttendanceTable(), 200);
        }
    };
} else {
    window.switchTab = function(tabId) {
        if (tabId === 'staff-attendance' && isStaffAttendanceVisible()) {
            setTimeout(() => renderStaffAttendanceTable(), 200);
        }
    };
}

function escapeHtmlStaffAttendance(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// Tambahkan CSS animation untuk spinner jika belum ada
if (!document.querySelector('#staff-attendance-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'staff-attendance-spinner-style';
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
}

// Ekspor ke global
window.initStaffAttendance = initStaffAttendance;
window.renderStaffAttendanceTable = renderStaffAttendanceTable;
window.openSimulateStaffInModal = openSimulateStaffInModal;
window.openSimulateStaffOutModal = openSimulateStaffOutModal;
window.deleteStaffAttendance = deleteStaffAttendance;
window.exportStaffAttendanceToExcel = exportStaffAttendanceToExcel;
window.isStaffAttendanceVisible = isStaffAttendanceVisible;

console.log("✅ staff-attendance.js V1.1 loaded - With role-based menu visibility (Siswa cannot see Staff Attendance)");

// Auto-initialize when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initStaffAttendance, 1200);
    });
} else {
    setTimeout(initStaffAttendance, 1200);
}