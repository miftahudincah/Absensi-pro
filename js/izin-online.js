// izin-online.js - VERSION 2.0 (DENGAN ROLE BARU: WAKIL KEPALA SEKOLAH & STAFF TU)
// Fitur Izin Online: ajukan izin, upload surat, approve/reject
// Role yang didukung:
// - Developer: akses penuh (approve/reject semua)
// - Admin (Kepala Sekolah): akses penuh (approve/reject semua)
// - Wakil Kepala Sekolah: akses penuh (approve/reject semua)
// - Staff TU: akses baca (dapat melihat semua izin, TIDAK bisa approve/reject)
// - Guru: akses penuh (approve/reject semua)
// - Siswa: hanya dapat mengajukan dan melihat izin sendiri
// ============================================================================

let izinInitialized = false;
let currentIzinList = [];
let currentIzinFilter = 'all'; // all, pending, approved, rejected

// ======================= ROLE HELPER FUNCTIONS ========================

/**
 * Mendapatkan display name role
 */
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

/**
 * Mendapatkan icon untuk role
 */
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
 * Cek apakah user dapat menyetujui/menolak izin
 * - Staff TU TIDAK bisa approve/reject (hanya baca)
 * - Guru/Wakil/Admin/Developer bisa approve/reject
 */
function canApproveIzin(role) {
    const approveRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
    return approveRoles.includes(role);
}

/**
 * Cek apakah user dapat melihat semua izin
 * - Staff TU: dapat melihat semua izin (read-only)
 * - Guru/Wakil/Admin/Developer: dapat melihat semua izin
 * - Siswa: hanya izin sendiri
 */
function canViewAllIzin(role) {
    const allAccessRoles = ['admin', 'developer', 'wakil_kepala', 'staff_tu', 'guru'];
    return allAccessRoles.includes(role);
}

/**
 * Mendapatkan pesan akses berdasarkan role
 */
function getIzinAccessMessage(role) {
    if (role === 'staff_tu') {
        return "Staff TU dapat melihat semua pengajuan izin namun tidak dapat menyetujui/menolak.";
    }
    if (role === 'siswa') {
        return "Siswa hanya dapat melihat dan mengajukan izin sendiri.";
    }
    return "";
}

// ======================= TAMPILAN TAB IZIN =======================

function renderIzinTab() {
    const tabContainer = document.getElementById('tab-izin');
    if (!tabContainer) return;
    
    const canApprove = canApproveIzin(currentUser?.role);
    const canViewAll = canViewAllIzin(currentUser?.role);
    const isSiswa = currentUser && currentUser.role === 'siswa';
    const roleDisplay = getRoleDisplayName(currentUser?.role);
    const accessMessage = getIzinAccessMessage(currentUser?.role);
    
    let html = `
        <div class="izin-container">
            <div class="izin-header">
                <h3>📝 Izin Online</h3>
                <p class="text-small">Ajukan izin sakit/keperluan keluarga secara online</p>
                ${accessMessage ? `<div class="info-banner" style="background: var(--bg-hover); padding: 8px 12px; border-radius: 8px; margin-top: 8px; font-size: 12px; border-left: 3px solid #00bcd4;">
                    <span>ℹ️ ${accessMessage}</span>
                </div>` : ''}
            </div>
            
            <!-- Tombol Ajukan Izin (hanya untuk siswa dan guru yang bisa mengajukan) -->
            <div class="izin-actions">
                <button class="btn-action btn-primary" onclick="openAjukanIzinModal()">
                    ➕ Ajukan Izin Baru
                </button>
                <div class="izin-filter">
                    <button class="filter-btn ${currentIzinFilter === 'all' ? 'active' : ''}" onclick="filterIzinList('all')">📋 Semua</button>
                    <button class="filter-btn ${currentIzinFilter === 'pending' ? 'active' : ''}" onclick="filterIzinList('pending')">⏳ Menunggu</button>
                    <button class="filter-btn ${currentIzinFilter === 'approved' ? 'active' : ''}" onclick="filterIzinList('approved')">✅ Disetujui</button>
                    <button class="filter-btn ${currentIzinFilter === 'rejected' ? 'active' : ''}" onclick="filterIzinList('rejected')">❌ Ditolak</button>
                </div>
            </div>
            
            <!-- Daftar Izin -->
            <div id="izinListContainer" class="izin-list">
                <div class="loading-spinner-small" style="text-align: center; padding: 40px;">⏳ Memuat data izin...</div>
            </div>
        </div>
    `;
    
    tabContainer.innerHTML = html;
    loadIzinList();
}

// ======================= LOAD IZIN LIST =======================

async function loadIzinList() {
    const container = document.getElementById('izinListContainer');
    if (!container) return;
    
    try {
        const snapshot = await db.ref('izin').once('value');
        const data = snapshot.val();
        
        currentIzinList = [];
        if (data) {
            Object.entries(data).forEach(([id, izin]) => {
                currentIzinList.push({ id, ...izin });
            });
        }
        
        // Filter berdasarkan role
        let filteredList = currentIzinList;
        
        if (currentUser.role === 'siswa') {
            // Siswa hanya lihat izin sendiri
            filteredList = currentIzinList.filter(izin => izin.studentId == currentUser.fpId || izin.studentId == currentUser.uid);
        }
        // Staff TU, Guru, Wakil, Admin, Developer: lihat semua izin
        
        // Filter status
        if (currentIzinFilter !== 'all') {
            filteredList = filteredList.filter(izin => izin.status === currentIzinFilter);
        }
        
        // Urutkan dari terbaru
        filteredList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        renderIzinList(filteredList);
        
    } catch (error) {
        console.error('Load izin error:', error);
        container.innerHTML = '<div style="text-align:center; padding:40px;">❌ Gagal memuat data izin</div>';
    }
}

function renderIzinList(izinList) {
    const container = document.getElementById('izinListContainer');
    if (!container) return;
    
    if (izinList.length === 0) {
        container.innerHTML = `
            <div class="izin-empty" style="text-align: center; padding: 60px 20px;">
                <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                <h4>Belum Ada Pengajuan Izin</h4>
                <p class="text-small">Klik tombol "Ajukan Izin Baru" untuk mengajukan izin.</p>
            </div>
        `;
        return;
    }
    
    const canApprove = canApproveIzin(currentUser?.role);
    const canViewAll = canViewAllIzin(currentUser?.role);
    const isStaffTU = currentUser?.role === 'staff_tu';
    
    let html = '<div class="izin-grid" style="display: flex; flex-direction: column; gap: 16px;">';
    
    for (const izin of izinList) {
        const statusClass = izin.status === 'approved' ? 'status-approved' : 
                           (izin.status === 'rejected' ? 'status-rejected' : 'status-pending');
        const statusText = izin.status === 'approved' ? '✅ Disetujui' :
                          (izin.status === 'rejected' ? '❌ Ditolak' : '⏳ Menunggu Persetujuan');
        
        const tanggalMulai = formatIndonesianDate(izin.startDate);
        const tanggalSelesai = formatIndonesianDate(izin.endDate);
        
        let attachmentHtml = '';
        if (izin.attachmentUrl) {
            attachmentHtml = `
                <div class="izin-attachment" style="margin-top: 8px;">
                    <a href="${izin.attachmentUrl}" target="_blank" class="btn-link" style="color: #00bcd4; text-decoration: none;">
                        📎 Lihat Lampiran (Surat/Dokumen)
                    </a>
                </div>
            `;
        }
        
        // Action buttons - hanya untuk role yang bisa approve (Staff TU tidak bisa)
        let actionButtons = '';
        if (canApprove && izin.status === 'pending') {
            actionButtons = `
                <div class="izin-actions-buttons" style="display: flex; gap: 10px; margin-top: 12px;">
                    <button class="btn-action btn-success" onclick="approveIzin('${izin.id}', '${escapeHtml(izin.studentName)}')" style="padding: 6px 16px;">✅ Setujui</button>
                    <button class="btn-action btn-danger" onclick="rejectIzin('${izin.id}', '${escapeHtml(izin.studentName)}')" style="padding: 6px 16px;">❌ Tolak</button>
                </div>
            `;
        } else if (isStaffTU && izin.status === 'pending') {
            actionButtons = `
                <div class="izin-actions-buttons" style="margin-top: 12px;">
                    <span class="badge" style="background: #607d8b; padding: 4px 12px; border-radius: 20px; font-size: 11px;">🔒 Staff TU tidak dapat approve/reject</span>
                </div>
            `;
        }
        
        let approvalInfo = '';
        if (izin.status === 'approved' && izin.approvedBy) {
            approvalInfo = `<div class="izin-approval-info" style="font-size: 11px; color: #4caf50; margin-top: 8px;">✅ Disetujui oleh: ${escapeHtml(izin.approvedBy)}</div>`;
        } else if (izin.status === 'rejected' && izin.rejectedBy) {
            approvalInfo = `<div class="izin-approval-info" style="font-size: 11px; color: #f44336; margin-top: 8px;">❌ Ditolak oleh: ${escapeHtml(izin.rejectedBy)}</div>`;
        }
        
        let alasanPenolakan = '';
        if (izin.status === 'rejected' && izin.reason) {
            alasanPenolakan = `<div class="izin-reject-reason" style="background: rgba(244, 67, 54, 0.1); padding: 8px; border-radius: 8px; margin-top: 8px;"><strong>Alasan Ditolak:</strong> ${escapeHtml(izin.reason)}</div>`;
        }
        
        // Role badge untuk pengaju
        const submittedByRole = izin.submittedByRole || 'siswa';
        const roleBadge = getRoleIcon(submittedByRole) + ' ' + getRoleDisplayName(submittedByRole);
        
        html += `
            <div class="izin-card ${statusClass}" style="background: var(--bg-card); border-radius: 16px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div class="izin-card-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px;">
                    <div class="izin-type">
                        <span style="font-weight: bold;">${izin.type === 'sakit' ? '🤒 Izin Sakit' : '📝 Izin Keperluan'}</span>
                        <span style="font-size: 11px; background: var(--bg-hover); padding: 2px 8px; border-radius: 12px; margin-left: 8px;">${roleBadge}</span>
                    </div>
                    <div class="izin-status ${statusClass}">
                        <span class="badge ${statusClass}" style="padding: 4px 12px; border-radius: 20px; font-size: 12px;">${statusText}</span>
                    </div>
                </div>
                <div class="izin-card-body">
                    <div class="izin-student" style="margin-bottom: 8px;">
                        <strong>👤 ${escapeHtml(izin.studentName)}</strong>
                        <small style="display: block; color: var(--text-muted);">Kelas: ${izin.kelas || '-'} | Jurusan: ${izin.jurusan || '-'}</small>
                    </div>
                    <div class="izin-date" style="margin-bottom: 8px;">
                        📅 ${tanggalMulai} - ${tanggalSelesai}
                    </div>
                    <div class="izin-reason" style="margin-bottom: 8px;">
                        <strong>Alasan:</strong><br>
                        <span style="white-space: pre-wrap;">${escapeHtml(izin.reason)}</span>
                    </div>
                    ${attachmentHtml}
                    ${alasanPenolakan}
                    ${approvalInfo}
                </div>
                <div class="izin-card-footer" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
                    <small style="color: var(--text-muted);">Diajukan: ${formatDate(izin.createdAt)}</small>
                    ${actionButtons}
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    container.innerHTML = html;
}

// ======================= AJUKAN IZIN =======================

function openAjukanIzinModal() {
    if (!currentUser) {
        showToast('Anda harus login!', 'error');
        return;
    }
    
    let modalHtml = `
        <div id="modal-ajukan-izin" class="modal-overlay open" style="display: flex; align-items: center; justify-content: center; z-index: 10000;">
            <div class="modal-box" style="max-width: 550px; background: var(--bg-card); border-radius: 20px; width: 90%;">
                <div class="modal-title" style="display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; border-bottom: 1px solid var(--border);">
                    <span>📝 Ajukan Izin</span>
                    <span onclick="closeModal('modal-ajukan-izin')" style="cursor: pointer; font-size: 24px;">✖</span>
                </div>
                <div style="padding: 20px;">
                    <form id="formAjukanIzin" onsubmit="submitIzin(event)">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label>📋 Jenis Izin</label>
                            <select id="izinType" required style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-primary);">
                                <option value="sakit">🤒 Sakit</option>
                                <option value="keperluan">📝 Keperluan Keluarga</option>
                            </select>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label>📅 Tanggal Mulai</label>
                            <input type="date" id="izinStartDate" required style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-primary);">
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label>📅 Tanggal Selesai</label>
                            <input type="date" id="izinEndDate" required style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-primary);">
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label>📝 Alasan / Keterangan</label>
                            <textarea id="izinReason" rows="4" placeholder="Jelaskan alasan izin..." required style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-primary);"></textarea>
                        </div>
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label>📎 Lampiran (Opsional)</label>
                            <input type="file" id="izinAttachment" accept=".pdf,.jpg,.jpeg,.png" style="width: 100%; padding: 8px;">
                            <small class="text-small" style="color: var(--text-muted);">Format: PDF, JPG, PNG. Maksimal 2MB</small>
                            <div id="attachmentPreview" style="display:none; margin-top:10px; padding: 8px; background: var(--bg-hover); border-radius: 8px;">
                                <span id="attachmentName"></span>
                                <button type="button" class="btn-icon" onclick="clearAttachment()" style="background: transparent; border: none; cursor: pointer; margin-left: 8px;">✖</button>
                            </div>
                        </div>
                        <div class="modal-actions" style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--border);">
                            <button type="button" class="btn-cancel" onclick="closeModal('modal-ajukan-izin')" style="padding: 8px 20px; border-radius: 20px; border: 1px solid var(--border); background: transparent; cursor: pointer;">Batal</button>
                            <button type="submit" class="btn-save" style="padding: 8px 20px; border-radius: 20px; background: #4caf50; border: none; color: white; cursor: pointer;">📤 Ajukan Izin</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('modal-ajukan-izin');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('izinStartDate').value = today;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('izinEndDate').value = tomorrow.toISOString().split('T')[0];
    
    // Attachment preview
    const fileInput = document.getElementById('izinAttachment');
    fileInput.addEventListener('change', function() {
        const preview = document.getElementById('attachmentPreview');
        const nameSpan = document.getElementById('attachmentName');
        if (this.files && this.files[0]) {
            nameSpan.textContent = `📎 ${this.files[0].name}`;
            preview.style.display = 'block';
        } else {
            preview.style.display = 'none';
        }
    });
}

function clearAttachment() {
    const fileInput = document.getElementById('izinAttachment');
    fileInput.value = '';
    document.getElementById('attachmentPreview').style.display = 'none';
}

async function submitIzin(event) {
    event.preventDefault();
    
    if (!currentUser) {
        showToast('Anda harus login!', 'error');
        return;
    }
    
    const type = document.getElementById('izinType').value;
    const startDate = document.getElementById('izinStartDate').value;
    const endDate = document.getElementById('izinEndDate').value;
    const reason = document.getElementById('izinReason').value.trim();
    const fileInput = document.getElementById('izinAttachment');
    
    if (!startDate || !endDate || !reason) {
        showToast('Semua field wajib diisi!', 'error');
        return;
    }
    
    if (startDate > endDate) {
        showToast('Tanggal selesai harus lebih besar dari tanggal mulai!', 'error');
        return;
    }
    
    const btn = document.querySelector('#formAjukanIzin .btn-save');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Mengirim...';
    
    try {
        let attachmentUrl = null;
        
        // Upload lampiran jika ada
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            if (file.size > 2 * 1024 * 1024) {
                showToast('Ukuran file maksimal 2MB!', 'error');
                btn.disabled = false;
                btn.innerHTML = originalText;
                return;
            }
            
            if (typeof uploadWithFallback === 'function') {
                const result = await uploadWithFallback(file, 'izin');
                attachmentUrl = result.url;
            } else {
                console.warn('uploadWithFallback not available');
            }
        }
        
        // Data siswa
        let studentId, studentName, kelas, jurusan;
        
        if (currentUser.role === 'siswa') {
            studentId = currentUser.fpId;
            studentName = currentUser.nama;
            kelas = currentUser.kelas;
            jurusan = currentUser.jurusan;
        } else {
            // Untuk guru/staff yang mengajukan atas nama (misalnya untuk siswa lain)
            studentId = currentUser.fpId || currentUser.uid;
            studentName = currentUser.nama;
            kelas = currentUser.kelas || '-';
            jurusan = currentUser.jurusan || '-';
        }
        
        const izinData = {
            studentId: studentId,
            studentName: studentName,
            kelas: kelas,
            jurusan: jurusan,
            type: type,
            startDate: startDate,
            endDate: endDate,
            reason: reason,
            attachmentUrl: attachmentUrl,
            status: 'pending',
            submittedBy: currentUser.nama || currentUser.email,
            submittedByRole: currentUser.role,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        await db.ref('izin').push(izinData);
        
        showToast('✅ Izin berhasil diajukan! Menunggu persetujuan.', 'success');
        
        if (typeof logActivity === 'function') {
            logActivity('submit_izin', `Ajukan izin ${type}: ${studentName} (${startDate} - ${endDate}) oleh ${getRoleDisplayName(currentUser.role)}`);
        }
        
        closeModal('modal-ajukan-izin');
        loadIzinList();
        
    } catch (error) {
        console.error('Submit izin error:', error);
        showToast('❌ Gagal mengajukan izin: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ======================= APPROVE / REJECT IZIN =======================

async function approveIzin(izinId, studentName) {
    if (!canApproveIzin(currentUser?.role)) {
        const roleDisplay = getRoleDisplayName(currentUser?.role);
        showToast(`⛔ ${roleDisplay} tidak dapat menyetujui izin! Hanya Guru, Wakil Kepala Sekolah, Kepala Sekolah, dan Developer yang dapat menyetujui.`, 'error');
        return;
    }
    
    if (!confirm(`✅ Setujui izin untuk ${studentName}?`)) return;
    
    try {
        await db.ref(`izin/${izinId}`).update({
            status: 'approved',
            approvedBy: currentUser.nama || currentUser.email,
            approvedByRole: currentUser.role,
            approvedAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        showToast(`✅ Izin ${studentName} disetujui!`, 'success');
        
        // Kirim notifikasi WhatsApp
        const izin = currentIzinList.find(i => i.id === izinId);
        if (izin && typeof sendIzinApprovedNotification === 'function') {
            await sendIzinApprovedNotification(izin.studentId, studentName, izin.type, izin.startDate);
        }
        
        if (typeof logActivity === 'function') {
            logActivity('approve_izin', `Menyetujui izin ${studentName} oleh ${getRoleDisplayName(currentUser.role)}`);
        }
        
        loadIzinList();
        
    } catch (error) {
        console.error('Approve izin error:', error);
        showToast('❌ Gagal menyetujui izin', 'error');
    }
}

async function rejectIzin(izinId, studentName) {
    if (!canApproveIzin(currentUser?.role)) {
        const roleDisplay = getRoleDisplayName(currentUser?.role);
        showToast(`⛔ ${roleDisplay} tidak dapat menolak izin! Hanya Guru, Wakil Kepala Sekolah, Kepala Sekolah, dan Developer yang dapat menolak.`, 'error');
        return;
    }
    
    const reason = prompt(`❌ Masukkan alasan penolakan izin untuk ${studentName}:`);
    if (reason === null) return;
    if (!reason.trim()) {
        showToast('Alasan penolakan wajib diisi!', 'error');
        return;
    }
    
    try {
        await db.ref(`izin/${izinId}`).update({
            status: 'rejected',
            rejectReason: reason,
            rejectedBy: currentUser.nama || currentUser.email,
            rejectedByRole: currentUser.role,
            rejectedAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        showToast(`❌ Izin ${studentName} ditolak.`, 'warning');
        
        if (typeof logActivity === 'function') {
            logActivity('reject_izin', `Menolak izin ${studentName}: ${reason} oleh ${getRoleDisplayName(currentUser.role)}`);
        }
        
        loadIzinList();
        
    } catch (error) {
        console.error('Reject izin error:', error);
        showToast('❌ Gagal menolak izin', 'error');
    }
}

function filterIzinList(status) {
    currentIzinFilter = status;
    
    // Update active class pada filter buttons
    document.querySelectorAll('.izin-filter .filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(status === 'all' ? 'Semua' : 
            (status === 'pending' ? 'Menunggu' : 
             (status === 'approved' ? 'Disetujui' : 'Ditolak')))) {
            btn.classList.add('active');
        }
    });
    
    loadIzinList();
}

// ======================= UTILITY =======================

function formatIndonesianDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parts[2]} ${bulan[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= INISIALISASI =======================

function initIzinOnline() {
    if (izinInitialized) return;
    izinInitialized = true;
    
    console.log('📝 Izin Online system initialized');
    addIzinTab();
}

function addIzinTab() {
    if (document.getElementById('tab-izin')) return;
    
    // Tambahkan tab button ke dropdown menu
    const dropdownMainContent = document.getElementById('dropdownMainContent');
    if (dropdownMainContent) {
        const existingBtn = Array.from(dropdownMainContent.children).find(btn => btn.innerHTML === '📝 Izin Online');
        if (!existingBtn) {
            const izinBtn = document.createElement('button');
            izinBtn.setAttribute('onclick', "switchTab('izin'); closeAllDropdowns()");
            izinBtn.innerHTML = '📝 Izin Online';
            
            // Cari posisi setelah Absensi Staff atau sebelum Panduan
            const guideBtn = Array.from(dropdownMainContent.children).find(btn => btn.textContent.includes('Panduan'));
            if (guideBtn) {
                dropdownMainContent.insertBefore(izinBtn, guideBtn);
            } else {
                dropdownMainContent.appendChild(izinBtn);
            }
            console.log("✅ Izin Online button added to dropdown");
        }
    }
    
    // Tambahkan tab content
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && !document.getElementById('tab-izin')) {
        const izinContent = document.createElement('div');
        izinContent.id = 'tab-izin';
        izinContent.className = 'tab-content';
        dashboardSection.appendChild(izinContent);
        console.log("✅ Izin Online tab content added");
    }
}

// Override switchTab untuk render izin
const originalSwitchTabForIzin = window.switchTab;
if (originalSwitchTabForIzin) {
    window.switchTab = function(tabId) {
        originalSwitchTabForIzin(tabId);
        if (tabId === 'izin') {
            setTimeout(() => renderIzinTab(), 100);
        }
    };
} else {
    window.switchTab = function(tabId) {
        if (tabId === 'izin') {
            setTimeout(() => renderIzinTab(), 100);
        }
    };
}

// ======================= EKSPOR KE GLOBAL =======================
window.initIzinOnline = initIzinOnline;
window.renderIzinTab = renderIzinTab;
window.loadIzinList = loadIzinList;
window.openAjukanIzinModal = openAjukanIzinModal;
window.submitIzin = submitIzin;
window.approveIzin = approveIzin;
window.rejectIzin = rejectIzin;
window.filterIzinList = filterIzinList;
window.clearAttachment = clearAttachment;
window.getRoleDisplayName = getRoleDisplayName;
window.getRoleIcon = getRoleIcon;
window.canApproveIzin = canApproveIzin;
window.canViewAllIzin = canViewAllIzin;

console.log("✅ izin-online.js V2.0 loaded - Izin Online dengan role: Developer, Kepala Sekolah, Wakil Kepala Sekolah, Staff TU (baca saja), Guru, Siswa");