// izin-online.js - VERSION 1.0
// Fitur Izin Online: ajukan izin, upload surat, approve/reject
// ============================================================================

let izinInitialized = false;
let currentIzinList = [];
let currentIzinFilter = 'all'; // all, pending, approved, rejected

// ======================= TAMPILAN TAB IZIN =======================

function renderIzinTab() {
    const tabContainer = document.getElementById('tab-izin');
    if (!tabContainer) return;
    
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
            filteredList = currentIzinList.filter(izin => izin.studentId == currentUser.fpId);
        } else if (currentUser.role === 'guru') {
            // Guru lihat izin kelasnya (jika ada filter kelas nanti)
            // Untuk sekarang lihat semua
            filteredList = currentIzinList;
        }
        
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
            <div class="izin-empty">
                <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                <h4>Belum Ada Pengajuan Izin</h4>
                <p class="text-small">Klik tombol "Ajukan Izin Baru" untuk mengajukan izin.</p>
            </div>
        `;
        return;
    }
    
    const isAdminOrGuru = currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer');
    
    let html = '<div class="izin-grid">';
    
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
                <div class="izin-attachment">
                    <a href="${izin.attachmentUrl}" target="_blank" class="btn-link">
                        📎 Lihat Lampiran (Surat/Dokumen)
                    </a>
                </div>
            `;
        }
        
        let actionButtons = '';
        if (isAdminOrGuru && izin.status === 'pending') {
            actionButtons = `
                <div class="izin-actions-buttons">
                    <button class="btn-action btn-success" onclick="approveIzin('${izin.id}', '${escapeHtml(izin.studentName)}')">✅ Setujui</button>
                    <button class="btn-action btn-danger" onclick="rejectIzin('${izin.id}', '${escapeHtml(izin.studentName)}')">❌ Tolak</button>
                </div>
            `;
        }
        
        let alasanPenolakan = '';
        if (izin.status === 'rejected' && izin.reason) {
            alasanPenolakan = `<div class="izin-reject-reason"><strong>Alasan Ditolak:</strong> ${escapeHtml(izin.reason)}</div>`;
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
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru')) {
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
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru')) {
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
            reason: reason,
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

function filterIzinList(status) {
    currentIzinFilter = status;
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
    
    // Tambahkan tab izin
    addIzinTab();
}

function addIzinTab() {
    // Cek apakah tab sudah ada
    if (document.getElementById('tab-izin')) return;
    
    // Tambahkan tab button
    const tabsContainer = document.querySelector('.nav-tabs');
    if (tabsContainer) {
        const izinTabBtn = document.createElement('button');
        izinTabBtn.className = 'tab-btn';
        izinTabBtn.setAttribute('onclick', 'switchTab("izin")');
        izinTabBtn.innerHTML = '📝 Izin Online';
        tabsContainer.appendChild(izinTabBtn);
    }
    
    // Tambahkan tab content
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection) {
        const izinContent = document.createElement('div');
        izinContent.id = 'tab-izin';
        izinContent.className = 'tab-content';
        dashboardSection.appendChild(izinContent);
    }
}

// Override switchTab untuk render izin
const originalSwitchTabForIzin = window.switchTab;
if (originalSwitchTabForIzin) {
    window.switchTab = function(tabId) {
        originalSwitchTabForIzin(tabId);
        if (tabId === 'izin') {
            renderIzinTab();
        }
    };
}

// Ekspor ke global
window.initIzinOnline = initIzinOnline;
window.renderIzinTab = renderIzinTab;
window.loadIzinList = loadIzinList;
window.openAjukanIzinModal = openAjukanIzinModal;
window.submitIzin = submitIzin;
window.approveIzin = approveIzin;
window.rejectIzin = rejectIzin;
window.filterIzinList = filterIzinList;
window.clearAttachment = clearAttachment;

console.log('✅ izin-online.js loaded');
