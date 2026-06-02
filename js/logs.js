// logs.js - VERSION 1.2 (FIXED: Log Activity display)
// Manajemen Log Aktivitas dengan filter berdasarkan role
// Admin, Guru, Developer: lihat semua log
// Siswa: hanya log milik sendiri

let logsListener = null;
let currentLogsData = [];
let logsPerPage = 20;
let currentLogsPage = 1;
let logsInitialized = false;

function initLogsSystem() {
    if (logsInitialized) return;
    logsInitialized = true;
    console.log("📋 Initializing logs system...");
    
    if (!currentUser) {
        console.log("No user logged in, skipping logs init");
        return;
    }
    
    // Set default date range (7 hari terakhir)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const startInput = document.getElementById('logStartDate');
    const endInput = document.getElementById('logEndDate');
    if (startInput && !startInput.value) startInput.value = startDate.toISOString().split('T')[0];
    if (endInput && !endInput.value) endInput.value = endDate.toISOString().split('T')[0];
    
    // Populate action filter dropdown
    populateActionFilter();
    
    // Reset ke halaman 1
    currentLogsPage = 1;
    
    // Setup listener jika belum ada
    if (!logsListener) {
        setupLogsListener();
    } else {
        // Jika sudah ada, tetap panggil render
        renderLogsTable();
    }
}

function setupLogsListener() {
    if (logsListener) {
        db.ref('logs').off('value', logsListener);
    }
    
    logsListener = db.ref('logs').on('value', (snapshot) => {
        if (!currentUser) return;
        const data = snapshot.val();
        currentLogsData = [];
        if (data) {
            Object.entries(data).forEach(([id, log]) => {
                // Skip jika log tidak memiliki timestamp yang valid
                if (!log || !log.timestamp) return;
                currentLogsData.push({ id, ...log });
            });
        }
        // Urutkan dari terbaru
        currentLogsData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        renderLogsTable();
    });
}

function populateActionFilter() {
    const actionFilter = document.getElementById('logActionFilter');
    if (!actionFilter) return;
    
    const actions = [
        { value: 'all', label: '📌 Semua Aksi' },
        { value: 'login', label: '🔓 Login' },
        { value: 'logout', label: '🚪 Logout' },
        { value: 'register', label: '📝 Registrasi' },
        { value: 'create_announcement', label: '📢 Buat Pengumuman' },
        { value: 'update_announcement', label: '✏️ Edit Pengumuman' },
        { value: 'delete_announcement', label: '🗑️ Hapus Pengumuman' },
        { value: 'delete_attendance', label: '🗑️ Hapus Absensi' },
        { value: 'simulate_attendance_in', label: '✅ Simulasi Masuk' },
        { value: 'simulate_attendance_out', label: '🏠 Simulasi Pulang' },
        { value: 'save_manual_attendance', label: '📝 Atur Ketidakhadiran' },
        { value: 'add_student', label: '➕ Tambah Siswa' },
        { value: 'edit_student', label: '✏️ Edit Siswa' },
        { value: 'delete_student', label: '🗑️ Hapus Siswa' },
        { value: 'import_students', label: '📥 Import Siswa' },
        { value: 'export_students', label: '📤 Export Siswa' },
        { value: 'update_user_role', label: '🔄 Ubah Role User' },
        { value: 'delete_user', label: '🗑️ Hapus User' },
        { value: 'reset_system', label: '⚠️ Reset Sistem' },
        { value: 'reset_user_password', label: '🔑 Reset Password' },
        { value: 'create_status', label: '📸 Buat Status' },
        { value: 'delete_status', label: '🗑️ Hapus Status' },
        { value: 'send_friend_request', label: '➕ Kirim Permintaan Teman' },
        { value: 'accept_friend_request', label: '✅ Terima Teman' },
        { value: 'reject_friend_request', label: '❌ Tolak Teman' },
        { value: 'remove_friend', label: '🗑️ Hapus Teman' },
        { value: 'delete_chat_message', label: '💬🗑️ Hapus Pesan Chat' },
        { value: 'clear_chat', label: '🧹 Bersihkan Chat' },
        { value: 'upload_profile_photo', label: '📸 Upload Foto Profil' },
        { value: 'save_school_name', label: '🏫 Ubah Nama Sekolah' },
        { value: 'upload_school_logo', label: '🖼️ Upload Logo Sekolah' },
        { value: 'remove_school_logo', label: '🗑️ Hapus Logo Sekolah' },
        { value: 'update_global_delay', label: '⏰ Ubah Delay Global' },
        { value: 'save_classes', label: '📚 Simpan Daftar Kelas' },
        { value: 'save_majors', label: '🎓 Simpan Daftar Jurusan' },
        { value: 'update_school_type', label: '🏫 Ubah Tipe Sekolah' },
        { value: 'export_attendance_excel', label: '📊 Ekspor Absensi Excel' },
        { value: 'export_rekap_excel', label: '📊 Ekspor Rekap Excel' },
        { value: 'export_rekap_pdf', label: '📄 Ekspor Rekap PDF' },
        { value: 'forgot_password', label: '🔐 Lupa Password' },
        { value: 'generate_code', label: '🔑 Generate Kode' },
        { value: 'delete_code', label: '🗑️ Hapus Kode' },
        { value: 'force_reload_school_config', label: '🔄 Reload Config' },
        { value: 'export_school_config', label: '📤 Export Config' },
        { value: 'import_school_config', label: '📥 Import Config' },
        { value: 'reset_all_settings', label: '⚙️ Reset Settings' },
        { value: 'add_holiday_date', label: '📅 Tambah Libur' },
        { value: 'remove_holiday_date', label: '🗑️ Hapus Libur' },
        { value: 'save_attendance_settings', label: '⏰ Simpan Pengaturan Jam' },
        { value: 'update_profile', label: '👤 Update Profil' },
        { value: 'change_password', label: '🔑 Ganti Password' },
        { value: 'create_test_announcement', label: '🧪 Test Pengumuman' }
    ];
    
    const currentValue = actionFilter.value;
    actionFilter.innerHTML = actions.map(a => 
        `<option value="${a.value}" ${a.value === currentValue ? 'selected' : ''}>${a.label}</option>`
    ).join('');
    
    console.log(`✅ Action filter populated with ${actions.length} options`);
}

async function renderLogsTable() {
    const tbody = document.getElementById('logsTbody');
    if (!tbody) {
        console.warn("logsTbody not found");
        return;
    }
    
    if (!currentUser) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">🔒 Silakan login terlebih dahulu</td></tr>';
        return;
    }
    
    // Tampilkan loading
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">⏳ Memuat data log...</td></tr>';
    
    try {
        let filteredLogs = [...currentLogsData];
        
        console.log(`📊 Total logs: ${filteredLogs.length}`);
        
        // FILTER BERDASARKAN ROLE
        if (currentUser.role === 'siswa') {
            // Siswa hanya melihat log milik sendiri
            filteredLogs = filteredLogs.filter(log => log.userId === currentUser.uid);
            console.log(`📊 Filtered by role siswa: ${filteredLogs.length} logs`);
        }
        
        // Filter berdasarkan aksi (jika ada)
        const actionFilter = document.getElementById('logActionFilter')?.value;
        if (actionFilter && actionFilter !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.action === actionFilter);
            console.log(`📊 Filtered by action ${actionFilter}: ${filteredLogs.length} logs`);
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
            console.log(`📊 Filtered by date range: ${filteredLogs.length} logs`);
        }
        
        // Pagination
        const totalPages = Math.max(1, Math.ceil(filteredLogs.length / logsPerPage));
        if (currentLogsPage > totalPages) currentLogsPage = 1;
        
        const startIdx = (currentLogsPage - 1) * logsPerPage;
        const paginatedLogs = filteredLogs.slice(startIdx, startIdx + logsPerPage);
        
        if (paginatedLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:40px;">📭 Tidak ada log aktivitas.</td></tr>';
            renderPagination(totalPages);
            return;
        }
        
        let html = '';
        for (const log of paginatedLogs) {
            const time = log.timestamp ? new Date(log.timestamp).toLocaleString('id-ID') : '-';
            const actionIcon = getActionIcon(log.action);
            let roleDisplay = log.userRole || 'siswa';
            let roleClass = `role-${roleDisplay}`;
            let roleIcon = roleDisplay === 'admin' ? '👑' : (roleDisplay === 'guru' ? '👨‍🏫' : (roleDisplay === 'developer' ? '👨‍💻' : '👨‍🎓'));
            
            // Cari nama user yang lebih lengkap
            let userName = log.userName || log.userId || 'Unknown';
            if ((!log.userName || log.userName === 'unknown') && log.userId && dbData?.users_auth) {
                const userData = dbData.users_auth.find(u => u.uid === log.userId);
                if (userData) userName = userData.nama || userName;
            }
            
            html += `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 12px 10px; white-space: nowrap; font-size: 13px;">${time}</td>
                    <td style="padding: 12px 10px;"><strong>${escapeHtmlLog(userName)}</strong></td>
                    <td style="padding: 12px 10px;"><span class="role-badge ${roleClass}" style="font-size: 11px;">${roleIcon} ${roleDisplay.toUpperCase()}</span></td>
                    <td style="padding: 12px 10px;">${actionIcon} ${formatActionName(log.action)}</td>
                    <td style="padding: 12px 10px; max-width: 350px; word-break: break-word; font-size: 12px; color: var(--text-muted);">${escapeHtmlLog(log.details || '-')}</td>
                    <td style="padding: 12px 10px; font-size: 11px; color: var(--text-muted);">${log.ipAddress || '-'}</td>
                </tr>
            `;
        }
        tbody.innerHTML = html;
        renderPagination(totalPages);
        
    } catch (err) {
        console.error("Render logs error:", err);
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;">❌ Gagal memuat log: ${err.message}</td></tr>`;
    }
}

function renderPagination(totalPages) {
    const container = document.getElementById('logsPagination');
    if (!container) return;
    
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<div style="display: flex; justify-content: center; gap: 10px; margin-top: 15px;">';
    if (currentLogsPage > 1) {
        html += `<button class="btn-action btn-secondary" onclick="changeLogsPage(${currentLogsPage - 1})" style="padding: 6px 14px; font-size: 13px;">◀ Prev</button>`;
    }
    html += `<span style="margin: 0 10px; font-size: 13px;">Halaman ${currentLogsPage} dari ${totalPages}</span>`;
    if (currentLogsPage < totalPages) {
        html += `<button class="btn-action btn-secondary" onclick="changeLogsPage(${currentLogsPage + 1})" style="padding: 6px 14px; font-size: 13px;">Next ▶</button>`;
    }
    html += '</div>';
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
        'register': '📝',
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
        'forgot_password': '🔐',
        'generate_code': '🔑',
        'delete_code': '🗑️',
        'force_reload_school_config': '🔄',
        'export_school_config': '📤',
        'import_school_config': '📥',
        'reset_all_settings': '⚙️',
        'add_holiday_date': '📅',
        'remove_holiday_date': '🗑️',
        'save_attendance_settings': '⏰',
        'update_profile': '👤',
        'change_password': '🔑',
        'create_test_announcement': '🧪'
    };
    return icons[action] || '📌';
}

function formatActionName(action) {
    const names = {
        'login': 'Login',
        'logout': 'Logout',
        'register': 'Registrasi',
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
        'forgot_password': 'Lupa Password',
        'generate_code': 'Generate Kode',
        'delete_code': 'Hapus Kode',
        'force_reload_school_config': 'Reload Config Sekolah',
        'export_school_config': 'Ekspor Config Sekolah',
        'import_school_config': 'Impor Config Sekolah',
        'reset_all_settings': 'Reset Semua Pengaturan',
        'add_holiday_date': 'Tambah Tanggal Libur',
        'remove_holiday_date': 'Hapus Tanggal Libur',
        'save_attendance_settings': 'Simpan Pengaturan Jam',
        'update_profile': 'Update Profil',
        'change_password': 'Ganti Password',
        'create_test_announcement': 'Test Pengumuman'
    };
    return names[action] || action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
    currentLogsPage = 1;
    logsInitialized = false;
    console.log("🧹 Logs system cleaned up");
}

function refreshLogs() {
    currentLogsPage = 1;
    renderLogsTable();
}

// Setup listener untuk tab switch - agar logs dirender saat tab diaktifkan
function setupLogsTabListener() {
    const originalSwitchTab = window.switchTab;
    if (originalSwitchTab) {
        window.switchTab = function(tabId) {
            originalSwitchTab(tabId);
            if (tabId === 'logs') {
                console.log("📋 Logs tab activated, initializing logs system...");
                setTimeout(() => {
                    if (!logsInitialized) {
                        initLogsSystem();
                    } else {
                        renderLogsTable();
                    }
                }, 100);
            }
        };
    }
}

// Setup data ready listener
function setupLogsDataReadyListener() {
    window.addEventListener('dataReady', () => {
        console.log("📡 dataReady received for logs module");
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer')) {
            if (!logsInitialized) {
                initLogsSystem();
            } else {
                renderLogsTable();
            }
        }
    });
}

// Ekspor ke global
window.initLogsSystem = initLogsSystem;
window.renderLogsTable = renderLogsTable;
window.changeLogsPage = changeLogsPage;
window.cleanupLogsSystem = cleanupLogsSystem;
window.refreshLogs = refreshLogs;

// Inisialisasi listener
setupLogsTabListener();
setupLogsDataReadyListener();

// Jika sudah login dan memiliki akses, inisialisasi
if (typeof currentUser !== 'undefined' && currentUser && 
    (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer')) {
    setTimeout(() => initLogsSystem(), 500);
}

console.log("✅ logs.js V1.2 loaded - Log Activity module ready");