// staff-attendance.js - VERSION 2.5 (DENGAN NOTIFIKASI WHATSAPP UNTUK STAFF)
// Absensi Guru/Karyawan dengan Notifikasi WhatsApp
// ============================================================================

let staffAttendanceDonutChart = null;
let staffAttendanceListener = null;
let staffAttendanceInitialized = false;
let currentStaffListForAttendance = [];
let currentStaffListForOut = [];

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

// ======================= NOTIFIKASI WHATSAPP UNTUK STAFF ========================

/**
 * Kirim notifikasi WhatsApp ke staff (Guru/Karyawan)
 * @param {string} staffId - ID staff
 * @param {string} staffName - Nama staff
 * @param {string} type - Jenis notifikasi ('check_in', 'check_out')
 * @param {string} time - Waktu kejadian
 * @param {string} date - Tanggal (opsional)
 */
async function sendStaffWhatsAppNotification(staffId, staffName, type, time, date = null) {
    // Cek apakah fitur WhatsApp diaktifkan
    if (typeof window.WHATSAPP_CONFIG === 'undefined' || !window.WHATSAPP_CONFIG.enabled) {
        console.log('📱 WhatsApp notification disabled for staff');
        return;
    }
    
    // Cek notifikasi berdasarkan jenis
    if (type === 'check_in' && !window.WHATSAPP_CONFIG.sendOnCheckIn) return;
    if (type === 'check_out' && !window.WHATSAPP_CONFIG.sendOnCheckOut) return;
    
    try {
        // Ambil nomor WhatsApp staff dari database
        let phoneNumber = null;
        
        // Cari dari staff_contacts
        const staffContactSnapshot = await db.ref(`staff_contacts/${staffId}`).once('value');
        const staffContactData = staffContactSnapshot.val();
        
        if (staffContactData && staffContactData.phoneNumber) {
            phoneNumber = staffContactData.phoneNumber;
        } else {
            // Cari dari data staff node
            const staffSnapshot = await db.ref(`staff/${staffId}`).once('value');
            const staffData = staffSnapshot.val();
            if (staffData && staffData.noHp) {
                phoneNumber = staffData.noHp;
            }
        }
        
        // Cari dari users_auth
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
                title = '✅ Absen Masuk Staff';
                message = `*${staffName}* telah absen masuk pada pukul *${time}*.\n\n📅 Tanggal: ${formattedDate}\n\nSelamat bekerja! 👨‍🏫✨`;
                break;
            case 'check_out':
                title = '🏠 Absen Pulang Staff';
                message = `*${staffName}* telah absen pulang pada pukul *${time}*.\n\n📅 Tanggal: ${formattedDate}\n\nSemoga sampai rumah dengan selamat. 🏡`;
                break;
        }
        
        // Kirim notifikasi via Fonnte jika fungsi tersedia
        if (typeof sendViaFonnte === 'function') {
            const fullMessage = `*📢 SISTEM ABSENSI SEKOLAH*\n\n*${title}*\n\n${message}\n\n---\n📱 Sistem Absensi IoT - Real-time`;
            const result = await sendViaFonnte(formattedNumber, fullMessage);
            if (result) {
                console.log(`📱 WhatsApp sent to staff ${staffName}: ${type}`);
                
                // Simpan log notifikasi
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

/**
 * Simpan kontak WhatsApp staff
 */
async function saveStaffContact(staffId, staffName, phoneNumber, relation = 'staff') {
    if (!window.currentUser || (window.currentUser.role !== 'admin' && window.currentUser.role !== 'developer')) {
        if (window.showToast) window.showToast('⛔ Hanya Admin dan Developer yang dapat mengedit kontak staff!', 'error');
        return false;
    }
    
    // Format nomor
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
        
        // Update juga di data staff node
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

/**
 * Buka modal kontak WhatsApp staff
 */
function openStaffContactModal(staffId, staffName) {
    const modalId = 'modal-staff-contact';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    // Load existing data
    let existingNumber = '';
    let existingRelation = 'staff';
    
    db.ref(`staff_contacts/${staffId}`).once('value', (snapshot) => {
        const contact = snapshot.val();
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

/**
 * Simpan kontak staff dari modal
 */
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

/**
 * Test kirim WhatsApp ke staff
 */
async function testSendStaffWhatsApp(staffId, staffName) {
    // Ambil nomor dari database
    let phoneNumber = null;
    
    const staffContactSnapshot = await db.ref(`staff_contacts/${staffId}`).once('value');
    const staffContactData = staffContactSnapshot.val();
    
    if (staffContactData && staffContactData.phoneNumber) {
        phoneNumber = staffContactData.phoneNumber;
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

// ======================= FUNGSI UNTUK MODAL YANG SUDAH ADA ========================

// Fungsi untuk membuka modal absen masuk staff (menggunakan modal yang sudah ada di HTML)
window.openSimulateStaffInModal = function() {
    console.log("🔓 openSimulateStaffInModal dipanggil");
    
    if (!canManageStaffAttendance()) {
        const roleDisplay = getRoleDisplayName(window.currentUser?.role);
        if (window.showToast) window.showToast(`⛔ ${roleDisplay} tidak dapat melakukan absen staff!`, "error");
        else alert(`⛔ ${roleDisplay} tidak dapat melakukan absen staff!`);
        return;
    }
    
    // Tunggu Firebase siap
    if (!window.firebase || !window.firebase.database) {
        console.log("⏳ Menunggu Firebase...");
        setTimeout(() => window.openSimulateStaffInModal(), 500);
        return;
    }
    
    // Reset form
    const searchInput = document.getElementById('simulateStaffSearchInput');
    if (searchInput) searchInput.value = '';
    const warningSpan = document.getElementById('simulateStaffWarning');
    if (warningSpan) warningSpan.innerHTML = '';
    document.getElementById('selectedStaffId').value = '';
    document.getElementById('selectedStaffName').value = '';
    document.getElementById('selectedStaffJabatan').value = '';
    
    // Load data staff
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
        
        // Render daftar staff
        renderStaffListForInModal();
        
        // Buka modal
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
    
    // Tambahkan event listener ke setiap item
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

// Eksekusi absen masuk - DENGAN NOTIFIKASI WHATSAPP
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
        
        // ======================== KIRIM NOTIFIKASI WHATSAPP KE STAFF ========================
        await sendStaffWhatsAppNotification(staffId, nama, 'check_in', timeStr, dateStr);
        
        window.closeModal('modal-simulate-staff-in');
        if (typeof window.renderStaffAttendanceTable === 'function') {
            window.renderStaffAttendanceTable();
        }
        
    } catch (err) {
        console.error("Error:", err);
        if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
};

// ======================= ABSEN PULANG STAFF ========================

window.openSimulateStaffOutModal = function() {
    console.log("🔓 openSimulateStaffOutModal dipanggil");
    
    if (!canManageStaffAttendance()) {
        const roleDisplay = getRoleDisplayName(window.currentUser?.role);
        if (window.showToast) window.showToast(`⛔ ${roleDisplay} tidak dapat melakukan absen pulang staff!`, "error");
        else alert(`⛔ ${roleDisplay} tidak dapat melakukan absen pulang staff!`);
        return;
    }
    
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Reset form
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

// Eksekusi absen pulang - DENGAN NOTIFIKASI WHATSAPP
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
        
        // ======================== KIRIM NOTIFIKASI WHATSAPP KE STAFF ========================
        await sendStaffWhatsAppNotification(staffId, nama, 'check_out', timeOutStr, todayStr);
        
        window.closeModal('modal-simulate-staff-out');
        if (typeof window.renderStaffAttendanceTable === 'function') {
            window.renderStaffAttendanceTable();
        }
        
    } catch (err) {
        console.error("Error:", err);
        if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
};

// ======================= RENDER TABEL ABSENSI STAFF ========================

window.renderStaffAttendanceTable = function() {
    console.log("📊 renderStaffAttendanceTable dipanggil");
    
    if (!isStaffAttendanceVisible()) {
        const tbody = document.getElementById('tbody-staff-attendance');
        if (tbody) {
            const roleDisplay = getRoleDisplayName(window.currentUser?.role);
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px;">🔒 ${roleDisplay} tidak memiliki akses ke halaman ini.<\/td><\/tr>`;
        }
        return;
    }
    
    let tbody = document.getElementById('tbody-staff-attendance');
    if (!tbody) {
        console.error("❌ tbody-staff-attendance not found");
        return;
    }
    
    const filterDate = document.getElementById('filterStaffDate')?.value || 'today';
    const todayStr = new Date().toISOString().split('T')[0];
    let targetDate = filterDate === 'today' ? todayStr : filterDate;
    
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px;"><div style="display:inline-block; width:30px; height:30px; border:3px solid var(--border); border-top-color:#00bcd4; border-radius:50%; animation: spin 1s linear infinite;"></div><div>⏳ Memuat data...</div><\/td><\/tr>`;
    
    window.firebase.database().ref(`staff_attendance/${targetDate}`).once('value', (snapshot) => {
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
            return;
        }
        
        const canDelete = canDeleteStaffAttendance();
        const isStaffTU = window.currentUser?.role === 'staff_tu';
        
        tbody.innerHTML = '';
        
        for (const row of attendanceList) {
            const photoUrl = getStaffPhotoUrl(row.staffId, row.nama);
            const initial = row.nama ? row.nama.charAt(0).toUpperCase() : 'G';
            
            // Format status - HANYA TAMPILKAN JAM, TANPA STATUS TERLAMBAT
            let statusHtml = '';
            if (row.status === 'pulang') {
                statusHtml = `<span style="color:#f44336;">🏠 Pulang (${row.timeOut || '-'})</span>`;
            } else {
                // Untuk staff, hanya tampilkan jam masuk tanpa label terlambat
                statusHtml = `<span style="color:#4caf50;">✅ ${row.timeIn || '-'}</span>`;
            }
            
            let actionButtons = '';
            if (canDelete) {
                actionButtons = `<button onclick="window.deleteStaffAttendance('${targetDate}', '${row.staffId}')" style="background:#f44336; border:none; border-radius:8px; padding:5px 10px; cursor:pointer; color:white;">🗑️</button>`;
            } else if (isStaffTU) {
                actionButtons = '<span style="color:#888;">🔒 Read only</span>';
            } else {
                actionButtons = '-';
            }
            
            // Tombol WhatsApp untuk Admin/Developer
            let waButton = '';
            if (window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'developer')) {
                waButton = `<button onclick="openStaffContactModal('${row.staffId}', '${escapeHtml(row.nama)}')" style="background:#25D366; border:none; border-radius:8px; padding:5px 10px; margin-left:5px; cursor:pointer; color:white;" title="Set WhatsApp">📱</button>`;
            }
            
            tbody.innerHTML += `
                <tr>
                    <td><img src="${photoUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff'"></td>
                    <td>${escapeHtml(row.timeIn || '-')}<br><small>${row.date || targetDate}</small></td>
                    <td><strong>${escapeHtml(row.staffId)}</strong></td>
                    <td>${escapeHtml(row.nama)}</div>
                    <td>${escapeHtml(row.jabatan || '-')}</div>
                    <td>${statusHtml}</div>
                    <td>${actionButtons}${waButton}</div>
                </tr>
            `;
        }
    }).catch(err => {
        console.error("Error:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px; color:#f44336;">❌ Gagal memuat data: ${err.message}<\/td><\/tr>`;
    });
};

function getStaffPhotoUrl(staffId, staffName) {
    if (!staffId) {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(staffName?.charAt(0) || 'G')}&background=ff9800&color=fff`;
    }
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(staffName?.charAt(0) || 'G')}&background=ff9800&color=fff`;
}

// ======================= HAPUS ABSENSI ========================

window.deleteStaffAttendance = async function(date, staffId) {
    if (!canDeleteStaffAttendance()) {
        if (window.showToast) window.showToast("⛔ Hanya Kepala Sekolah dan Developer yang dapat menghapus absensi staff!", "error");
        return;
    }
    
    if (!confirm("⚠️ Hapus data absensi staff ini?")) return;
    
    try {
        await window.firebase.database().ref(`staff_attendance/${date}/${staffId}`).remove();
        if (window.showToast) window.showToast("✅ Data absensi berhasil dihapus!", "success");
        window.renderStaffAttendanceTable();
    } catch (err) {
        if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
    }
};

// ======================= EXPORT EXCEL ========================

window.exportStaffAttendanceToExcel = async function() {
    if (!canViewStaffAttendance()) {
        if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    const filterDate = document.getElementById('filterStaffDate')?.value || 'today';
    const targetDate = filterDate === 'today' ? new Date().toISOString().split('T')[0] : filterDate;
    
    const snapshot = await window.firebase.database().ref(`staff_attendance/${targetDate}`).once('value');
    const data = snapshot.val();
    const attendanceList = data ? Object.values(data) : [];
    
    if (attendanceList.length === 0) {
        if (window.showToast) window.showToast("❌ Tidak ada data untuk diekspor!", "error");
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
    if (window.showToast) window.showToast("📥 Laporan berhasil diunduh!", "success");
};

// ======================= INITIALIZATION ========================

function initStaffAttendance() {
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
    
    // Tunggu Firebase siap
    if (!window.firebase || !window.firebase.database) {
        console.log("⏳ Menunggu Firebase...");
        setTimeout(initStaffAttendance, 500);
        return;
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
    
    // Setup listener untuk perubahan data
    if (!staffAttendanceListener) {
        staffAttendanceListener = true;
        window.firebase.database().ref('staff_attendance').on('value', () => {
            if (document.getElementById('tab-staff-attendance')?.classList.contains('active')) {
                window.renderStaffAttendanceTable();
            }
        });
    }
    
    staffAttendanceInitialized = true;
    window.renderStaffAttendanceTable();
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// CSS spinner
if (!document.querySelector('#staff-attendance-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'staff-attendance-spinner-style';
    style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
}

// Ekspor ke global
window.initStaffAttendance = initStaffAttendance;
window.isStaffAttendanceVisible = isStaffAttendanceVisible;
window.canManageStaffAttendance = canManageStaffAttendance;
window.getRoleDisplayName = getRoleDisplayName;
window.sendStaffWhatsAppNotification = sendStaffWhatsAppNotification;
window.saveStaffContact = saveStaffContact;
window.openStaffContactModal = openStaffContactModal;
window.saveStaffContactFromModal = saveStaffContactFromModal;
window.testSendStaffWhatsApp = testSendStaffWhatsApp;

console.log("✅ staff-attendance.js V2.5 loaded - Dengan notifikasi WhatsApp untuk staff + tombol set WA di tabel absensi");

// Auto-initialize
setTimeout(initStaffAttendance, 500);