// logs.js - VERSION 1.0
// Manajemen Log Aktivitas dengan filter berdasarkan role
// Admin, Guru, Developer: lihat semua log
// Siswa: hanya log milik sendiri

let logsListener = null;
let currentLogsData = [];
let logsPerPage = 20;
let currentLogsPage = 1;

function initLogsSystem() {
    console.log("📋 Initializing logs system...");
    if (!currentUser) return;
    
    // Set default date range (7 hari terakhir)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const startInput = document.getElementById('logStartDate');
    const endInput = document.getElementById('logEndDate');
    if (startInput && !startInput.value) startInput.value = startDate.toISOString().split('T')[0];
    if (endInput && !endInput.value) endInput.value = endDate.toISOString().split('T')[0];
    
    // Listen realtime jika diperlukan (opsional, bisa pakai sekali ambil)
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
        // Urutkan dari terbaru
        currentLogsData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        renderLogsTable();
    });
}

async function renderLogsTable() {
    const tbody = document.getElementById('logsTbody');
    if (!tbody) return;
    
    if (!currentUser) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Silakan login terlebih dahulu</td></tr>';
        return;
    }
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">⏳ Memuat data...</td></tr>';
    
    try {
        let filteredLogs = [...currentLogsData];
        
        // FILTER BERDASARKAN ROLE
        if (currentUser.role === 'siswa') {
            // Siswa hanya melihat log milik sendiri
            filteredLogs = filteredLogs.filter(log => log.userId === currentUser.uid);
        }
        // Admin, guru, developer: lihat semua (tidak perlu filter tambahan)
        
        // Filter berdasarkan aksi (jika ada)
        const actionFilter = document.getElementById('logActionFilter')?.value;
        if (actionFilter && actionFilter !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.action === actionFilter);
        }
        
        // Filter tanggal
        const startDateStr = document.getElementById('logStartDate')?.value;
        const endDateStr = document.getElementById('logEndDate')?.value;
        if (startDateStr && endDateStr) {
            const start = new Date(startDateStr);
            start.setHours(0,0,0,0);
            const end = new Date(endDateStr);
            end.setHours(23,59,59,999);
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
        
        let html = '';
        paginatedLogs.forEach(log => {
            const time = log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '-';
            const actionIcon = getActionIcon(log.action);
            let roleDisplay = log.userRole || 'siswa';
            let roleClass = `role-${roleDisplay}`;
            let roleIcon = roleDisplay === 'admin' ? '👑' : (roleDisplay === 'guru' ? '👨‍🏫' : (roleDisplay === 'developer' ? '👨‍💻' : '👨‍🎓'));
            
            html += `
                <tr>
                    <td style="white-space: nowrap;">${time}</td>
                    <td><strong>${escapeHtmlLog(log.userName || log.userId)}</strong></td>
                    <td><span class="role-badge ${roleClass}">${roleIcon} ${roleDisplay.toUpperCase()}</span></td>
                    <td>${actionIcon} ${formatActionName(log.action)}</td>
                    <td>${escapeHtmlLog(log.details || '-')}</td>
                    <td><small>${log.ipAddress || '-'}</small></td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
        renderPagination(totalPages);
        
    } catch (err) {
        console.error("Render logs error:", err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">❌ Gagal memuat log: ' + err.message + '</td></tr>';
    }
}

function renderPagination(totalPages) {
    const container = document.getElementById('logsPagination');
    if (!container) return;
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    let html = '';
    if (currentLogsPage > 1) {
        html += `<button class="btn-action btn-secondary" onclick="changeLogsPage(${currentLogsPage - 1})">◀ Prev</button>`;
    }
    html += `<span style="margin: 0 10px;">Halaman ${currentLogsPage} dari ${totalPages}</span>`;
    if (currentLogsPage < totalPages) {
        html += `<button class="btn-action btn-secondary" onclick="changeLogsPage(${currentLogsPage + 1})">Next ▶</button>`;
    }
    container.innerHTML = html;
}

function changeLogsPage(page) {
    currentLogsPage = page;
    renderLogsTable();
}

function getActionIcon(action) {
    const icons = {
        'login': '🔓',
        'logout': '🚪',
        'create_announcement': '📢',
        'update_announcement': '✏️',
        'delete_announcement': '🗑️',
        'delete_attendance': '🗑️',
        'simulate_attendance_in': '✅',
        'simulate_attendance_out': '🏠',
        'save_manual_attendance': '📝',
        'add_student': '➕',
        'edit_student': '✏️',
        'delete_student': '🗑️',
        'import_students': '📥',
        'export_students': '📤',
        'update_user_role': '🔄',
        'delete_user': '🗑️',
        'reset_system': '⚠️',
        'reset_user_password': '🔑',
        'create_status': '📸',
        'delete_status': '🗑️',
        'send_friend_request': '➕',
        'accept_friend_request': '✅',
        'reject_friend_request': '❌',
        'remove_friend': '🗑️',
        'delete_chat_message': '💬🗑️',
        'clear_chat': '🧹',
        'upload_profile_photo': '📸',
        'save_school_name': '🏫',
        'upload_school_logo': '🖼️',
        'remove_school_logo': '🗑️',
        'update_global_delay': '⏰',
        'save_classes': '📚',
        'save_majors': '🎓',
        'update_school_type': '🏫',
        'export_attendance_excel': '📊',
        'export_rekap_excel': '📊',
        'export_rekap_pdf': '📄',
        'forgot_password': '🔐'
    };
    return icons[action] || '📌';
}

function formatActionName(action) {
    const names = {
        'login': 'Login',
        'logout': 'Logout',
        'create_announcement': 'Buat Pengumuman',
        'update_announcement': 'Edit Pengumuman',
        'delete_announcement': 'Hapus Pengumuman',
        'delete_attendance': 'Hapus Absensi',
        'simulate_attendance_in': 'Simulasi Masuk',
        'simulate_attendance_out': 'Simulasi Pulang',
        'save_manual_attendance': 'Atur Ketidakhadiran',
        'add_student': 'Tambah Siswa',
        'edit_student': 'Edit Siswa',
        'delete_student': 'Hapus Siswa',
        'import_students': 'Import Siswa',
        'export_students': 'Export Siswa',
        'update_user_role': 'Ubah Role User',
        'delete_user': 'Hapus User',
        'reset_system': 'Reset Sistem',
        'reset_user_password': 'Reset Password',
        'create_status': 'Buat Status',
        'delete_status': 'Hapus Status',
        'send_friend_request': 'Kirim Permintaan Teman',
        'accept_friend_request': 'Terima Teman',
        'reject_friend_request': 'Tolak Teman',
        'remove_friend': 'Hapus Teman',
        'delete_chat_message': 'Hapus Pesan Chat',
        'clear_chat': 'Bersihkan Chat',
        'upload_profile_photo': 'Upload Foto Profil',
        'save_school_name': 'Ubah Nama Sekolah',
        'upload_school_logo': 'Upload Logo Sekolah',
        'remove_school_logo': 'Hapus Logo Sekolah',
        'update_global_delay': 'Ubah Delay Global',
        'save_classes': 'Simpan Daftar Kelas',
        'save_majors': 'Simpan Daftar Jurusan',
        'update_school_type': 'Ubah Tipe Sekolah',
        'export_attendance_excel': 'Ekspor Absensi Excel',
        'export_rekap_excel': 'Ekspor Rekap Excel',
        'export_rekap_pdf': 'Ekspor Rekap PDF',
        'forgot_password': 'Lupa Password'
    };
    return names[action] || action.replace(/_/g, ' ').toUpperCase();
}

function escapeHtmlLog(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function cleanupLogsSystem() {
    if (logsListener) {
        db.ref('logs').off('value', logsListener);
        logsListener = null;
    }
    currentLogsData = [];
    console.log("🧹 Logs system cleaned up");
}

// Ekspor ke global
window.initLogsSystem = initLogsSystem;
window.renderLogsTable = renderLogsTable;
window.changeLogsPage = changeLogsPage;
window.cleanupLogsSystem = cleanupLogsSystem;

console.log("✅ logs.js loaded");