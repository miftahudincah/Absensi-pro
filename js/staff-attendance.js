// staff-attendance.js - VERSION 2.6 (FIXED: TAMPILKAN SEMUA DATA ABSENSI, TIDAK HANYA HARI INI)
// Absensi Guru/Karyawan dengan Notifikasi WhatsApp
// PERUBAHAN V2.6: 
//   - Memperbaiki filter tanggal: bisa pilih Semua Tanggal
//   - Menambahkan opsi "📅 Semua Tanggal" di dropdown filter
//   - Menambahkan opsi 7 hari terakhir
//   - Memperbaiki render tabel untuk menampilkan semua data
//   - Menambahkan statistik ringkasan
// ============================================================================

let staffAttendanceDonutChart = null;
let staffAttendanceListener = null;
let staffAttendanceInitialized = false;
let currentStaffListForAttendance = [];
let currentStaffListForOut = [];
let allStaffAttendanceData = []; // Cache untuk semua data absensi staff

// ======================= ROLE HELPER FUNCTIONS ========================

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

function canManageStaffAttendance() {
    if (!window.currentUser) return false;
    const manageRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
    return manageRoles.includes(window.currentUser.role);
}

function canViewStaffAttendance() {
    if (!window.currentUser) return false;
    const viewRoles = ['admin', 'developer', 'wakil_kepala', 'staff_tu', 'guru'];
    return viewRoles.includes(window.currentUser.role);
}

function canDeleteStaffAttendance() {
    if (!window.currentUser) return false;
    const deleteRoles = ['admin', 'developer'];
    return deleteRoles.includes(window.currentUser.role);
}

function isStaffAttendanceVisible() {
    if (!window.currentUser) return false;
    const visibleRoles = ['admin', 'developer', 'wakil_kepala', 'staff_tu', 'guru'];
    return visibleRoles.includes(window.currentUser.role);
}

// ======================= FUNGSI FOTO STAFF ========================

/**
 * Mendapatkan URL foto staff dengan timestamp untuk bypass cache
 */
function getStaffPhotoUrl(staffId, staffName) {
    const timestamp = Date.now();
    if (!staffId) {
        const initial = staffName ? staffName.charAt(0).toUpperCase() : 'G';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=ff9800&color=fff&size=100&bold=true&t=${timestamp}`;
    }
    
    // Cari dari users_auth untuk mendapatkan foto jika ada
    let photoUrl = null;
    if (window.dbData && window.dbData.users_auth) {
        const userAuth = window.dbData.users_auth.find(u => u.uid === staffId || u.staffId === staffId);
        if (userAuth && userAuth.photoUrl && userAuth.photoUrl !== 'null' && userAuth.photoUrl !== 'undefined') {
            const separator = userAuth.photoUrl.includes('?') ? '&' : '?';
            photoUrl = userAuth.photoUrl.split('?')[0] + separator + 't=' + timestamp;
        }
    }
    
    if (photoUrl) return photoUrl;
    
    const initial = staffName ? staffName.charAt(0).toUpperCase() : 'G';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=ff9800&color=fff&size=100&bold=true&t=${timestamp}`;
}

// ======================= NOTIFIKASI WHATSAPP UNTUK STAFF ========================

async function sendStaffWhatsAppNotification(staffId, staffName, type, time, date = null) {
    if (typeof window.WHATSAPP_CONFIG === 'undefined' || !window.WHATSAPP_CONFIG.enabled) {
        console.log('📱 WhatsApp notification disabled for staff');
        return;
    }
    
    if (type === 'check_in' && !window.WHATSAPP_CONFIG.sendOnCheckIn) return;
    if (type === 'check_out' && !window.WHATSAPP_CONFIG.sendOnCheckOut) return;
    
    try {
        let phoneNumber = null;
        
        const staffContactSnapshot = await db.ref(`staff_contacts/${staffId}`).once('value');
        const staffContactData = staffContactSnapshot.val();
        
        if (staffContactData && staffContactData.phoneNumber) {
            phoneNumber = staffContactData.phoneNumber;
        } else {
            const staffSnapshot = await db.ref(`staff/${staffId}`).once('value');
            const staffData = staffSnapshot.val();
            if (staffData && staffData.noHp) {
                phoneNumber = staffData.noHp;
            }
        }
        
        if (!phoneNumber && window.dbData && window.dbData.users_auth) {
            const userAuth = window.dbData.users_auth.find(u => u.uid === staffId || u.staffId === staffId);
            if (userAuth && userAuth.noHp) {
                phoneNumber = userAuth.noHp;
            }
        }
        
        if (!phoneNumber) {
            console.log(`📱 No WhatsApp number for staff ${staffName} (ID: ${staffId})`);
            return;
        }
        
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.startsWith('0')) formattedNumber = '62' + formattedNumber.substring(1);
        if (!formattedNumber.startsWith('62')) formattedNumber = '62' + formattedNumber;
        
        const today = date || new Date().toISOString().split('T')[0];
        const formattedDate = formatIndonesianDate(today);
        
        let title = '';
        let message = '';
        
        switch(type) {
            case 'check_in':
                title = '✅ Absen Masuk Staff';
                message = `*${staffName}* telah absen masuk pada pukul *${time}*.\n\n📅 Tanggal: ${formattedDate}\n\nSelamat bekerja! 👨‍🏫✨`;
                break;
            case 'check_out':
                title = '🏠 Absen Pulang Staff';
                message = `*${staffName}* telah absen pulang pada pukul *${time}*.\n\n📅 Tanggal: ${formattedDate}\n\nSemoga sampai rumah dengan selamat. 🏡`;
                break;
        }
        
        if (typeof sendViaFonnte === 'function') {
            const fullMessage = `*📢 SISTEM ABSENSI SEKOLAH*\n\n*${title}*\n\n${message}\n\n---\n📱 Sistem Absensi IoT - Real-time`;
            const result = await sendViaFonnte(formattedNumber, fullMessage);
            if (result) {
                console.log(`📱 WhatsApp sent to staff ${staffName}: ${type}`);
                await db.ref(`staff_notifications_log/${staffId}/${Date.now()}`).set({
                    type: type,
                    phoneNumber: formattedNumber,
                    time: time,
                    date: today,
                    sentAt: firebase.database.ServerValue.TIMESTAMP
                });
            }
        }
        
    } catch (error) {
        console.error('Send staff notification error:', error);
    }
}

function formatIndonesianDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parts[2]} ${bulan[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

async function saveStaffContact(staffId, staffName, phoneNumber, relation = 'staff') {
    if (!window.currentUser || (window.currentUser.role !== 'admin' && window.currentUser.role !== 'developer')) {
        if (window.showToast) window.showToast('⛔ Hanya Admin dan Developer yang dapat mengedit kontak staff!', 'error');
        return false;
    }
    
    let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
    if (formattedNumber.startsWith('0')) formattedNumber = '62' + formattedNumber.substring(1);
    if (!formattedNumber.startsWith('62')) formattedNumber = '62' + formattedNumber;
    
    try {
        await db.ref(`staff_contacts/${staffId}`).set({
            staffId: staffId,
            staffName: staffName,
            phoneNumber: formattedNumber,
            rawNumber: phoneNumber,
            relation: relation,
            updatedBy: window.currentUser.nama || window.currentUser.email,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        await db.ref(`staff/${staffId}/noHp`).set(formattedNumber);
        
        if (window.showToast) window.showToast(`✅ Nomor WhatsApp ${staffName} berhasil disimpan!`, 'success');
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('save_staff_contact', `Simpan kontak staff ${staffName} (ID: ${staffId}) - ${formattedNumber}`);
        }
        
        return true;
    } catch (error) {
        console.error('Save staff contact error:', error);
        if (window.showToast) window.showToast('❌ Gagal menyimpan nomor', 'error');
        return false;
    }
}

async function getStaffContact(staffId) {
    try {
        const snapshot = await db.ref(`staff_contacts/${staffId}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Get staff contact error:', error);
        return null;
    }
}

function openStaffContactModal(staffId, staffName) {
    const modalId = 'modal-staff-contact';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    getStaffContact(staffId).then(contact => {
        let existingNumber = '';
        let existingRelation = 'staff';
        
        if (contact && contact.rawNumber) {
            existingNumber = contact.rawNumber;
            existingRelation = contact.relation || 'staff';
        }
        
        const modalHtml = `
            <div id="${modalId}" class="modal-overlay open" style="display:flex; align-items:center; justify-content:center; z-index:10000;">
                <div class="modal-box" style="max-width: 450px; background:var(--bg-card); border-radius:20px;">
                    <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                        <span>📱 WhatsApp Staff - ${escapeHtml(staffName)}</span>
                        <span onclick="window.closeModal('${modalId}')" style="cursor:pointer; font-size:24px;">✖</span>
                    </div>
                    <div style="padding: 20px;">
                        <div class="form-group">
                            <label>👤 Staff</label>
                            <input type="text" id="staffContactName" value="${escapeHtml(staffName)}" readonly style="background: var(--bg-hover); width:100%; padding:10px; border-radius:8px;">
                        </div>
                        <div class="form-group">
                            <label>📱 Nomor WhatsApp</label>
                            <input type="tel" id="staffContactPhone" placeholder="Contoh: 08123456789 atau 628123456789" value="${escapeHtml(existingNumber)}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-input);">
                            <small class="text-small" style="color: var(--text-muted);">Format: 08xxxxxxxxx atau 628xxxxxxxxx</small>
                        </div>
                        <div class="form-group">
                            <label>👤 Hubungan</label>
                            <select id="staffContactRelation" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-input);">
                                <option value="staff" ${existingRelation === 'staff' ? 'selected' : ''}>Staff</option>
                                <option value="guru" ${existingRelation === 'guru' ? 'selected' : ''}>Guru</option>
                                <option value="karyawan" ${existingRelation === 'karyawan' ? 'selected' : ''}>Karyawan</option>
                                <option value="pribadi" ${existingRelation === 'pribadi' ? 'selected' : ''}>Pribadi</option>
                            </select>
                        </div>
                        <div class="modal-actions" style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
                            <button class="btn-cancel" onclick="window.closeModal('${modalId}')" style="padding:8px 20px; border-radius:20px; border:none; cursor:pointer;">Batal</button>
                            <button class="btn-save" onclick="saveStaffContactFromModal('${staffId}', '${escapeHtml(staffName)}')" style="padding:8px 20px; border-radius:20px; border:none; background:#4caf50; color:white; cursor:pointer;">💾 Simpan Nomor</button>
                        </div>
                        <div class="text-small" style="margin-top: 15px; text-align: center; color: var(--text-muted);">
                            <hr>
                            📱 <strong>Test Kirim Pesan</strong><br>
                            <button class="btn-action btn-success" onclick="testSendStaffWhatsApp('${staffId}', '${escapeHtml(staffName)}')" style="margin-top: 8px; padding: 6px 12px; font-size: 0.75rem;">
                                🔔 Kirim Test WhatsApp
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    });
}

async function saveStaffContactFromModal(staffId, staffName) {
    const phoneNumber = document.getElementById('staffContactPhone')?.value.trim();
    const relation = document.getElementById('staffContactRelation')?.value;
    
    if (!phoneNumber) {
        if (window.showToast) window.showToast('Masukkan nomor WhatsApp!', 'error');
        return;
    }
    
    await saveStaffContact(staffId, staffName, phoneNumber, relation);
    window.closeModal('modal-staff-contact');
}

async function testSendStaffWhatsApp(staffId, staffName) {
    let phoneNumber = null;
    
    const contact = await getStaffContact(staffId);
    if (contact && contact.phoneNumber) {
        phoneNumber = contact.phoneNumber;
    }
    
    if (!phoneNumber) {
        if (window.showToast) window.showToast(`❌ Nomor WhatsApp untuk ${staffName} belum diisi!`, 'error');
        return;
    }
    
    if (typeof sendViaFonnte !== 'function') {
        if (window.showToast) window.showToast('❌ Fungsi WhatsApp tidak tersedia. Pastikan whatsapp-notif.js sudah dimuat.', 'error');
        return;
    }
    
    const testMessage = `🧪 *TEST NOTIFIKASI WHATSAPP - STAFF*

Halo *${staffName}*, ini adalah pesan test dari **Sistem Absensi Sekolah**.

*Staff:* ${staffName}
*Waktu Test:* ${new Date().toLocaleString('id-ID')}

Jika Anda menerima pesan ini, berarti notifikasi WhatsApp untuk staff berhasil terintegrasi! ✅

---
📱 Sistem Absensi IoT - Real-time`;
    
    if (window.showToast) window.showToast('📤 Mengirim pesan test...', 'info');
    
    const result = await sendViaFonnte(phoneNumber, testMessage);
    
    if (result) {
        if (window.showToast) window.showToast(`✅ Pesan test berhasil dikirim ke ${phoneNumber}`, 'success');
        if (typeof window.logActivity === 'function') {
            window.logActivity('test_staff_whatsapp', `Test WhatsApp ke staff ${staffName} (${phoneNumber}) - BERHASIL`);
        }
    } else {
        if (window.showToast) window.showToast(`❌ Gagal mengirim ke ${phoneNumber}. Cek API Key dan koneksi.`, 'error');
        if (typeof window.logActivity === 'function') {
            window.logActivity('test_staff_whatsapp', `Test WhatsApp ke staff ${staffName} (${phoneNumber}) - GAGAL`);
        }
    }
}

// ======================= POPULATE FILTER TANGGAL (DIPERBAIKI) ========================

function populateStaffDateFilter() {
    const dateSelect = document.getElementById('filterStaffDate');
    if (!dateSelect) return;
    
    const currentValue = dateSelect.value;
    dateSelect.innerHTML = '<option value="all">📅 Semua Tanggal</option>';
    dateSelect.innerHTML += '<option value="today">📆 Hari Ini</option>';
    
    // Tambahkan 7 hari terakhir
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
    
    console.log(`✅ populateStaffDateFilter selesai, total options: ${dateSelect.options.length}`);
}

// ======================= RENDER TABEL ABSENSI STAFF (DIPERBAIKI) ========================

async function loadAllStaffAttendance() {
    console.log("📊 loadAllStaffAttendance - Memuat semua data absensi staff...");
    
    try {
        const snapshot = await window.firebase.database().ref('staff_attendance').once('value');
        const data = snapshot.val();
        
        allStaffAttendanceData = [];
        
        if (data) {
            for (const [date, records] of Object.entries(data)) {
                if (records && typeof records === 'object') {
                    for (const [staffId, record] of Object.entries(records)) {
                        if (record) {
                            allStaffAttendanceData.push({
                                ...record,
                                date: date,
                                staffId: staffId
                            });
                        }
                    }
                }
            }
        }
        
        // Urutkan dari yang terbaru
        allStaffAttendanceData.sort((a, b) => {
            const dateCompare = (b.date || '').localeCompare(a.date || '');
            if (dateCompare !== 0) return dateCompare;
            return (b.timestamp || 0) - (a.timestamp || 0);
        });
        
        console.log(`✅ Loaded ${allStaffAttendanceData.length} staff attendance records`);
        return allStaffAttendanceData;
        
    } catch (err) {
        console.error("Error loading staff attendance:", err);
        return [];
    }
}

async function renderStaffAttendanceTable() {
    console.log("📊 renderStaffAttendanceTable dipanggil");
    
    if (!isStaffAttendanceVisible()) {
        const tbody = document.getElementById('tbody-staff-attendance');
        if (tbody) {
            const roleDisplay = getRoleDisplayName(window.currentUser?.role);
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">🔒 ${roleDisplay} tidak memiliki akses ke halaman ini.<\/td><\/tr>`;
        }
        return;
    }
    
    let tbody = document.getElementById('tbody-staff-attendance');
    if (!tbody) {
        console.error("❌ tbody-staff-attendance not found");
        // Coba buat tbody secara dinamis
        const table = document.querySelector('#tab-staff-attendance .table-container table');
        if (table) {
            const newTbody = document.createElement('tbody');
            newTbody.id = 'tbody-staff-attendance';
            table.appendChild(newTbody);
            tbody = newTbody;
            console.log("✅ tbody-staff-attendance created dynamically");
        } else {
            return;
        }
    }
    
    // Pastikan header tabel memiliki kolom yang lengkap
    const table = tbody.closest('table');
    const thead = table?.querySelector('thead tr');
    if (thead && thead.children.length < 8) {
        thead.innerHTML = `
            <th>Foto</th>
            <th>Tanggal</th>
            <th>Jam Masuk</th>
            <th>Jam Pulang</th>
            <th>ID</th>
            <th>Nama</th>
            <th>Jabatan</th>
            <th>Aksi</th>
        `;
        console.log("✅ Staff attendance table header updated");
    }
    
    // Tampilkan loading
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">
        <div style="display:inline-block; width:30px; height:30px; border:3px solid var(--border); border-top-color:#00bcd4; border-radius:50%; animation: spin 1s linear infinite;"></div>
        <div style="margin-top:10px;">⏳ Memuat data absensi staff...</div>
    <\/td><\/tr>`;
    
    try {
        // Load semua data
        const allData = await loadAllStaffAttendance();
        
        // Filter berdasarkan tanggal yang dipilih
        const filterDate = document.getElementById('filterStaffDate')?.value || 'all';
        const todayStr = new Date().toISOString().split('T')[0];
        
        let filteredData = [...allData];
        
        if (filterDate === 'today') {
            filteredData = filteredData.filter(record => record.date === todayStr);
        } else if (filterDate !== 'all') {
            filteredData = filteredData.filter(record => record.date === filterDate);
        }
        
        console.log(`📊 Filtered data: ${filteredData.length} records (filter: ${filterDate})`);
        
        if (filteredData.length === 0) {
            let emptyMessage = `📭 Belum ada data absensi staff`;
            if (filterDate !== 'all') {
                emptyMessage += ` pada tanggal ${filterDate === 'today' ? 'hari ini' : filterDate}`;
            }
            tbody.innerHTML = `<td><td colspan="8" style="text-align:center; padding:30px;">${emptyMessage}<\/td><\/tr>`;
            updateStaffAttendanceStatistics(filteredData);
            return;
        }
        
        const canDelete = canDeleteStaffAttendance();
        const canEditWA = window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'developer');
        
        tbody.innerHTML = '';
        
        for (const row of filteredData) {
            const photoUrl = getStaffPhotoUrl(row.staffId, row.nama);
            const initial = row.nama ? row.nama.charAt(0).toUpperCase() : 'G';
            const formattedDate = formatIndonesianDate(row.date);
            
            // Format status
            let statusHtml = '';
            if (row.status === 'pulang') {
                statusHtml = `<span style="color:#f44336;">🏠 ${row.timeOut || '-'}</span>`;
            } else {
                statusHtml = `<span style="color:#4caf50;">✅ ${row.timeIn || '-'}</span>`;
            }
            
            let actionButtons = '';
            if (canDelete) {
                actionButtons = `<button onclick="window.deleteStaffAttendance('${row.date}', '${row.staffId}')" class="btn-icon delete" title="Hapus Data" style="background:#f44336; border:none; border-radius:8px; padding:5px 10px; cursor:pointer; color:white;">🗑️</button>`;
            } else {
                actionButtons = '-';
            }
            
            let waButton = '';
            if (canEditWA) {
                waButton = `<button onclick="openStaffContactModal('${row.staffId}', '${escapeHtml(row.nama)}')" class="btn-wa" title="Set WhatsApp" style="background:#25D366; border:none; border-radius:8px; padding:5px 10px; margin-left:5px; cursor:pointer; color:white;">📱</button>`;
            }
            
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="text-align:center; padding:8px;">
                        <img src="${photoUrl}" 
                             style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;"
                             onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff&size=100&bold=true&t=${Date.now()}'"
                             onclick="showStaffPhotoModal('${row.staffId}', '${escapeHtml(row.nama)}', this.src)"
                             title="Klik untuk lihat foto">
                     </div>
                    <td style="padding:8px;"><strong>${formattedDate}</strong><br><small>${row.date}</small></div>
                    <td style="padding:8px;">${statusHtml}</div>
                    <td style="padding:8px;">${row.timeOut ? `<span style="color:#f44336;">🏠 ${row.timeOut}</span>` : '<span style="color:#888;">-</span>'}</div>
                    <td style="padding:8px;"><strong>${escapeHtml(row.staffId)}</strong></div>
                    <td style="padding:8px;">${escapeHtml(row.nama)}</div>
                    <td style="padding:8px;">${escapeHtml(row.jabatan || '-')}</div>
                    <td style="white-space: nowrap; padding:8px;">
                        ${actionButtons}
                        ${waButton}
                     </div>
                </tr>
            `;
        }
        
        updateStaffAttendanceStatistics(filteredData);
        
    } catch (err) {
        console.error("Error rendering staff attendance:", err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#f44336;">
            ❌ Gagal memuat data: ${err.message}<br>
            <button onclick="renderStaffAttendanceTable()" style="margin-top:10px; padding:8px 20px; border-radius:20px; border:none; background:#00bcd4; color:white; cursor:pointer;">🔄 Coba Lagi</button>
        <\/td><\/tr>`;
    }
}

function updateStaffAttendanceStatistics(data) {
    let statsContainer = document.getElementById('staffAttendanceStats');
    if (!statsContainer) {
        const controlsBar = document.querySelector('#tab-staff-attendance .controls-bar');
        if (controlsBar && !document.getElementById('staffAttendanceStats')) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'staffAttendanceStats';
            statsContainer.style.marginBottom = '15px';
            statsContainer.style.padding = '10px';
            statsContainer.style.background = 'var(--bg-hover)';
            statsContainer.style.borderRadius = '8px';
            controlsBar.insertAdjacentElement('afterend', statsContainer);
        } else {
            return;
        }
    }
    
    const total = data.length;
    const hadir = data.filter(r => r.status === 'hadir' || !r.timeOut).length;
    const pulang = data.filter(r => r.status === 'pulang' || r.timeOut).length;
    const uniqueStaff = new Set(data.map(r => r.staffId)).size;
    
    statsContainer.innerHTML = `
        <div style="display: flex; gap: 20px; flex-wrap: wrap;">
            <span>👥 <strong>Total Transaksi:</strong> ${total}</span>
            <span>✅ <strong style="color:#4caf50;">Masuk:</strong> ${hadir}</span>
            <span>🏠 <strong style="color:#f44336;">Pulang:</strong> ${pulang}</span>
            <span>👤 <strong>Staff Unik:</strong> ${uniqueStaff}</span>
        </div>
    `;
}

// ======================= FUNGSI UNTUK MODAL ABSENSI ========================

window.openSimulateStaffInModal = function() {
    console.log("🔓 openSimulateStaffInModal dipanggil");
    
    if (!canManageStaffAttendance()) {
        const roleDisplay = getRoleDisplayName(window.currentUser?.role);
        if (window.showToast) window.showToast(`⛔ ${roleDisplay} tidak dapat melakukan absen staff!`, "error");
        else alert(`⛔ ${roleDisplay} tidak dapat melakukan absen staff!`);
        return;
    }
    
    if (!window.firebase || !window.firebase.database) {
        console.log("⏳ Menunggu Firebase...");
        setTimeout(() => window.openSimulateStaffInModal(), 500);
        return;
    }
    
    const searchInput = document.getElementById('simulateStaffSearchInput');
    if (searchInput) searchInput.value = '';
    const warningSpan = document.getElementById('simulateStaffWarning');
    if (warningSpan) warningSpan.innerHTML = '';
    document.getElementById('selectedStaffId').value = '';
    document.getElementById('selectedStaffName').value = '';
    document.getElementById('selectedStaffJabatan').value = '';
    
    window.firebase.database().ref('staff').once('value', (snapshot) => {
        const data = snapshot.val();
        currentStaffListForAttendance = [];
        
        if (data) {
            Object.keys(data).forEach(key => {
                currentStaffListForAttendance.push({ id: key, ...data[key] });
            });
        }
        
        if (window.dbData && window.dbData.users_auth) {
            const staffUsers = window.dbData.users_auth.filter(u => ['guru', 'developer', 'wakil_kepala', 'staff_tu', 'admin'].includes(u.role));
            staffUsers.forEach(user => {
                const existing = currentStaffListForAttendance.find(s => s.id === user.uid || s.id === user.staffId);
                if (!existing) {
                    let jabatan = 'Guru';
                    if (user.role === 'developer') jabatan = 'Developer';
                    else if (user.role === 'admin') jabatan = 'Kepala Sekolah';
                    else if (user.role === 'wakil_kepala') jabatan = 'Wakil Kepala Sekolah';
                    else if (user.role === 'staff_tu') jabatan = 'Staff TU';
                    
                    currentStaffListForAttendance.push({
                        id: user.uid,
                        nama: user.nama || user.email?.split('@')[0] || 'Unknown',
                        jabatan: jabatan,
                        email: user.email,
                        source: 'user_auth'
                    });
                }
            });
        }
        
        if (currentStaffListForAttendance.length === 0) {
            if (window.showToast) window.showToast("❌ Belum ada data staff! Silakan tambah staff terlebih dahulu.", "error");
            else alert("❌ Belum ada data staff! Silakan tambah staff terlebih dahulu.");
            return;
        }
        
        renderStaffListForInModal();
        
        const modal = document.getElementById('modal-simulate-staff-in');
        if (modal) modal.classList.add('open');
    }).catch(err => {
        console.error("Error loading staff:", err);
        if (window.showToast) window.showToast("❌ Gagal memuat data staff: " + err.message, "error");
    });
};

function renderStaffListForInModal(filterText = '') {
    const staffListDiv = document.getElementById('simulateStaffList');
    if (!staffListDiv) return;
    
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
            <div class="staff-list-item" data-id="${escapeHtml(s.id)}" data-nama="${escapeHtml(s.nama)}" data-jabatan="${escapeHtml(s.jabatan || '')}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                <strong>${escapeHtml(s.id)}</strong> - ${escapeHtml(s.nama)} <span style="color: #888;">(${escapeHtml(s.jabatan || '-')})</span>
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
            const searchInput = document.getElementById('simulateStaffSearchInput');
            if (searchInput) searchInput.value = `${id} - ${nama}`;
            staffListDiv.innerHTML = `<div style="padding: 10px; color: #4caf50;">✅ Dipilih: ${nama} (ID: ${id})</div>`;
            checkExistingStaffAttendance(id);
        });
    });
}

function checkExistingStaffAttendance(staffId) {
    const todayStr = new Date().toISOString().split('T')[0];
    const warningSpan = document.getElementById('simulateStaffWarning');
    if (!warningSpan) return;
    
    window.firebase.database().ref(`staff_attendance/${todayStr}/${staffId}`).once('value', (snapshot) => {
        const existing = snapshot.val();
        if (existing && existing.status !== 'pulang') {
            warningSpan.innerHTML = `⚠️ Staff ini sudah absen masuk hari ini pukul ${existing.timeIn}. Jika tetap disimpan, akan mengganti data sebelumnya.`;
            warningSpan.style.color = '#f44336';
        } else {
            warningSpan.innerHTML = '';
        }
    });
}

window.executeSimulateStaffIn = async function() {
    console.log("✅ executeSimulateStaffIn dipanggil");
    const staffId = document.getElementById('selectedStaffId')?.value;
    const nama = document.getElementById('selectedStaffName')?.value;
    const jabatan = document.getElementById('selectedStaffJabatan')?.value;
    
    if (!staffId || !nama) {
        if (window.showToast) window.showToast("❌ Pilih staff terlebih dahulu!", "error");
        else alert("❌ Pilih staff terlebih dahulu!");
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
            timestamp: window.firebase.database.ServerValue.TIMESTAMP
        };
        
        await window.firebase.database().ref(`staff_attendance/${dateStr}/${staffId}`).set(attendanceData);
        
        if (window.showToast) window.showToast(`✅ Absen masuk berhasil untuk ${nama} (${timeStr})`, "success");
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('simulate_staff_attendance_in', `Absen masuk staff: ${nama} (ID: ${staffId}) - Waktu: ${timeStr} oleh ${getRoleDisplayName(window.currentUser?.role)}`);
        }
        
        await sendStaffWhatsAppNotification(staffId, nama, 'check_in', timeStr, dateStr);
        
        window.closeModal('modal-simulate-staff-in');
        
        // Refresh data cache dan tabel
        await loadAllStaffAttendance();
        await renderStaffAttendanceTable();
        
    } catch (err) {
        console.error("Error:", err);
        if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
};

window.openSimulateStaffOutModal = function() {
    console.log("🔓 openSimulateStaffOutModal dipanggil");
    
    if (!canManageStaffAttendance()) {
        const roleDisplay = getRoleDisplayName(window.currentUser?.role);
        if (window.showToast) window.showToast(`⛔ ${roleDisplay} tidak dapat melakukan absen pulang staff!`, "error");
        else alert(`⛔ ${roleDisplay} tidak dapat melakukan absen pulang staff!`);
        return;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    const searchInput = document.getElementById('simulateStaffOutSearchInput');
    if (searchInput) searchInput.value = '';
    document.getElementById('selectedStaffOutId').value = '';
    document.getElementById('selectedStaffOutName').value = '';
    document.getElementById('selectedStaffOutTimeIn').value = '';
    
    window.firebase.database().ref(`staff_attendance/${todayStr}`).once('value', (snapshot) => {
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
            if (window.showToast) window.showToast("⚠️ Tidak ada staff yang absen masuk hari ini!", "warning");
            else alert("⚠️ Tidak ada staff yang absen masuk hari ini!");
            return;
        }
        
        renderStaffListForOutModal();
        
        const modal = document.getElementById('modal-simulate-staff-out');
        if (modal) modal.classList.add('open');
    });
};

function renderStaffListForOutModal(filterText = '') {
    const staffListDiv = document.getElementById('simulateStaffOutList');
    if (!staffListDiv) return;
    
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
            <div class="staff-list-item" data-id="${escapeHtml(s.staffId)}" data-nama="${escapeHtml(s.nama)}" data-timein="${escapeHtml(s.timeIn)}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                <strong>${escapeHtml(s.staffId)}</strong> - ${escapeHtml(s.nama)} <span style="color: #888;">Masuk: ${escapeHtml(s.timeIn)}</span>
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
            const searchInput = document.getElementById('simulateStaffOutSearchInput');
            if (searchInput) searchInput.value = `${id} - ${nama}`;
            staffListDiv.innerHTML = `<div style="padding: 10px; color: #4caf50;">✅ Dipilih: ${nama} (ID: ${id})</div>`;
        });
    });
}

window.executeSimulateStaffOut = async function() {
    console.log("✅ executeSimulateStaffOut dipanggil");
    const staffId = document.getElementById('selectedStaffOutId')?.value;
    const nama = document.getElementById('selectedStaffOutName')?.value;
    
    if (!staffId || !nama) {
        if (window.showToast) window.showToast("❌ Pilih staff terlebih dahulu!", "error");
        else alert("❌ Pilih staff terlebih dahulu!");
        return;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    const now = new Date();
    const timeOutStr = now.toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
    
    const btn = document.querySelector('#modal-simulate-staff-out .btn-save');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Memproses...'; }
    
    try {
        const currentAttendance = await window.firebase.database().ref(`staff_attendance/${todayStr}/${staffId}`).once('value');
        if (!currentAttendance.exists()) {
            if (window.showToast) window.showToast("❌ Data absensi tidak ditemukan untuk staff ini!", "error");
            return;
        }
        
        await window.firebase.database().ref(`staff_attendance/${todayStr}/${staffId}`).update({
            timeOut: timeOutStr,
            status: 'pulang',
            updatedAt: window.firebase.database.ServerValue.TIMESTAMP
        });
        
        if (window.showToast) window.showToast(`✅ ${nama} berhasil absen pulang pukul ${timeOutStr}`, "success");
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('simulate_staff_attendance_out', `Absen pulang staff: ${nama} (ID: ${staffId}) - Waktu: ${timeOutStr} oleh ${getRoleDisplayName(window.currentUser?.role)}`);
        }
        
        await sendStaffWhatsAppNotification(staffId, nama, 'check_out', timeOutStr, todayStr);
        
        window.closeModal('modal-simulate-staff-out');
        
        // Refresh data cache dan tabel
        await loadAllStaffAttendance();
        await renderStaffAttendanceTable();
        
    } catch (err) {
        console.error("Error:", err);
        if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
};

window.deleteStaffAttendance = async function(date, staffId) {
    if (!canDeleteStaffAttendance()) {
        if (window.showToast) window.showToast("⛔ Hanya Kepala Sekolah dan Developer yang dapat menghapus absensi staff!", "error");
        return;
    }
    
    if (!confirm(`⚠️ Hapus data absensi staff ini?\n\nTanggal: ${date}\nID: ${staffId}`)) return;
    
    try {
        await window.firebase.database().ref(`staff_attendance/${date}/${staffId}`).remove();
        if (window.showToast) window.showToast("✅ Data absensi berhasil dihapus!", "success");
        
        // Refresh data cache dan tabel
        await loadAllStaffAttendance();
        await renderStaffAttendanceTable();
    } catch (err) {
        if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
    }
};

window.exportStaffAttendanceToExcel = async function() {
    if (!canViewStaffAttendance()) {
        if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    const filterDate = document.getElementById('filterStaffDate')?.value || 'all';
    const todayStr = new Date().toISOString().split('T')[0];
    
    let dataToExport = [...allStaffAttendanceData];
    
    if (filterDate === 'today') {
        dataToExport = dataToExport.filter(record => record.date === todayStr);
    } else if (filterDate !== 'all') {
        dataToExport = dataToExport.filter(record => record.date === filterDate);
    }
    
    if (dataToExport.length === 0) {
        if (window.showToast) window.showToast("❌ Tidak ada data untuk diekspor!", "error");
        return;
    }
    
    let csv = "\uFEFFTanggal,ID,Nama,Jabatan,Waktu Masuk,Waktu Pulang,Status\n";
    dataToExport.forEach(a => {
        csv += `"${a.date}","${a.staffId}","${a.nama}","${a.jabatan || '-'}","${a.timeIn || '-'}","${a.timeOut || '-'}","${a.status === 'pulang' ? 'Pulang' : 'Hadir'}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `absensi_staff_${filterDate === 'all' ? 'semua' : (filterDate === 'today' ? todayStr : filterDate)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    if (window.showToast) window.showToast("📥 Laporan berhasil diunduh!", "success");
};

function showStaffPhotoModal(staffId, staffName, photoUrl) {
    const modalId = 'modal-staff-photo';
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    const freshPhotoUrl = getStaffPhotoUrl(staffId, staffName);
    
    const modalHtml = `
        <div id="${modalId}" class="modal-overlay open" style="display:flex; align-items:center; justify-content:center; z-index:10000;">
            <div class="modal-box" style="max-width: 500px; text-align: center; background:var(--bg-card); border-radius:20px;">
                <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                    <span>📸 Foto ${escapeHtml(staffName)}</span>
                    <span onclick="window.closeModal('${modalId}')" style="cursor:pointer; font-size:24px;">✖</span>
                </div>
                <div style="padding: 20px;">
                    <img src="${freshPhotoUrl}" style="max-width: 100%; max-height: 60vh; border-radius: 20px; object-fit: contain;"
                         onerror="this.src='https://ui-avatars.com/api/?name=${escapeHtml(staffName?.charAt(0) || 'G')}&background=ff9800&color=fff&size=200&bold=true&t=${Date.now()}'">
                    <p style="margin-top: 15px;">
                        <strong>${escapeHtml(staffName)}</strong><br>
                        <span style="color: var(--text-muted);">ID: ${staffId}</span>
                    </p>
                </div>
                <div class="modal-actions" style="padding:15px 20px; border-top:1px solid var(--border);">
                    <button class="btn-cancel" onclick="window.closeModal('${modalId}')" style="padding:8px 20px; border-radius:20px; border:none; cursor:pointer;">Tutup</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= INITIALIZATION ========================

async function initStaffAttendance() {
    if (staffAttendanceInitialized) return;
    
    console.log("📊 Initializing Staff Attendance system...");
    
    if (!window.currentUser) {
        setTimeout(initStaffAttendance, 500);
        return;
    }
    
    if (!isStaffAttendanceVisible()) {
        console.log("🔒 Staff Attendance: No access for role:", window.currentUser?.role);
        return;
    }
    
    if (!window.firebase || !window.firebase.database) {
        console.log("⏳ Menunggu Firebase...");
        setTimeout(initStaffAttendance, 500);
        return;
    }
    
    // Setup filter tanggal
    populateStaffDateFilter();
    
    const filterDateSelect = document.getElementById('filterStaffDate');
    if (filterDateSelect && !filterDateSelect._listenerAdded) {
        filterDateSelect.addEventListener('change', () => renderStaffAttendanceTable());
        filterDateSelect._listenerAdded = true;
    }
    
    // Setup search input listeners
    const searchInputIn = document.getElementById('simulateStaffSearchInput');
    if (searchInputIn && !searchInputIn._listenerAdded) {
        searchInputIn.addEventListener('input', (e) => renderStaffListForInModal(e.target.value));
        searchInputIn._listenerAdded = true;
    }
    
    const searchInputOut = document.getElementById('simulateStaffOutSearchInput');
    if (searchInputOut && !searchInputOut._listenerAdded) {
        searchInputOut.addEventListener('input', (e) => renderStaffListForOutModal(e.target.value));
        searchInputOut._listenerAdded = true;
    }
    
    // Setup realtime listener untuk perubahan data
    if (!staffAttendanceListener) {
        staffAttendanceListener = window.firebase.database().ref('staff_attendance').on('value', async () => {
            await loadAllStaffAttendance();
            if (document.getElementById('tab-staff-attendance')?.classList.contains('active')) {
                await renderStaffAttendanceTable();
            }
        });
    }
    
    // Load data awal
    await loadAllStaffAttendance();
    await renderStaffAttendanceTable();
    
    staffAttendanceInitialized = true;
    console.log("✅ Staff Attendance system initialized");
}

// Tambahkan CSS untuk spinner
if (!document.querySelector('#staff-attendance-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'staff-attendance-spinner-style';
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .btn-icon.delete {
            background: #f44336;
            border: none;
            border-radius: 8px;
            padding: 5px 10px;
            cursor: pointer;
            color: white;
            transition: all 0.2s;
        }
        .btn-icon.delete:hover {
            background: #d32f2f;
            transform: scale(1.02);
        }
        .btn-wa {
            background: #25D366;
            border: none;
            border-radius: 8px;
            padding: 5px 10px;
            cursor: pointer;
            color: white;
            transition: all 0.2s;
        }
        .btn-wa:hover {
            background: #128C7E;
            transform: scale(1.02);
        }
    `;
    document.head.appendChild(style);
}

// Ekspor ke global
window.initStaffAttendance = initStaffAttendance;
window.renderStaffAttendanceTable = renderStaffAttendanceTable;
window.isStaffAttendanceVisible = isStaffAttendanceVisible;
window.canManageStaffAttendance = canManageStaffAttendance;
window.getRoleDisplayName = getRoleDisplayName;
window.sendStaffWhatsAppNotification = sendStaffWhatsAppNotification;
window.saveStaffContact = saveStaffContact;
window.openStaffContactModal = openStaffContactModal;
window.saveStaffContactFromModal = saveStaffContactFromModal;
window.testSendStaffWhatsApp = testSendStaffWhatsApp;
window.showStaffPhotoModal = showStaffPhotoModal;
window.populateStaffDateFilter = populateStaffDateFilter;
window.loadAllStaffAttendance = loadAllStaffAttendance;

console.log("✅ staff-attendance.js V2.6 loaded - Fixed: dapat menampilkan semua data absensi staff (tidak hanya hari ini)");

// Auto-initialize
setTimeout(initStaffAttendance, 500);