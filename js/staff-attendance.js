// staff-attendance.js - VERSION 2.7 (DENGAN WHATSAPP NOTIFIKASI)
// Absensi Guru/Karyawan
// PERUBAHAN V2.7: 
//   - Menambahkan integrasi WhatsApp untuk notifikasi staff
//   - Notifikasi saat staff absen masuk (check-in)
//   - Notifikasi saat staff absen pulang (check-out)
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
                        source: 'user_auth',
                        noHp: user.noHp || null
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
            <div class="staff-list-item" data-id="${escapeHtml(s.id)}" data-nama="${escapeHtml(s.nama)}" data-jabatan="${escapeHtml(s.jabatan || '')}" data-nohp="${escapeHtml(s.noHp || '')}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                <strong>${escapeHtml(s.id)}</strong> - ${escapeHtml(s.nama)} <span style="color: #888;">(${escapeHtml(s.jabatan || '-')})</span>
                ${s.noHp ? `<span style="color: #4caf50; font-size: 10px; margin-left: 8px;">📱 WA terdaftar</span>` : ''}
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
            const noHp = el.getAttribute('data-nohp');
            document.getElementById('selectedStaffId').value = id;
            document.getElementById('selectedStaffName').value = nama;
            document.getElementById('selectedStaffJabatan').value = jabatan;
            // Simpan noHp untuk notifikasi
            document.getElementById('selectedStaffNoHp')?.setAttribute('value', noHp);
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

// ======================= EKSEKUSI ABSEN MASUK STAFF (DENGAN WHATSAPP) ========================

window.executeSimulateStaffIn = async function() {
    console.log("✅ executeSimulateStaffIn dipanggil");
    const staffId = document.getElementById('selectedStaffId')?.value;
    const nama = document.getElementById('selectedStaffName')?.value;
    const jabatan = document.getElementById('selectedStaffJabatan')?.value;
    const noHp = document.getElementById('selectedStaffNoHp')?.getAttribute('value') || 
                 document.getElementById('selectedStaffNoHp')?.value || 
                 null;
    
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
        // Cari data staff lengkap dari database
        let fullStaffData = null;
        if (window.dbData && window.dbData.staff) {
            fullStaffData = window.dbData.staff.find(s => s.id == staffId);
        }
        if (!fullStaffData) {
            const snapshot = await window.firebase.database().ref(`staff/${staffId}`).once('value');
            fullStaffData = snapshot.val();
        }
        
        // Gunakan noHp dari data staff jika tersedia
        const staffPhone = fullStaffData?.noHp || noHp || null;
        
        const attendanceData = {
            staffId: staffId,
            nama: nama,
            jabatan: jabatan || fullStaffData?.jabatan || 'Guru',
            timeIn: timeStr,
            timeOut: null,
            status: 'hadir',
            date: dateStr,
            timestamp: window.firebase.database.ServerValue.TIMESTAMP,
            noHp: staffPhone // Simpan no HP untuk referensi
        };
        
        await window.firebase.database().ref(`staff_attendance/${dateStr}/${staffId}`).set(attendanceData);
        
        // ============ KIRIM NOTIFIKASI WHATSAPP STAFF MASUK ============
        if (staffPhone && staffPhone !== '-' && staffPhone !== '') {
            if (typeof sendStaffAttendanceNotification === 'function') {
                try {
                    const staffData = {
                        id: staffId,
                        nama: nama,
                        jabatan: jabatan || fullStaffData?.jabatan || 'Guru',
                        noHp: staffPhone
                    };
                    const sent = await sendStaffAttendanceNotification(staffData, timeStr, 'masuk');
                    if (sent) {
                        console.log(`✅ WhatsApp check-in notification sent to staff ${nama}`);
                    } else {
                        console.warn(`⚠️ Failed to send WhatsApp check-in to staff ${nama}`);
                    }
                } catch (waError) {
                    console.error('WhatsApp send error:', waError);
                }
            } else {
                console.warn('⚠️ sendStaffAttendanceNotification function not available');
            }
        } else {
            console.log(`ℹ️ No WhatsApp number for staff ${nama}, skipping notification`);
        }
        
        if (window.showToast) window.showToast(`✅ Absen masuk berhasil untuk ${nama} (${timeStr})`, "success");
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('simulate_staff_attendance_in', `Absen masuk staff: ${nama} (ID: ${staffId}) - Waktu: ${timeStr} oleh ${getRoleDisplayName(window.currentUser?.role)}`);
        }
        
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

// ======================= ABSEN PULANG STAFF (DENGAN WHATSAPP) ========================

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
    document.getElementById('selectedStaffOutNoHp')?.setAttribute('value', '');
    
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
            <div class="staff-list-item" data-id="${escapeHtml(s.staffId)}" data-nama="${escapeHtml(s.nama)}" data-timein="${escapeHtml(s.timeIn)}" data-nohp="${escapeHtml(s.noHp || '')}" style="padding: 10px; border-bottom: 1px solid var(--border); cursor: pointer;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                <strong>${escapeHtml(s.staffId)}</strong> - ${escapeHtml(s.nama)} <span style="color: #888;">Masuk: ${escapeHtml(s.timeIn)}</span>
                ${s.noHp ? `<span style="color: #4caf50; font-size: 10px; margin-left: 8px;">📱 WA terdaftar</span>` : ''}
            </div>
        `;
    });
    staffListDiv.innerHTML = html;
    
    document.querySelectorAll('#simulateStaffOutList .staff-list-item').forEach(el => {
        el.addEventListener('click', () => {
            const id = el.getAttribute('data-id');
            const nama = el.getAttribute('data-nama');
            const timeIn = el.getAttribute('data-timein');
            const noHp = el.getAttribute('data-nohp');
            document.getElementById('selectedStaffOutId').value = id;
            document.getElementById('selectedStaffOutName').value = nama;
            document.getElementById('selectedStaffOutTimeIn').value = timeIn;
            document.getElementById('selectedStaffOutNoHp')?.setAttribute('value', noHp);
            const searchInput = document.getElementById('simulateStaffOutSearchInput');
            if (searchInput) searchInput.value = `${id} - ${nama}`;
            staffListDiv.innerHTML = `<div style="padding: 10px; color: #4caf50;">✅ Dipilih: ${nama} (ID: ${id})</div>`;
        });
    });
}

// ======================= EKSEKUSI ABSEN PULANG STAFF (DENGAN WHATSAPP) ========================

window.executeSimulateStaffOut = async function() {
    console.log("✅ executeSimulateStaffOut dipanggil");
    const staffId = document.getElementById('selectedStaffOutId')?.value;
    const nama = document.getElementById('selectedStaffOutName')?.value;
    const timeIn = document.getElementById('selectedStaffOutTimeIn')?.value;
    const noHp = document.getElementById('selectedStaffOutNoHp')?.getAttribute('value') || 
                 document.getElementById('selectedStaffOutNoHp')?.value || 
                 null;
    
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
        
        // Ambil data staff yang sudah ada
        const existingData = currentAttendance.val();
        
        await window.firebase.database().ref(`staff_attendance/${todayStr}/${staffId}`).update({
            timeOut: timeOutStr,
            status: 'pulang',
            updatedAt: window.firebase.database.ServerValue.TIMESTAMP
        });
        
        // ============ KIRIM NOTIFIKASI WHATSAPP STAFF PULANG ============
        const staffPhone = noHp || existingData.noHp || null;
        
        if (staffPhone && staffPhone !== '-' && staffPhone !== '') {
            if (typeof sendStaffAttendanceNotification === 'function') {
                try {
                    // Cari data staff lengkap untuk jabatan
                    let fullStaffData = null;
                    if (window.dbData && window.dbData.staff) {
                        fullStaffData = window.dbData.staff.find(s => s.id == staffId);
                    }
                    if (!fullStaffData) {
                        const snapshot = await window.firebase.database().ref(`staff/${staffId}`).once('value');
                        fullStaffData = snapshot.val();
                    }
                    
                    const staffData = {
                        id: staffId,
                        nama: nama,
                        jabatan: fullStaffData?.jabatan || existingData.jabatan || 'Guru',
                        noHp: staffPhone
                    };
                    const sent = await sendStaffAttendanceNotification(staffData, timeOutStr, 'pulang');
                    if (sent) {
                        console.log(`✅ WhatsApp check-out notification sent to staff ${nama}`);
                    } else {
                        console.warn(`⚠️ Failed to send WhatsApp check-out to staff ${nama}`);
                    }
                } catch (waError) {
                    console.error('WhatsApp send error:', waError);
                }
            } else {
                console.warn('⚠️ sendStaffAttendanceNotification function not available');
            }
        } else {
            console.log(`ℹ️ No WhatsApp number for staff ${nama}, skipping notification`);
        }
        
        if (window.showToast) window.showToast(`✅ ${nama} berhasil absen pulang pukul ${timeOutStr}`, "success");
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('simulate_staff_attendance_out', `Absen pulang staff: ${nama} (ID: ${staffId}) - Waktu: ${timeOutStr} oleh ${getRoleDisplayName(window.currentUser?.role)}`);
        }
        
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
            
            // Format status
            let statusHtml = '';
            if (row.status === 'pulang') {
                statusHtml = `<span style="color:#f44336;">🏠 Pulang (${row.timeOut || '-'})</span>`;
            } else {
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
            
            // Tampilkan status WhatsApp jika ada nomor
            const hasWhatsApp = row.noHp && row.noHp !== '-' && row.noHp !== '';
            const waIcon = hasWhatsApp ? '<span style="color:#25D366; font-size:14px;" title="Nomor WhatsApp terdaftar">📱</span>' : '';
            
            tbody.innerHTML += `
                <tr>
                    <td><img src="${photoUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff'"></td>
                    <td>${escapeHtml(row.timeIn || '-')}<br><small>${row.date || targetDate}</small></td>
                    <td><strong>${escapeHtml(row.staffId)}</strong></td>
                    <td>${escapeHtml(row.nama)} ${waIcon}</td>
                    <td>${escapeHtml(row.jabatan || '-')}</td>
                    <td>${statusHtml}</td>
                    <td>${actionButtons}</td>
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
    
    let csv = "\uFEFFID,Nama,Jabatan,Waktu Masuk,Waktu Pulang,Status,Tanggal,No WhatsApp\n";
    attendanceList.forEach(a => {
        csv += `"${a.staffId}","${a.nama}","${a.jabatan || '-'}","${a.timeIn || '-'}","${a.timeOut || '-'}","${a.status === 'pulang' ? 'Pulang' : 'Hadir'}","${targetDate}","${a.noHp || '-'}"\n`;
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

// ======================= EKSPOR KE GLOBAL =======================
window.initStaffAttendance = initStaffAttendance;
window.isStaffAttendanceVisible = isStaffAttendanceVisible;
window.canManageStaffAttendance = canManageStaffAttendance;
window.getRoleDisplayName = getRoleDisplayName;

console.log("✅ staff-attendance.js V2.7 loaded - DENGAN WhatsApp notifikasi untuk staff!");

// Auto-initialize
setTimeout(initStaffAttendance, 500);