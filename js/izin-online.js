// izin-online.js - VERSION 1.2 (ADD DELETE FEATURE)
// Fitur Izin Online: ajukan izin, upload surat, approve/reject, delete
// ============================================================================

let izinInitialized = false;
let currentIzinList = [];
let currentIzinFilter = 'all'; // all, pending, approved, rejected

// ======================= TAMPILAN TAB IZIN =======================

function renderIzinTab() {
    const tabContainer = document.getElementById('tab-izin');
    if (!tabContainer) {
        console.log('⚠️ tab-izin container tidak ditemukan');
        return;
    }
    
    const isAdminOrGuru = currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer');
    const isSiswa = currentUser && currentUser.role === 'siswa';
    
    let html = `
        <div class="izin-container">
            <div class="izin-header">
                <h3>📝 Izin Online</h3>
                <p class="text-small">Ajukan izin sakit/keperluan keluarga secara online</p>
            </div>
            
            <!-- Tombol Ajukan Izin -->
            <div class="izin-actions">
                <button class="btn-action btn-primary" onclick="openAjukanIzinModal()">
                    ➕ Ajukan Izin Baru
                </button>
                <div class="izin-filter">
                    <button class="filter-btn ${currentIzinFilter === 'all' ? 'active' : ''}" onclick="filterIzinList('all')">Semua</button>
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
    
    // Panggil loadIzinList setelah render
    console.log('📝 renderIzinTab selesai, memuat data izin...');
    loadIzinList();
}

// ======================= LOAD IZIN LIST =======================

async function loadIzinList() {
    const container = document.getElementById('izinListContainer');
    if (!container) {
        console.log('⚠️ izinListContainer tidak ditemukan');
        return;
    }
    
    if (!currentUser) {
        console.log('⚠️ currentUser belum tersedia');
        container.innerHTML = '<div style="text-align:center; padding:40px;">🔐 Silakan login terlebih dahulu</div>';
        return;
    }
    
    console.log('📝 loadIzinList dipanggil, currentUser.role:', currentUser.role);
    
    try {
        // Pastikan db tersedia
        if (typeof db === 'undefined' || !db) {
            console.error('❌ Database tidak tersedia');
            container.innerHTML = '<div style="text-align:center; padding:40px;">❌ Koneksi database error</div>';
            return;
        }
        
        const snapshot = await db.ref('izin').once('value');
        const data = snapshot.val();
        
        console.log('📝 Data izin dari database:', data ? Object.keys(data).length : 0, 'item');
        
        currentIzinList = [];
        if (data) {
            Object.entries(data).forEach(([id, izin]) => {
                currentIzinList.push({ id, ...izin });
            });
        }
        
        // Filter berdasarkan role
        let filteredList = [...currentIzinList];
        
        if (currentUser.role === 'siswa') {
            // Siswa hanya lihat izin sendiri
            filteredList = currentIzinList.filter(izin => izin.studentId == currentUser.fpId);
            console.log('📝 Filter siswa:', currentUser.fpId, 'menampilkan', filteredList.length, 'izin');
        } else if (currentUser.role === 'guru') {
            // Guru lihat semua izin
            console.log('📝 Guru melihat semua izin');
        } else if (currentUser.role === 'admin' || currentUser.role === 'developer') {
            console.log('📝 Admin/Developer melihat semua izin');
        }
        
        // Filter status
        if (currentIzinFilter !== 'all') {
            filteredList = filteredList.filter(izin => izin.status === currentIzinFilter);
            console.log('📝 Filter status:', currentIzinFilter, 'menampilkan', filteredList.length, 'izin');
        }
        
        // Urutkan dari terbaru
        filteredList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        renderIzinList(filteredList);
        
    } catch (error) {
        console.error('❌ Load izin error:', error);
        container.innerHTML = '<div style="text-align:center; padding:40px;">❌ Gagal memuat data izin: ' + (error.message || 'Unknown error') + '</div>';
    }
}

function renderIzinList(izinList) {
    const container = document.getElementById('izinListContainer');
    if (!container) return;
    
    console.log('📝 renderIzinList, jumlah data:', izinList.length);
    
    if (izinList.length === 0) {
        container.innerHTML = `
            <div class="izin-empty">
                <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                <h4>Belum Ada Pengajuan Izin</h4>
                <p class="text-small">Klik tombol "Ajukan Izin Baru" untuk mengajukan izin.</p>
            </div>
        `;
        return;
    }
    
    const isAdminOrGuru = currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer');
    const isSiswa = currentUser && currentUser.role === 'siswa';
    
    let html = '<div class="izin-grid">';
    
    for (const izin of izinList) {
        const statusClass = izin.status === 'approved' ? 'status-approved' : 
                           (izin.status === 'rejected' ? 'status-rejected' : 'status-pending');
        const statusText = izin.status === 'approved' ? '✅ Disetujui' :
                          (izin.status === 'rejected' ? '❌ Ditolak' : '⏳ Menunggu Persetujuan');
        
        const tanggalMulai = formatIndonesianDate(izin.startDate);
        const tanggalSelesai = formatIndonesianDate(izin.endDate);
        
        let attachmentHtml = '';
        if (izin.attachmentUrl && izin.attachmentUrl !== 'null' && izin.attachmentUrl !== 'undefined') {
            attachmentHtml = `
                <div class="izin-attachment">
                    <a href="${izin.attachmentUrl}" target="_blank" class="btn-link">
                        📎 Lihat Lampiran (Surat/Dokumen)
                    </a>
                </div>
            `;
        }
        
        // Tombol aksi untuk Admin/Guru
        let actionButtons = '';
        if (isAdminOrGuru) {
            if (izin.status === 'pending') {
                actionButtons = `
                    <div class="izin-actions-buttons">
                        <button class="btn-action btn-success" onclick="approveIzin('${izin.id}', '${escapeHtml(izin.studentName)}')">✅ Setujui</button>
                        <button class="btn-action btn-danger" onclick="rejectIzin('${izin.id}', '${escapeHtml(izin.studentName)}')">❌ Tolak</button>
                        <button class="btn-action btn-delete" onclick="deleteIzin('${izin.id}', '${escapeHtml(izin.studentName)}')">🗑️ Hapus</button>
                    </div>
                `;
            } else {
                actionButtons = `
                    <div class="izin-actions-buttons">
                        <button class="btn-action btn-delete" onclick="deleteIzin('${izin.id}', '${escapeHtml(izin.studentName)}')">🗑️ Hapus</button>
                    </div>
                `;
            }
        }
        
        // Tombol hapus untuk siswa (hanya izin miliknya sendiri yang status pending)
        if (isSiswa && izin.status === 'pending' && izin.studentId == currentUser.fpId) {
            actionButtons = `
                <div class="izin-actions-buttons">
                    <button class="btn-action btn-delete" onclick="deleteIzin('${izin.id}', '${escapeHtml(izin.studentName)}')">🗑️ Hapus</button>
                </div>
            `;
        }
        
        let alasanPenolakan = '';
        if (izin.status === 'rejected' && (izin.rejectReason || izin.reason)) {
            const reasonText = izin.rejectReason || izin.reason;
            alasanPenolakan = `<div class="izin-reject-reason"><strong>Alasan Ditolak:</strong> ${escapeHtml(reasonText)}</div>`;
        }
        
        html += `
            <div class="izin-card ${statusClass}">
                <div class="izin-card-header">
                    <div class="izin-type">
                        ${izin.type === 'sakit' ? '🤒 Izin Sakit' : '📝 Izin Keperluan'}
                    </div>
                    <div class="izin-status ${statusClass}">${statusText}</div>
                </div>
                <div class="izin-card-body">
                    <div class="izin-student">
                        <strong>👤 ${escapeHtml(izin.studentName)}</strong>
                        <small>Kelas: ${izin.kelas || '-'} | Jurusan: ${izin.jurusan || '-'}</small>
                    </div>
                    <div class="izin-date">
                        📅 ${tanggalMulai} - ${tanggalSelesai}
                    </div>
                    <div class="izin-reason">
                        <strong>Alasan:</strong><br>
                        ${escapeHtml(izin.reason)}
                    </div>
                    ${attachmentHtml}
                    ${alasanPenolakan}
                </div>
                <div class="izin-card-footer">
                    <small>Diajukan: ${formatDate(izin.createdAt)}</small>
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
    
    // Hapus modal lama jika ada
    const existingModal = document.getElementById('modal-ajukan-izin');
    if (existingModal) existingModal.remove();
    
    let modalHtml = `
        <div id="modal-ajukan-izin" class="modal-overlay open">
            <div class="modal-box" style="max-width: 550px;">
                <div class="modal-title">
                    <span>📝 Ajukan Izin</span>
                    <span onclick="closeModal('modal-ajukan-izin')">✖</span>
                </div>
                <div style="padding: 20px;">
                    <form id="formAjukanIzin" onsubmit="submitIzin(event)">
                        <div class="form-group">
                            <label>📋 Jenis Izin</label>
                            <select id="izinType" required>
                                <option value="sakit">🤒 Sakit</option>
                                <option value="keperluan">📝 Keperluan Keluarga</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>📅 Tanggal Mulai</label>
                            <input type="date" id="izinStartDate" required>
                        </div>
                        <div class="form-group">
                            <label>📅 Tanggal Selesai</label>
                            <input type="date" id="izinEndDate" required>
                        </div>
                        <div class="form-group">
                            <label>📝 Alasan / Keterangan</label>
                            <textarea id="izinReason" rows="4" placeholder="Jelaskan alasan izin..." required></textarea>
                        </div>
                        <div class="form-group">
                            <label>📎 Lampiran (Opsional)</label>
                            <input type="file" id="izinAttachment" accept=".pdf,.jpg,.jpeg,.png">
                            <small class="text-small">Format: PDF, JPG, PNG. Maksimal 2MB</small>
                            <div id="attachmentPreview" style="display:none; margin-top:10px;">
                                <span id="attachmentName"></span>
                                <button type="button" class="btn-icon" onclick="clearAttachment()">✖</button>
                            </div>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="btn-cancel" onclick="closeModal('modal-ajukan-izin')">Batal</button>
                            <button type="submit" class="btn-save">📤 Ajukan Izin</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    const startDateInput = document.getElementById('izinStartDate');
    if (startDateInput) startDateInput.value = today;
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const endDateInput = document.getElementById('izinEndDate');
    if (endDateInput) endDateInput.value = tomorrow.toISOString().split('T')[0];
    
    // Attachment preview
    const fileInput = document.getElementById('izinAttachment');
    if (fileInput) {
        fileInput.addEventListener('change', function() {
            const preview = document.getElementById('attachmentPreview');
            const nameSpan = document.getElementById('attachmentName');
            if (this.files && this.files[0]) {
                if (nameSpan) nameSpan.textContent = `📎 ${this.files[0].name}`;
                if (preview) preview.style.display = 'block';
            } else {
                if (preview) preview.style.display = 'none';
            }
        });
    }
}

function clearAttachment() {
    const fileInput = document.getElementById('izinAttachment');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('attachmentPreview');
    if (preview) preview.style.display = 'none';
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
    const originalText = btn ? btn.innerHTML : '📤 Ajukan Izin';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Mengirim...';
    }
    
    try {
        let attachmentUrl = null;
        
        // Upload lampiran jika ada
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            if (file.size > 2 * 1024 * 1024) {
                showToast('Ukuran file maksimal 2MB!', 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
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
            // Untuk guru/admin yang mengajukan atas nama siswa
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
            logActivity('submit_izin', `Ajukan izin ${type}: ${studentName} (${startDate} - ${endDate})`);
        }
        
        closeModal('modal-ajukan-izin');
        
        // Reset filter ke 'all' setelah submit
        currentIzinFilter = 'all';
        loadIzinList();
        
    } catch (error) {
        console.error('Submit izin error:', error);
        showToast('❌ Gagal mengajukan izin: ' + error.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

// ======================= APPROVE / REJECT IZIN =======================

async function approveIzin(izinId, studentName) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        showToast('⛔ Hanya Admin/Guru yang dapat menyetujui izin!', 'error');
        return;
    }
    
    if (!confirm(`Setujui izin untuk ${studentName}?`)) return;
    
    try {
        await db.ref(`izin/${izinId}`).update({
            status: 'approved',
            approvedBy: currentUser.nama || currentUser.email,
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
            logActivity('approve_izin', `Menyetujui izin ${studentName}`);
        }
        
        loadIzinList();
        
    } catch (error) {
        console.error('Approve izin error:', error);
        showToast('❌ Gagal menyetujui izin', 'error');
    }
}

async function rejectIzin(izinId, studentName) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        showToast('⛔ Hanya Admin/Guru yang dapat menolak izin!', 'error');
        return;
    }
    
    const reason = prompt(`Masukkan alasan penolakan izin untuk ${studentName}:`);
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
            rejectedAt: firebase.database.ServerValue.TIMESTAMP,
            updatedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        showToast(`❌ Izin ${studentName} ditolak.`, 'warning');
        
        if (typeof logActivity === 'function') {
            logActivity('reject_izin', `Menolak izin ${studentName}: ${reason}`);
        }
        
        loadIzinList();
        
    } catch (error) {
        console.error('Reject izin error:', error);
        showToast('❌ Gagal menolak izin', 'error');
    }
}

// ======================= DELETE IZIN =======================

async function deleteIzin(izinId, studentName) {
    // Cek permission
    const canDelete = currentUser && (
        currentUser.role === 'admin' || 
        currentUser.role === 'developer' || 
        currentUser.role === 'guru'
    );
    
    // Cek apakah siswa yang punya izin (bisa hapus izin sendiri yang masih pending)
    const izin = currentIzinList.find(i => i.id === izinId);
    const isOwner = currentUser && currentUser.role === 'siswa' && izin && izin.studentId == currentUser.fpId && izin.status === 'pending';
    
    if (!canDelete && !isOwner) {
        showToast('⛔ Anda tidak memiliki izin untuk menghapus data ini!', 'error');
        return;
    }
    
    let confirmMessage = `Hapus pengajuan izin untuk ${studentName}?`;
    if (izin && izin.status !== 'pending') {
        confirmMessage = `Hapus pengajuan izin ${studentName} yang sudah ${izin.status === 'approved' ? 'DISETUJUI' : 'DITOLAK'}?\n\nData ini akan dihapus permanen!`;
    }
    
    if (!confirm(confirmMessage)) return;
    
    try {
        // Hapus data izin
        await db.ref(`izin/${izinId}`).remove();
        
        showToast(`🗑️ Izin ${studentName} berhasil dihapus!`, 'success');
        
        if (typeof logActivity === 'function') {
            logActivity('delete_izin', `Menghapus izin ${studentName} (${izin?.status || 'unknown'})`);
        }
        
        // Refresh daftar izin
        loadIzinList();
        
    } catch (error) {
        console.error('Delete izin error:', error);
        showToast('❌ Gagal menghapus izin: ' + error.message, 'error');
    }
}

// ======================= FILTER IZIN =======================

function filterIzinList(status) {
    console.log('📝 Filter izin:', status);
    currentIzinFilter = status;
    
    // Update tombol filter active state
    const filterBtns = document.querySelectorAll('.izin-filter .filter-btn');
    filterBtns.forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Cari tombol yang sesuai dan tambahkan active
    const activeBtn = Array.from(filterBtns).find(btn => {
        const onclick = btn.getAttribute('onclick');
        return onclick && onclick.includes(`'${status}'`);
    });
    if (activeBtn) activeBtn.classList.add('active');
    
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
    
    // Tambahkan tab izin jika diperlukan
    addIzinTab();
}

function addIzinTab() {
    // Cek apakah tab sudah ada
    if (document.getElementById('tab-izin')) {
        console.log('📝 Tab izin sudah ada');
        return;
    }
    
    // Tambahkan tab button
    const tabsContainer = document.querySelector('.nav-tabs');
    if (tabsContainer) {
        const izinTabBtn = document.createElement('button');
        izinTabBtn.className = 'tab-btn';
        izinTabBtn.setAttribute('onclick', 'switchTab("izin")');
        izinTabBtn.innerHTML = '📝 Izin Online';
        tabsContainer.appendChild(izinTabBtn);
        console.log('📝 Tab button izin ditambahkan');
    }
    
    // Tambahkan tab content
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        const izinContent = document.createElement('div');
        izinContent.id = 'tab-izin';
        izinContent.className = 'tab-content';
        dashboardSection.appendChild(izinContent);
        console.log('📝 Tab content izin ditambahkan');
    }
}

// Tambahkan CSS untuk filter button active state dan tombol hapus
const style = document.createElement('style');
style.textContent = `
    .izin-filter .filter-btn.active {
        background: #00bcd4;
        color: white;
        border-color: #00bcd4;
    }
    .izin-filter .filter-btn {
        background: var(--bg-input);
        border: 1px solid var(--border);
        padding: 8px 16px;
        border-radius: 30px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .izin-filter .filter-btn:hover {
        background: var(--primary);
        color: white;
    }
    .izin-card {
        background: var(--bg-card);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: var(--shadow);
        transition: transform 0.2s;
        border: 1px solid var(--border);
    }
    .izin-card:hover {
        transform: translateY(-2px);
    }
    .izin-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        gap: 20px;
    }
    .izin-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--bg-hover);
        border-bottom: 1px solid var(--border);
    }
    .izin-card-body {
        padding: 16px;
    }
    .izin-card-footer {
        padding: 12px 16px;
        background: var(--bg-hover);
        border-top: 1px solid var(--border);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
    }
    .izin-status {
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 600;
    }
    .status-pending {
        background: #ff9800;
        color: white;
    }
    .status-approved {
        background: #4caf50;
        color: white;
    }
    .status-rejected {
        background: #f44336;
        color: white;
    }
    .izin-actions-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }
    .btn-action.btn-success {
        background: #4caf50;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-action.btn-success:hover {
        background: #45a049;
        transform: scale(1.02);
    }
    .btn-action.btn-danger {
        background: #f44336;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-action.btn-danger:hover {
        background: #d32f2f;
        transform: scale(1.02);
    }
    .btn-action.btn-delete {
        background: #757575;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .btn-action.btn-delete:hover {
        background: #616161;
        transform: scale(1.02);
    }
    .izin-student {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-bottom: 12px;
    }
    .izin-date {
        margin-bottom: 12px;
        font-size: 0.9rem;
    }
    .izin-reason {
        margin-bottom: 12px;
        line-height: 1.5;
    }
    .izin-attachment {
        margin-top: 8px;
    }
    .izin-attachment .btn-link {
        color: #00bcd4;
        text-decoration: none;
        font-size: 0.85rem;
    }
    .izin-attachment .btn-link:hover {
        text-decoration: underline;
    }
    .izin-reject-reason {
        margin-top: 12px;
        padding: 8px 12px;
        background: rgba(244, 67, 54, 0.1);
        border-radius: 8px;
        font-size: 0.85rem;
        border-left: 3px solid #f44336;
    }
    .izin-empty {
        text-align: center;
        padding: 60px 20px;
        background: var(--bg-card);
        border-radius: 20px;
        border: 1px solid var(--border);
    }
    @media (max-width: 768px) {
        .izin-grid {
            grid-template-columns: 1fr;
        }
        .izin-actions {
            flex-direction: column;
        }
        .izin-filter {
            flex-wrap: wrap;
            justify-content: center;
        }
    }
`;
document.head.appendChild(style);

// Ekspor ke global
window.initIzinOnline = initIzinOnline;
window.renderIzinTab = renderIzinTab;
window.loadIzinList = loadIzinList;
window.openAjukanIzinModal = openAjukanIzinModal;
window.submitIzin = submitIzin;
window.approveIzin = approveIzin;
window.rejectIzin = rejectIzin;
window.deleteIzin = deleteIzin;
window.filterIzinList = filterIzinList;
window.clearAttachment = clearAttachment;

console.log('✅ izin-online.js v1.2 loaded (with delete feature)');