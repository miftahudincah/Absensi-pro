// staff.js - VERSION 1.0
// Manajemen Data Guru/Karyawan
// ============================================================================

let staffDataReadyListenerAdded = false;
let staffTabActive = false;

// Cache untuk foto staff
const staffPhotoCache = new Map();

// ======================= CEK AKSES ========================
function canManageStaff() {
    if (!currentUser) return false;
    // Hanya admin, guru, dan developer yang dapat mengelola staff
    return (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer');
}

// ======================= FUNGSI FOTO STAFF ========================

function getStaffPhotoUrl(staffId, staffName) {
    if (!staffId) {
        const initial = staffName ? staffName.charAt(0).toUpperCase() : 'G';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=ff9800&color=fff&size=100&bold=true`;
    }
    
    if (staffPhotoCache.has(staffId)) {
        return staffPhotoCache.get(staffId);
    }
    
    // Cari user auth yang memiliki staffId
    const userAuth = dbData?.users_auth?.find(u => u.staffId == staffId || u.uid == staffId);
    
    let photoUrl;
    if (userAuth && userAuth.photoUrl && userAuth.photoUrl !== 'null' && userAuth.photoUrl !== 'undefined') {
        photoUrl = userAuth.photoUrl;
    } else {
        const initial = staffName ? staffName.charAt(0).toUpperCase() : 'G';
        photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=ff9800&color=fff&size=100&bold=true`;
    }
    
    staffPhotoCache.set(staffId, photoUrl);
    return photoUrl;
}

// ======================= RENDER TABEL STAFF ========================

function renderStaffTable() {
    console.log("👥 renderStaffTable dipanggil");
    
    let tbody = document.getElementById('tbody-staff');
    if (!tbody) {
        console.warn("tbody-staff not found, attempting to create...");
        const tabStaff = document.getElementById('tab-staff');
        if (tabStaff) {
            const tableContainer = tabStaff.querySelector('.table-container');
            if (tableContainer) {
                let table = tableContainer.querySelector('table');
                if (!table) {
                    table = document.createElement('table');
                    table.innerHTML = `
                        <thead>
                            <tr>
                                <th>Foto</th>
                                <th>ID</th>
                                <th>Nama</th>
                                <th>Jabatan</th>
                                <th>Departemen</th>
                                <th>No. HP</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff"></tbody>
                    `;
                    tableContainer.appendChild(table);
                    console.log("staff.js: Created table dynamically");
                }
                tbody = document.getElementById('tbody-staff');
                if (!tbody) {
                    tbody = table.querySelector('tbody');
                    if (tbody) tbody.id = 'tbody-staff';
                }
            }
        }
    }
    
    if (!tbody) {
        console.error("❌ tbody-staff not found after retry");
        return;
    }
    
    // Ambil data staff dari database
    db.ref('staff').once('value', (snapshot) => {
        const data = snapshot.val();
        const staffList = [];
        
        if (data) {
            Object.keys(data).forEach(key => {
                staffList.push({ id: key, ...data[key] });
            });
        }
        
        staffList.sort((a, b) => a.id - b.id);
        
        if (staffList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px;">📭 Belum ada data guru/karyawan. Silakan tambah melalui form di atas.<\/td><\/tr>`;
            updateStaffStatistics([]);
            return;
        }
        
        const canEdit = canManageStaff();
        
        tbody.innerHTML = '';
        
        for (const staff of staffList) {
            const photoUrl = getStaffPhotoUrl(staff.id, staff.nama);
            const initial = staff.nama ? staff.nama.charAt(0).toUpperCase() : 'G';
            
            // Cek apakah staff memiliki akun user
            const hasAccount = dbData.users_auth?.some(u => u.staffId == staff.id || u.email === staff.email);
            const accountBadge = hasAccount 
                ? '<span class="badge-account" style="background:#4caf50;">✓ Berakun</span>' 
                : '<span class="badge-no-account" style="background:#ff9800;">❌ Belum Berakun</span>';
            
            let actionButtons = '';
            if (canEdit) {
                actionButtons = `
                    <td style="white-space: nowrap;">
                        <button class="btn-icon edit" onclick="editStaff('${staff.id}')" title="Edit">✏️</button>
                        <button class="btn-icon delete" onclick="deleteStaff('${staff.id}', '${escapeHtmlStaff(staff.nama)}')" title="Hapus">🗑️</button>
                        ${!hasAccount ? `<button class="btn-icon" onclick="createStaffUserAccount('${staff.id}', '${escapeHtmlStaff(staff.nama)}', '${staff.email || ''}')" title="Buat Akun User" style="color:#2196f3;">👤</button>` : ''}
                    </td>
                `;
            } else {
                actionButtons = '<td style="display:none;"></td>';
            }
            
            tbody.innerHTML += `
                <tr data-id="${staff.id}">
                    <td style="text-align:center;">
                        <img src="${photoUrl}" 
                             class="staff-avatar" 
                             style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;"
                             onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff&size=100&bold=true'"
                             onclick="showStaffPhotoModal('${staff.id}', '${escapeHtmlStaff(staff.nama)}', this.src)">
                    </td>
                    <td><strong>${staff.id}</strong></td>
                    <td>${escapeHtmlStaff(staff.nama)} ${accountBadge}</td>
                    <td>${staff.jabatan || '-'}</td>
                    <td>${staff.departemen || '-'}</td>
                    <td>${staff.noHp || '-'}</td>
                    ${actionButtons}
                </tr>
            `;
        }
        
        updateStaffStatistics(staffList);
        console.log(`✅ renderStaffTable selesai, ${staffList.length} staff ditampilkan`);
    });
}

function updateStaffStatistics(staffList) {
    let statsContainer = document.getElementById('staffStats');
    if (!statsContainer) {
        const controlsBar = document.querySelector('#tab-staff .controls-bar:first-child');
        if (controlsBar) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'staffStats';
            statsContainer.style.marginBottom = '10px';
            controlsBar.insertAdjacentElement('afterend', statsContainer);
        } else return;
    }
    
    const total = staffList.length;
    const withAccount = dbData.users_auth?.filter(u => u.staffId && staffList.some(s => s.id == u.staffId)).length || 0;
    const withoutAccount = total - withAccount;
    
    // Hitung per jabatan
    const jabatanCount = {};
    staffList.forEach(s => {
        if (s.jabatan) jabatanCount[s.jabatan] = (jabatanCount[s.jabatan] || 0) + 1;
    });
    const topJabatan = Object.entries(jabatanCount).sort((a,b) => b[1]-a[1])[0];
    
    statsContainer.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;padding:10px;background:var(--bg-hover);border-radius:8px;margin-bottom:15px;">
            <div><span style="color:#ff9800;">👥 Total Guru/Karyawan:</span> <strong>${total}</strong></div>
            <div><span style="color:#4caf50;">✅ Sudah Berakun:</span> <strong>${withAccount}</strong></div>
            <div><span style="color:#f44336;">❌ Belum Berakun:</span> <strong>${withoutAccount}</strong></div>
            <div><span style="color:#ff9800;">📋 Jabatan Terbanyak:</span> <strong>${topJabatan ? `${topJabatan[0]} (${topJabatan[1]})` : '-'}</strong></div>
        </div>
    `;
}

// ======================= CRUD STAFF ========================

function saveStaff() {
    if (!canManageStaff()) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    const id = document.getElementById('staffId')?.value.trim();
    const nama = document.getElementById('staffNama')?.value.trim();
    const jabatan = document.getElementById('staffJabatan')?.value;
    const departemen = document.getElementById('staffDepartemen')?.value;
    const noHp = document.getElementById('staffNoHp')?.value.trim();
    const email = document.getElementById('staffEmail')?.value.trim();
    const mode = document.getElementById('staffEditMode')?.value;
    
    if (!nama || !id) {
        showToast("⚠️ ID dan Nama wajib diisi!", "error");
        return;
    }
    if (!jabatan) {
        showToast("⚠️ Pilih Jabatan!", "error");
        return;
    }
    
    const btn = document.getElementById('btnSaveStaff');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '💾 Menyimpan...'; }
    
    const staffData = {
        id: id,
        nama: nama,
        jabatan: jabatan,
        departemen: departemen || '-',
        noHp: noHp || '-',
        email: email || '',
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    if (mode === 'add') {
        staffData.createdAt = firebase.database.ServerValue.TIMESTAMP;
        // Cek ID duplikat
        db.ref(`staff/${id}`).once('value').then((snapshot) => {
            if (snapshot.exists()) {
                showToast("❌ ID sudah ada!", "error");
                if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
                return;
            }
            return db.ref(`staff/${id}`).set(staffData);
        }).then(() => {
            showToast("✅ Guru/Karyawan berhasil ditambahkan!");
            if (typeof logActivity === 'function') {
                logActivity('add_staff', `Tambah staff: ${nama} (ID: ${id}, Jabatan: ${jabatan})`);
            }
            resetStaffForm();
            renderStaffTable();
        }).catch(err => {
            showToast("❌ Gagal: " + err.message, "error");
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        });
    } else {
        // Edit mode
        db.ref(`staff/${id}`).update(staffData).then(() => {
            showToast("✅ Data guru/karyawan berhasil diupdate!");
            if (typeof logActivity === 'function') {
                logActivity('edit_staff', `Edit staff: ${nama} (ID: ${id})`);
            }
            resetStaffForm();
            renderStaffTable();
        }).catch(err => {
            showToast("❌ Gagal: " + err.message, "error");
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        });
    }
}

function editStaff(id) {
    if (!canManageStaff()) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    db.ref(`staff/${id}`).once('value', (snapshot) => {
        const staff = snapshot.val();
        if (!staff) {
            showToast("❌ Data tidak ditemukan!", "error");
            return;
        }
        
        document.getElementById('staffId').value = staff.id;
        document.getElementById('staffId').disabled = true;
        document.getElementById('staffNama').value = staff.nama;
        document.getElementById('staffJabatan').value = staff.jabatan;
        document.getElementById('staffDepartemen').value = staff.departemen || '';
        document.getElementById('staffNoHp').value = staff.noHp || '';
        document.getElementById('staffEmail').value = staff.email || '';
        document.getElementById('staffEditMode').value = 'edit';
        
        const btnSave = document.getElementById('btnSaveStaff');
        const btnCancel = document.getElementById('btnCancelStaff');
        if (btnSave) {
            btnSave.innerHTML = '💾 Update';
            btnSave.style.background = 'var(--warning)';
        }
        if (btnCancel) btnCancel.classList.remove('hidden');
        
        showToast(`✏️ Edit mode: ${staff.nama}`, "info");
        document.getElementById('staffNama').focus();
    });
}

function resetStaffForm() {
    document.getElementById('staffId').value = '';
    document.getElementById('staffId').disabled = false;
    document.getElementById('staffNama').value = '';
    document.getElementById('staffJabatan').value = 'guru';
    document.getElementById('staffDepartemen').value = '';
    document.getElementById('staffNoHp').value = '';
    document.getElementById('staffEmail').value = '';
    document.getElementById('staffEditMode').value = 'add';
    
    const btnSave = document.getElementById('btnSaveStaff');
    const btnCancel = document.getElementById('btnCancelStaff');
    if (btnSave) {
        btnSave.innerHTML = '➕ Simpan';
        btnSave.style.background = '';
    }
    if (btnCancel) btnCancel.classList.add('hidden');
    
    document.getElementById('staffId')?.focus();
}

async function deleteStaff(id, nama) {
    if (!canManageStaff()) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    if (!confirm(`⚠️ Hapus ${nama} dari data guru/karyawan?\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!`)) return;
    
    // Cek apakah staff memiliki akun user
    const userAccount = dbData.users_auth?.find(u => u.staffId == id);
    if (userAccount && !confirm(`⚠️ Staff ini memiliki akun user (${userAccount.email}). Hapus juga akunnya?`)) {
        return;
    }
    
    const btn = event?.target;
    if (btn) btn.disabled = true;
    
    try {
        if (userAccount) {
            await db.ref(`users_auth/${userAccount.uid}`).remove();
        }
        await db.ref(`staff/${id}`).remove();
        
        // Hapus cache foto
        staffPhotoCache.delete(id);
        
        showToast(`✅ ${nama} berhasil dihapus!`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('delete_staff', `Hapus staff: ${nama} (ID: ${id})${userAccount ? ' beserta akunnya' : ''}`);
        }
        
        renderStaffTable();
    } catch (err) {
        showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ======================= BUAT AKUN USER UNTUK STAFF ========================

async function createStaffUserAccount(staffId, staffName, staffEmail) {
    if (!canManageStaff()) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    if (!staffEmail) {
        showToast("❌ Staff tidak memiliki email! Edit data dan isi email terlebih dahulu.", "error");
        return;
    }
    
    // Cek apakah email sudah terdaftar
    const existingUser = dbData.users_auth?.find(u => u.email === staffEmail);
    if (existingUser) {
        showToast(`❌ Email ${staffEmail} sudah terdaftar!`, "error");
        return;
    }
    
    // Generate password default
    const defaultPassword = `staff${staffId}`;
    
    const btn = event?.target;
    if (btn) btn.disabled = true;
    
    try {
        // Buat user di Firebase Auth
        const userCredential = await auth.createUserWithEmailAndPassword(staffEmail, defaultPassword);
        const user = userCredential.user;
        
        // Simpan data user
        const userData = {
            uid: user.uid,
            email: staffEmail,
            nama: staffName,
            role: 'guru', // Default role untuk staff adalah guru
            staffId: staffId,
            registeredAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        await db.ref(`users_auth/${user.uid}`).set(userData);
        
        // Update data staff dengan userId
        await db.ref(`staff/${staffId}/userId`).set(user.uid);
        
        showToast(`✅ Akun berhasil dibuat!\nEmail: ${staffEmail}\nPassword: ${defaultPassword}`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('create_staff_account', `Buat akun user untuk staff ${staffName} (${staffEmail})`);
        }
        
        renderStaffTable();
        if (typeof renderUsersTable === 'function') renderUsersTable();
        
        // Tampilkan password dalam modal
        alert(`Akun berhasil dibuat!\n\nEmail: ${staffEmail}\nPassword: ${defaultPassword}\n\nHarap berikan password ini kepada staff dan ingatkan untuk mengganti password setelah login.`);
        
    } catch (err) {
        console.error("Create staff account error:", err);
        let msg = err.message;
        if (msg.includes('email-already-in-use')) msg = "Email sudah terdaftar!";
        showToast("❌ Gagal membuat akun: " + msg, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ======================= MODAL FOTO ========================

function showStaffPhotoModal(staffId, staffName, photoUrl) {
    let modalHtml = `
        <div id="modal-staff-photo" class="modal-overlay open">
            <div class="modal-box" style="max-width: 500px; text-align: center;">
                <div class="modal-title">
                    <span>📸 Foto ${escapeHtmlStaff(staffName)}</span>
                    <span onclick="closeModal('modal-staff-photo')">✖</span>
                </div>
                <div style="padding: 20px;">
                    <img src="${photoUrl}" 
                         style="max-width: 100%; max-height: 60vh; border-radius: 20px; object-fit: contain;">
                    <p style="margin-top: 15px;">
                        <strong>${escapeHtmlStaff(staffName)}</strong><br>
                        <span style="color: var(--text-muted);">ID: ${staffId}</span>
                    </p>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeModal('modal-staff-photo')">Tutup</button>
                </div>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('modal-staff-photo');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ======================= INITIALIZATION ========================

function initStaffSystem() {
    console.log("👥 Initializing Staff system...");
    
    if (!canManageStaff()) {
        console.log("🔒 Staff system: No access for role:", currentUser?.role);
        return;
    }
    
    // Add tab if not exists
    addStaffTab();
    
    // Setup listener untuk data staff
    setupStaffListener();
}

function addStaffTab() {
    // Cek apakah tab sudah ada
    if (document.getElementById('tab-staff')) return;
    
    // Tambahkan tab button ke dropdown Menu Utama
    const dropdownMainContent = document.getElementById('dropdownMainContent');
    if (dropdownMainContent) {
        const staffBtn = document.createElement('button');
        staffBtn.setAttribute('onclick', "switchTab('staff'); closeAllDropdowns()");
        staffBtn.innerHTML = '👥 Guru/Karyawan';
        // Insert sebelum Panduan
        const guideBtn = Array.from(dropdownMainContent.children).find(btn => btn.textContent.includes('Panduan'));
        if (guideBtn) {
            dropdownMainContent.insertBefore(staffBtn, guideBtn);
        } else {
            dropdownMainContent.appendChild(staffBtn);
        }
    }
    
    // Tambahkan tab content
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && !document.getElementById('tab-staff')) {
        const staffTabHtml = `
            <div id="tab-staff" class="tab-content role-admin role-guru role-developer">
                <div class="controls-bar">
                    <div style="display:flex; gap:10px; flex-wrap:wrap; width:100%;">
                        <input type="hidden" id="staffEditMode" value="add">
                        <div class="filter-group"><label>ID:</label><input type="text" id="staffId" placeholder="ID" style="width:80px;"></div>
                        <div class="filter-group"><label>Nama:</label><input type="text" id="staffNama" placeholder="Nama Lengkap" style="width:180px;"></div>
                        <div class="filter-group"><label>Jabatan:</label>
                            <select id="staffJabatan">
                                <option value="guru">👨‍🏫 Guru</option>
                                <option value="kepala_sekolah">👑 Kepala Sekolah</option>
                                <option value="wakil_kepala">📋 Wakil Kepala</option>
                                <option value="staff_tu">📁 Staff TU</option>
                                <option value="pustakawan">📚 Pustakawan</option>
                                <option value="laboran">🔬 Laboran</option>
                                <option value="security">🛡️ Security</option>
                                <option value="kebersihan">🧹 Kebersihan</option>
                            </select>
                        </div>
                        <div class="filter-group"><label>Departemen:</label>
                            <select id="staffDepartemen">
                                <option value="">-- Pilih --</option>
                                <option value="akademik">Akademik</option>
                                <option value="kesiswaan">Kesiswaan</option>
                                <option value="humas">Humas</option>
                                <option value="sapras">Sapras</option>
                                <option value="kurikulum">Kurikulum</option>
                            </select>
                        </div>
                        <div class="filter-group"><label>No. HP:</label><input type="tel" id="staffNoHp" placeholder="No. HP" style="width:120px;"></div>
                        <div class="filter-group"><label>Email:</label><input type="email" id="staffEmail" placeholder="Email" style="width:180px;"></div>
                        <button class="btn-action role-guru role-admin" id="btnSaveStaff" onclick="saveStaff()">➕ Simpan</button>
                        <button class="btn-action btn-danger hidden" id="btnCancelStaff" onclick="resetStaffForm()">Batal</button>
                    </div>
                </div>
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Foto</th>
                                <th>ID</th>
                                <th>Nama</th>
                                <th>Jabatan</th>
                                <th>Departemen</th>
                                <th>No. HP</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff">
                            <tr><td colspan="7" style="text-align:center; padding:30px;">⏳ Memuat data...<\/td><\/tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        dashboardSection.insertAdjacentHTML('beforeend', staffTabHtml);
    }
}

function setupStaffListener() {
    db.ref('staff').on('value', (snapshot) => {
        if (document.getElementById('tab-staff')?.classList.contains('active')) {
            renderStaffTable();
        }
    });
}

// Override switchTab
const originalSwitchTabForStaff = window.switchTab;
if (originalSwitchTabForStaff) {
    window.switchTab = function(tabId) {
        originalSwitchTabForStaff(tabId);
        if (tabId === 'staff') {
            setTimeout(() => renderStaffTable(), 100);
        }
    };
}

function escapeHtmlStaff(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// Ekspor ke global
window.initStaffSystem = initStaffSystem;
window.renderStaffTable = renderStaffTable;
window.saveStaff = saveStaff;
window.editStaff = editStaff;
window.resetStaffForm = resetStaffForm;
window.deleteStaff = deleteStaff;
window.createStaffUserAccount = createStaffUserAccount;
window.showStaffPhotoModal = showStaffPhotoModal;
window.canManageStaff = canManageStaff;

console.log("✅ staff.js V1.0 loaded - Manajemen Guru/Karyawan");