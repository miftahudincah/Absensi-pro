// logs.js - VERSION 2.1 (DENGAN TOMBOL HAPUS PER BARIS UNTUK DEVELOPER & KEPALA SEKOLAH)
// Manajemen Log Aktivitas dengan filter berdasarkan role
// Fitur BARU: Hapus log satu per satu (hanya untuk Developer & Kepala Sekolah)
// ============================================================================

let logsListener = null;
let currentLogsData = [];
let logsPerPage = 20;
let currentLogsPage = 1;

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

/**
 * Cek apakah user dapat menghapus log
 * Hanya Developer dan Kepala Sekolah (Admin) yang bisa
 */
function canDeleteLogs(role) {
    const deleteRoles = ['developer', 'admin'];
    return deleteRoles.includes(role);
}

/**
 * Cek apakah user dapat melihat semua log
 */
function canViewAllLogs(role) {
    const allAccessRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
    return allAccessRoles.includes(role);
}

/**
 * Cek apakah user dapat melihat log sensitif
 */
function canViewSensitiveLogs(role) {
    const sensitiveRoles = ['admin', 'developer', 'wakil_kepala'];
    return sensitiveRoles.includes(role);
}

/**
 * Filter log berdasarkan aksi sensitif untuk Staff TU
 */
function filterSensitiveActionsForStaffTU(logs) {
    const sensitiveActions = [
        'delete_user', 'reset_system', 'update_user_role', 
        'delete_announcement', 'reset_user_password', 'delete_log'
    ];
    return logs.filter(log => !sensitiveActions.includes(log.action));
}

/**
 * Mendapatkan daftar aksi yang diizinkan untuk filter dropdown berdasarkan role
 */
function getAllowedActionsForFilter(role) {
    const allActions = [
        'login', 'logout', 'register',
        'create_announcement', 'update_announcement', 'delete_announcement',
        'delete_attendance', 'simulate_attendance_in', 'simulate_attendance_out', 'save_manual_attendance',
        'add_student', 'edit_student', 'delete_student', 'import_students', 'export_students',
        'update_user_role', 'delete_user', 'reset_system', 'reset_user_password',
        'create_status', 'delete_status',
        'send_friend_request', 'accept_friend_request', 'reject_friend_request', 'remove_friend',
        'delete_chat_message', 'clear_chat',
        'upload_profile_photo', 'save_school_name', 'upload_school_logo', 'remove_school_logo',
        'update_global_delay', 'save_classes', 'save_majors', 'update_school_type',
        'export_attendance_excel', 'export_rekap_excel', 'export_rekap_pdf', 'forgot_password',
        'delete_log'  // Aksi hapus log
    ];
    
    if (role === 'staff_tu') {
        const sensitiveActions = ['delete_user', 'reset_system', 'update_user_role', 'delete_announcement', 'delete_log'];
        return allActions.filter(a => !sensitiveActions.includes(a));
    }
    
    return allActions;
}

// ======================= INISIALISASI ========================

function initLogsSystem() {
    console.log("📋 Initializing logs system...");
    if (!currentUser) return;
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const startInput = document.getElementById('logStartDate');
    const endInput = document.getElementById('logEndDate');
    if (startInput && !startInput.value) startInput.value = startDate.toISOString().split('T')[0];
    if (endInput && !endInput.value) endInput.value = endDate.toISOString().split('T')[0];
    
    populateActionFilter();
    
    if (logsListener) {
        db.ref('logs').off('value', logsListener);
    }
    logsListener = db.ref('logs').on('value', (snapshot) => {
        if (!currentUser) return;
        const data = snapshot.val();
        currentLogsData = [];
        if (data) {
            Object.entries(data).forEach(([id, log]) => {
                currentLogsData.push({ id, ...log });
            });
        }
        currentLogsData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        renderLogsTable();
    });
}

function populateActionFilter() {
    const actionFilter = document.getElementById('logActionFilter');
    if (!actionFilter) return;
    
    const allowedActions = getAllowedActionsForFilter(currentUser?.role);
    const currentValue = actionFilter.value;
    
    actionFilter.innerHTML = '<option value="all">📌 Semua Aksi</option>';
    
    const actionCategories = {
        '🔐 Autentikasi': ['login', 'logout', 'register', 'forgot_password'],
        '📢 Pengumuman': ['create_announcement', 'update_announcement', 'delete_announcement'],
        '📋 Absensi': ['delete_attendance', 'simulate_attendance_in', 'simulate_attendance_out', 'save_manual_attendance', 'export_attendance_excel'],
        '👨‍🎓 Manajemen Siswa': ['add_student', 'edit_student', 'delete_student', 'import_students', 'export_students'],
        '👥 Manajemen User': ['update_user_role', 'delete_user', 'reset_user_password', 'reset_system'],
        '📸 Status': ['create_status', 'delete_status'],
        '👥 Pertemanan': ['send_friend_request', 'accept_friend_request', 'reject_friend_request', 'remove_friend'],
        '💬 Chat': ['delete_chat_message', 'clear_chat'],
        '⚙️ Pengaturan': ['upload_profile_photo', 'save_school_name', 'upload_school_logo', 'remove_school_logo', 'update_global_delay', 'save_classes', 'save_majors', 'update_school_type'],
        '📊 Ekspor': ['export_rekap_excel', 'export_rekap_pdf'],
        '🗑️ Manajemen Log': ['delete_log']
    };
    
    for (const [category, actions] of Object.entries(actionCategories)) {
        const categoryActions = actions.filter(a => allowedActions.includes(a));
        if (categoryActions.length > 0) {
            actionFilter.innerHTML += `<optgroup label="${category}">`;
            categoryActions.forEach(action => {
                actionFilter.innerHTML += `<option value="${action}">${getActionIcon(action)} ${formatActionName(action)}</option>`;
            });
            actionFilter.innerHTML += `</optgroup>`;
        }
    }
    
    if (currentValue && currentValue !== 'all') {
        actionFilter.value = currentValue;
    }
}

// ======================= RENDER LOGS TABLE ========================

async function renderLogsTable() {
    const tbody = document.getElementById('logsTbody');
    if (!tbody) return;
    
    if (!currentUser) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">🔒 Silakan login terlebih dahulu</td></tr>';
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">⏳ Memuat data...</td></tr>';
    
    try {
        let filteredLogs = [...currentLogsData];
        
        // FILTER BERDASARKAN ROLE
        if (currentUser.role === 'siswa') {
            filteredLogs = filteredLogs.filter(log => log.userId === currentUser.uid);
        } else if (currentUser.role === 'staff_tu') {
            filteredLogs = filterSensitiveActionsForStaffTU(filteredLogs);
        }
        
        // Filter berdasarkan aksi
        const actionFilter = document.getElementById('logActionFilter')?.value;
        if (actionFilter && actionFilter !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.action === actionFilter);
        }
        
        // Filter tanggal
        const startDateStr = document.getElementById('logStartDate')?.value;
        const endDateStr = document.getElementById('logEndDate')?.value;
        if (startDateStr && endDateStr) {
            const start = new Date(startDateStr);
            start.setHours(0, 0, 0, 0);
            const end = new Date(endDateStr);
            end.setHours(23, 59, 59, 999);
            filteredLogs = filteredLogs.filter(log => {
                const ts = log.timestamp;
                if (!ts) return false;
                const logDate = new Date(ts);
                return logDate >= start && logDate <= end;
            });
        }
        
        // Pagination
        const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
        const startIdx = (currentLogsPage - 1) * logsPerPage;
        const paginatedLogs = filteredLogs.slice(startIdx, startIdx + logsPerPage);
        
        if (paginatedLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">📭 Tidak ada log aktivitas.</td></tr>';
            renderPagination(totalPages);
            return;
        }
        
        // CEK APAKAH USER BISA HAPUS LOG
        const canDelete = canDeleteLogs(currentUser.role);
        
        let html = '';
        for (const log of paginatedLogs) {
            const time = log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '-';
            const actionIcon = getActionIcon(log.action);
            const roleDisplay = getRoleDisplayName(log.userRole || 'siswa');
            const roleIcon = getRoleIcon(log.userRole || 'siswa');
            let roleClass = `role-${log.userRole || 'siswa'}`;
            if (log.userRole === 'wakil_kepala') roleClass = 'role-wakil-kepala';
            if (log.userRole === 'staff_tu') roleClass = 'role-staff-tu';
            
            let rowClass = '';
            if (log.action === 'delete_user' || log.action === 'reset_system') {
                rowClass = 'log-critical';
            } else if (log.action === 'login' || log.action === 'logout') {
                rowClass = 'log-auth';
            } else if (log.action.includes('delete')) {
                rowClass = 'log-delete';
            }
            
            // Tombol hapus (hanya untuk Developer & Kepala Sekolah)
            let deleteButton = '';
            if (canDelete) {
                deleteButton = `
                    <button class="btn-icon delete-log-btn" 
                            onclick="deleteSingleLog('${log.id}')" 
                            title="Hapus log ini"
                            style="background: #f44336; border: none; border-radius: 8px; padding: 5px 10px; margin-left: 8px; cursor: pointer; color: white; font-size: 12px;">
                        🗑️
                    </button>
                `;
            }
            
            html += `
                <tr class="${rowClass}" style="border-bottom: 1px solid var(--border);" data-log-id="${log.id}">
                    <td style="white-space: nowrap; padding: 12px 8px;">${time}</td>
                    <td style="padding: 12px 8px;"><strong>${escapeHtmlLog(log.userName || log.userId)}</strong></td>
                    <td style="padding: 12px 8px;"><span class="role-badge ${roleClass}">${roleIcon} ${roleDisplay}</span></td>
                    <td style="padding: 12px 8px;">${actionIcon} ${formatActionName(log.action)}</td>
                    <td style="padding: 12px 8px; max-width: 400px; word-break: break-word;">${escapeHtmlLog(log.details || '-')}</td>
                    <td style="padding: 12px 8px;">
                        <small>${log.ipAddress || '-'}</small>
                        ${deleteButton}
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = html;
        renderPagination(totalPages);
        updateLogsCount(filteredLogs.length);
        
    } catch (err) {
        console.error("Render logs error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">❌ Gagal memuat log: ${err.message}</td></tr>`;
    }
}

/**
 * Hapus satu log berdasarkan ID
 * Hanya Developer dan Kepala Sekolah (Admin) yang bisa
 * @param {string} logId - ID log yang akan dihapus
 */
async function deleteSingleLog(logId) {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    
    if (!canDeleteLogs(currentUser.role)) {
        showToast("⛔ Hanya Developer dan Kepala Sekolah yang dapat menghapus log!", "error");
        return;
    }
    
    // Cari data log untuk ditampilkan di konfirmasi
    const logToDelete = currentLogsData.find(log => log.id === logId);
    if (!logToDelete) {
        showToast("❌ Log tidak ditemukan!", "error");
        return;
    }
    
    const logTime = logToDelete.timestamp ? new Date(logToDelete.timestamp).toLocaleString('id-ID') : 'Waktu tidak diketahui';
    const logAction = formatActionName(logToDelete.action);
    const logUser = logToDelete.userName || logToDelete.userId || 'Unknown';
    
    if (!confirm(`⚠️ HAPUS LOG\n\nApakah Anda yakin ingin menghapus log ini?\n\n📅 Waktu: ${logTime}\n👤 Pengguna: ${logUser}\n📌 Aksi: ${logAction}\n📝 Detail: ${(logToDelete.details || '-').substring(0, 100)}\n\nLog akan dihapus PERMANEN dari database dan tidak dapat dikembalikan!\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!`)) {
        return;
    }
    
    // Tampilkan loading pada tombol yang diklik
    const buttons = document.querySelectorAll(`.delete-log-btn[onclick="deleteSingleLog('${logId}')"]`);
    buttons.forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = '⏳';
        btn.style.opacity = '0.5';
    });
    
    try {
        // Hapus dari Firebase
        await db.ref(`logs/${logId}`).remove();
        
        showToast(`✅ Log berhasil dihapus!`, "success");
        
        // Catat aktivitas penghapusan log
        if (typeof logActivity === 'function') {
            const roleDisplay = getRoleDisplayName(currentUser.role);
            await logActivity('delete_log', `Menghapus log oleh ${logUser} (Aksi: ${logToDelete.action}) - ${roleDisplay}`);
        }
        
        // Refresh tabel logs (data akan otomatis update via listener)
        // Tapi kita panggil render ulang untuk memastikan
        setTimeout(() => {
            renderLogsTable();
        }, 500);
        
    } catch (error) {
        console.error("Delete log error:", error);
        showToast(`❌ Gagal menghapus log: ${error.message}`, "error");
        
        // Reset tombol
        buttons.forEach(btn => {
            btn.disabled = false;
            btn.innerHTML = '🗑️';
            btn.style.opacity = '1';
        });
    }
}

/**
 * Hapus semua log (untuk admin/developer) - fitur tambahan
 * @param {boolean} confirmed - Konfirmasi dari user
 */
async function deleteAllLogs() {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    
    if (!canDeleteLogs(currentUser.role)) {
        showToast("⛔ Hanya Developer dan Kepala Sekolah yang dapat menghapus log!", "error");
        return;
    }
    
    const totalLogs = currentLogsData.length;
    if (totalLogs === 0) {
        showToast("📭 Tidak ada log yang dapat dihapus!", "info");
        return;
    }
    
    if (!confirm(`⚠️ HAPUS SEMUA LOG\n\nApakah Anda yakin ingin menghapus SEMUA ${totalLogs} log aktivitas?\n\n⚠️ TINDAKAN INI TIDAK DAPAT DIBATALKAN!\n\nSemua log akan dihapus permanen dari database.`)) {
        return;
    }
    
    const roleDisplay = getRoleDisplayName(currentUser.role);
    const confirmation = prompt(`Ketik "HAPUS SEMUA" untuk mengkonfirmasi penghapusan ${totalLogs} log:`);
    
    if (confirmation !== "HAPUS SEMUA") {
        showToast("❌ Penghapusan dibatalkan", "error");
        return;
    }
    
    showToast("⏳ Menghapus semua log...", "info");
    
    try {
        // Hapus semua log dari Firebase
        await db.ref('logs').remove();
        
        showToast(`✅ ${totalLogs} log berhasil dihapus!`, "success");
        
        // Catat aktivitas
        if (typeof logActivity === 'function') {
            await logActivity('delete_all_logs', `Menghapus semua log (${totalLogs} log) - ${roleDisplay}`);
        }
        
        // Refresh
        setTimeout(() => {
            renderLogsTable();
        }, 500);
        
    } catch (error) {
        console.error("Delete all logs error:", error);
        showToast(`❌ Gagal menghapus log: ${error.message}`, "error");
    }
}

function updateLogsCount(count) {
    const logsHeader = document.querySelector('#tab-logs .controls-bar h4');
    if (logsHeader) {
        logsHeader.innerHTML = `📋 Log Aktivitas <span style="font-size: 12px; color: #888;">(${count} record)</span>`;
    }
    
    // Tambahkan tombol hapus semua jika user memiliki akses
    const controlsBar = document.querySelector('#tab-logs .controls-bar');
    if (controlsBar && canDeleteLogs(currentUser?.role)) {
        let deleteAllBtn = document.getElementById('deleteAllLogsBtn');
        if (!deleteAllBtn) {
            deleteAllBtn = document.createElement('button');
            deleteAllBtn.id = 'deleteAllLogsBtn';
            deleteAllBtn.className = 'btn-action btn-danger';
            deleteAllBtn.innerHTML = '🗑️ Hapus Semua Log';
            deleteAllBtn.onclick = () => deleteAllLogs();
            deleteAllBtn.style.marginLeft = 'auto';
            deleteAllBtn.style.background = '#f44336';
            deleteAllBtn.style.border = 'none';
            deleteAllBtn.style.padding = '8px 16px';
            deleteAllBtn.style.borderRadius = '8px';
            deleteAllBtn.style.cursor = 'pointer';
            deleteAllBtn.style.color = 'white';
            controlsBar.appendChild(deleteAllBtn);
        }
    } else {
        const deleteAllBtn = document.getElementById('deleteAllLogsBtn');
        if (deleteAllBtn) deleteAllBtn.remove();
    }
}

function renderPagination(totalPages) {
    const container = document.getElementById('logsPagination');
    if (!container) return;
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    let html = '<div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">';
    
    if (currentLogsPage > 1) {
        html += `<button class="btn-action btn-secondary" onclick="changeLogsPage(1)" title="Halaman pertama">⏮️</button>`;
        html += `<button class="btn-action btn-secondary" onclick="changeLogsPage(${currentLogsPage - 1})">◀ Prev</button>`;
    }
    
    let startPage = Math.max(1, currentLogsPage - 2);
    let endPage = Math.min(totalPages, currentLogsPage + 2);
    
    if (startPage > 1) {
        html += `<span class="page-number">...</span>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
        if (i === currentLogsPage) {
            html += `<span class="page-number active" style="background: var(--primary); color: white; padding: 5px 10px; border-radius: 5px;">${i}</span>`;
        } else {
            html += `<button class="page-number" onclick="changeLogsPage(${i})" style="background: transparent; border: 1px solid var(--border); padding: 5px 10px; border-radius: 5px; cursor: pointer;">${i}</button>`;
        }
    }
    
    if (endPage < totalPages) {
        html += `<span class="page-number">...</span>`;
    }
    
    if (currentLogsPage < totalPages) {
        html += `<button class="btn-action btn-secondary" onclick="changeLogsPage(${currentLogsPage + 1})">Next ▶</button>`;
        html += `<button class="btn-action btn-secondary" onclick="changeLogsPage(${totalPages})" title="Halaman terakhir">⏭️</button>`;
    }
    
    html += `<span style="margin-left: 15px; font-size: 12px; color: var(--text-muted);">Halaman ${currentLogsPage} dari ${totalPages}</span>`;
    html += `</div>`;
    
    container.innerHTML = html;
}

function changeLogsPage(page) {
    currentLogsPage = page;
    renderLogsTable();
}

// ======================= ACTION ICONS & NAMES ========================

function getActionIcon(action) {
    const icons = {
        'login': '🔓', 'logout': '🚪', 'register': '📝', 'forgot_password': '🔐',
        'create_announcement': '📢', 'update_announcement': '✏️', 'delete_announcement': '🗑️',
        'delete_attendance': '🗑️', 'simulate_attendance_in': '✅', 'simulate_attendance_out': '🏠',
        'save_manual_attendance': '📝', 'export_attendance_excel': '📊',
        'add_student': '➕', 'edit_student': '✏️', 'delete_student': '🗑️',
        'import_students': '📥', 'export_students': '📤',
        'update_user_role': '🔄', 'delete_user': '🗑️', 'reset_system': '⚠️', 'reset_user_password': '🔑',
        'create_status': '📸', 'delete_status': '🗑️',
        'send_friend_request': '➕', 'accept_friend_request': '✅', 'reject_friend_request': '❌', 'remove_friend': '🗑️',
        'delete_chat_message': '💬🗑️', 'clear_chat': '🧹',
        'upload_profile_photo': '📸', 'save_school_name': '🏫', 'upload_school_logo': '🖼️',
        'remove_school_logo': '🗑️', 'update_global_delay': '⏰', 'save_classes': '📚',
        'save_majors': '🎓', 'update_school_type': '🏫',
        'export_rekap_excel': '📊', 'export_rekap_pdf': '📄',
        'add_staff': '➕', 'edit_staff': '✏️', 'delete_staff': '🗑️', 'create_staff_account': '👤',
        'simulate_staff_attendance_in': '✅', 'simulate_staff_attendance_out': '🏠', 'delete_staff_attendance': '🗑️',
        'export_staff_attendance_excel': '📊',
        'create_izin': '📝', 'update_izin': '✏️', 'delete_izin': '🗑️', 'approve_izin': '✅', 'reject_izin': '❌',
        'generate_code': '🔑', 'delete_code': '🗑️',
        'delete_log': '🗑️', 'delete_all_logs': '🔥'
    };
    return icons[action] || '📌';
}

function formatActionName(action) {
    const names = {
        'login': 'Login', 'logout': 'Logout', 'register': 'Registrasi Akun', 'forgot_password': 'Lupa Password',
        'create_announcement': 'Buat Pengumuman', 'update_announcement': 'Edit Pengumuman', 'delete_announcement': 'Hapus Pengumuman',
        'delete_attendance': 'Hapus Absensi', 'simulate_attendance_in': 'Simulasi Absen Masuk',
        'simulate_attendance_out': 'Simulasi Absen Pulang', 'save_manual_attendance': 'Atur Ketidakhadiran',
        'export_attendance_excel': 'Ekspor Absensi Excel',
        'add_student': 'Tambah Siswa', 'edit_student': 'Edit Siswa', 'delete_student': 'Hapus Siswa',
        'import_students': 'Import Siswa', 'export_students': 'Export Siswa',
        'update_user_role': 'Ubah Role User', 'delete_user': 'Hapus User', 'reset_system': 'Reset Sistem',
        'reset_user_password': 'Reset Password User',
        'create_status': 'Buat Status', 'delete_status': 'Hapus Status',
        'send_friend_request': 'Kirim Permintaan Teman', 'accept_friend_request': 'Terima Permintaan Teman',
        'reject_friend_request': 'Tolak Permintaan Teman', 'remove_friend': 'Hapus Teman',
        'delete_chat_message': 'Hapus Pesan Chat', 'clear_chat': 'Bersihkan Chat',
        'upload_profile_photo': 'Upload Foto Profil', 'save_school_name': 'Ubah Nama Sekolah',
        'upload_school_logo': 'Upload Logo Sekolah', 'remove_school_logo': 'Hapus Logo Sekolah',
        'update_global_delay': 'Ubah Delay Global', 'save_classes': 'Simpan Daftar Kelas',
        'save_majors': 'Simpan Daftar Jurusan', 'update_school_type': 'Ubah Tipe Sekolah',
        'export_rekap_excel': 'Ekspor Rekap Excel', 'export_rekap_pdf': 'Ekspor Rekap PDF',
        'add_staff': 'Tambah Staff', 'edit_staff': 'Edit Staff', 'delete_staff': 'Hapus Staff',
        'create_staff_account': 'Buat Akun Staff', 'simulate_staff_attendance_in': 'Absen Masuk Staff',
        'simulate_staff_attendance_out': 'Absen Pulang Staff', 'delete_staff_attendance': 'Hapus Absensi Staff',
        'export_staff_attendance_excel': 'Ekspor Absensi Staff Excel',
        'create_izin': 'Ajukan Izin', 'update_izin': 'Edit Izin', 'delete_izin': 'Hapus Izin',
        'approve_izin': 'Setujui Izin', 'reject_izin': 'Tolak Izin',
        'generate_code': 'Generate Kode Registrasi', 'delete_code': 'Hapus Kode Registrasi',
        'delete_log': 'Hapus Log', 'delete_all_logs': 'Hapus Semua Log'
    };
    return names[action] || action.replace(/_/g, ' ').toUpperCase();
}

function escapeHtmlLog(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= CLEANUP ========================

function cleanupLogsSystem() {
    if (logsListener) {
        db.ref('logs').off('value', logsListener);
        logsListener = null;
    }
    currentLogsData = [];
    currentLogsPage = 1;
    console.log("🧹 Logs system cleaned up");
}

// ======================= EKSPOR KE GLOBAL =======================
window.initLogsSystem = initLogsSystem;
window.renderLogsTable = renderLogsTable;
window.changeLogsPage = changeLogsPage;
window.cleanupLogsSystem = cleanupLogsSystem;
window.populateActionFilter = populateActionFilter;
window.getAllowedActionsForFilter = getAllowedActionsForFilter;
window.filterSensitiveActionsForStaffTU = filterSensitiveActionsForStaffTU;
window.getRoleDisplayName = getRoleDisplayName;
window.getRoleIcon = getRoleIcon;
window.canViewAllLogs = canViewAllLogs;
window.canViewSensitiveLogs = canViewSensitiveLogs;
window.canDeleteLogs = canDeleteLogs;
window.deleteSingleLog = deleteSingleLog;
window.deleteAllLogs = deleteAllLogs;

console.log("✅ logs.js V2.1 loaded - Dengan tombol hapus log per baris untuk Developer & Kepala Sekolah");