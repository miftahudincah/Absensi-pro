// staff.js - VERSION 2.1 (FIXED - Tampilan Data Staff)
// Manajemen Data Guru/Karyawan - Terintegrasi dengan users_auth (role guru)
// ============================================================================

let staffDataReadyListenerAdded = false;
let staffTabActive = false;
let staffInitialized = false;

// Cache untuk foto staff
const staffPhotoCache = new Map();

// ======================= CEK AKSES ========================
function canManageStaff() {
    if (!currentUser) return false;
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
    
    let userAuth = null;
    if (dbData && dbData.users_auth) {
        userAuth = dbData.users_auth.find(u => u.staffId == staffId || u.uid == staffId);
        if (!userAuth) {
            userAuth = dbData.users_auth.find(u => u.email === staffId);
        }
    }
    
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

// ======================= AMBIL DATA STAFF ========================
async function getStaffList() {
    console.log("📋 getStaffList: Fetching staff data...");
    const staffMap = new Map();
    
    try {
        // 1. Ambil data dari node 'staff'
        const staffSnapshot = await db.ref('staff').once('value');
        const staffData = staffSnapshot.val();
        
        if (staffData) {
            Object.keys(staffData).forEach(key => {
                staffMap.set(key, { ...staffData[key], source: 'staff' });
            });
            console.log(`📁 Found ${Object.keys(staffData).length} staff from 'staff' node`);
        }
        
        // 2. Ambil data dari users_auth dengan role guru/developer
        const users = dbData?.users_auth || [];
        const guruUsers = users.filter(u => u.role === 'guru' || u.role === 'developer');
        
        console.log(`👥 Found ${guruUsers.length} users with role guru/developer`);
        
        guruUsers.forEach(user => {
            const existingStaff = staffMap.get(user.uid) || staffMap.get(user.staffId);
            
            if (!existingStaff) {
                staffMap.set(user.uid, {
                    id: user.uid,
                    nama: user.nama || user.email?.split('@')[0] || 'Unknown',
                    jabatan: user.role === 'developer' ? 'Developer' : 'Guru',
                    departemen: user.departemen || '-',
                    noHp: user.noHp || '-',
                    email: user.email,
                    userId: user.uid,
                    source: 'user_auth',
                    fromUserAuth: true
                });
            } else if (existingStaff.source === 'staff' && !existingStaff.userId) {
                existingStaff.userId = user.uid;
                existingStaff.email = existingStaff.email || user.email;
            }
        });
        
    } catch (err) {
        console.error("❌ Error in getStaffList:", err);
    }
    
    const staffList = Array.from(staffMap.values());
    staffList.sort((a, b) => {
        const aNum = parseInt(a.id);
        const bNum = parseInt(b.id);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return String(a.id).localeCompare(String(b.id));
    });
    
    console.log(`✅ Staff list loaded: ${staffList.length} staff total`);
    return staffList;
}

// ======================= RENDER TABEL STAFF ========================
async function renderStaffTable() {
    console.log("👥 renderStaffTable dipanggil");
    
    // Pastikan currentUser sudah ada
    if (!currentUser) {
        console.log("⏳ Menunggu currentUser...");
        setTimeout(() => renderStaffTable(), 500);
        return;
    }
    
    // Cari atau buat tbody
    let tbody = document.getElementById('tbody-staff');
    
    if (!tbody) {
        console.log("🔍 Mencari atau membuat tbody-staff...");
        
        // Cari di dalam tab-staff
        const tabStaff = document.getElementById('tab-staff');
        if (tabStaff) {
            const tableContainer = tabStaff.querySelector('.table-container');
            if (tableContainer) {
                let table = tableContainer.querySelector('table');
                if (!table) {
                    table = document.createElement('table');
                    table.style.width = '100%';
                    table.style.borderCollapse = 'collapse';
                    table.innerHTML = `
                        <thead>
                            <tr>
                                <th>Foto</th>
                                <th>ID</th>
                                <th>Nama</th>
                                <th>Jabatan</th>
                                <th>Departemen</th>
                                <th>No. HP</th>
                                <th>Email</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff"></tbody>
                    `;
                    tableContainer.appendChild(table);
                    console.log("✅ Created table dynamically");
                }
                tbody = document.getElementById('tbody-staff');
                if (!tbody && table) {
                    tbody = table.querySelector('tbody');
                    if (tbody) tbody.id = 'tbody-staff';
                }
            }
        }
    }
    
    if (!tbody) {
        console.error("❌ tbody-staff still not found!");
        // Retry after delay
        setTimeout(() => renderStaffTable(), 1000);
        return;
    }
    
    // Tampilkan loading
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">
        <div class="loading-spinner" style="width:30px;height:30px;margin:0 auto 10px;"></div>
        ⏳ Memuat data staff...
    </td></tr>`;
    
    try {
        // Ambil data staff
        const staffList = await getStaffList();
        
        if (!staffList || staffList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">
                📭 Belum ada data guru/karyawan.<br><br>
                <small>💡 Tips: 
                    <br>• Tambah user dengan role "Guru" di Manajemen User
                    <br>• Atau tambah staff langsung melalui form di atas
                </small>
            </td></tr>`;
            updateStaffStatistics(staffList || []);
            return;
        }
        
        const canEdit = canManageStaff();
        tbody.innerHTML = '';
        
        for (const staff of staffList) {
            const photoUrl = getStaffPhotoUrl(staff.id, staff.nama);
            const initial = staff.nama ? staff.nama.charAt(0).toUpperCase() : 'G';
            const safeId = escapeHtmlStaff(String(staff.id));
            const safeNama = escapeHtmlStaff(staff.nama);
            
            // Cek apakah staff memiliki akun user
            let hasAccount = false;
            if (dbData && dbData.users_auth) {
                hasAccount = !!(staff.userId || staff.fromUserAuth || 
                    dbData.users_auth.some(u => u.uid === staff.id || u.staffId === staff.id || u.email === staff.email));
            }
            
            const accountBadge = hasAccount 
                ? '<span class="badge-account" style="background:#4caf50; font-size:10px; padding:2px 6px; border-radius:12px;">✓ Berakun</span>' 
                : '<span class="badge-no-account" style="background:#ff9800; font-size:10px; padding:2px 6px; border-radius:12px;">❌ Belum Berakun</span>';
            
            let actionButtons = '';
            if (canEdit) {
                const isFromUserAuth = staff.source === 'user_auth' || staff.fromUserAuth;
                
                if (!isFromUserAuth) {
                    actionButtons = `
                        <td style="white-space: nowrap;">
                            <button class="btn-icon edit" onclick="editStaff('${safeId}')" title="Edit" style="background:none; border:none; cursor:pointer; font-size:18px;">✏️</button>
                            <button class="btn-icon delete" onclick="deleteStaff('${safeId}', '${safeNama}')" title="Hapus" style="background:none; border:none; cursor:pointer; font-size:18px;">🗑️</button>
                            ${!hasAccount ? `<button class="btn-icon" onclick="createStaffUserAccount('${safeId}', '${safeNama}', '${escapeHtmlStaff(staff.email || '')}')" title="Buat Akun User" style="background:none; border:none; cursor:pointer; font-size:18px; color:#2196f3;">👤</button>` : ''}
                        </td>
                    `;
                } else {
                    actionButtons = `
                        <td style="white-space: nowrap;">
                            <button class="btn-icon" onclick="viewUserAccount('${safeId}')" title="Lihat Akun User" style="background:none; border:none; cursor:pointer; font-size:18px; color:#00bcd4;">👁️</button>
                            <button class="btn-icon delete" onclick="deleteUserAccount('${safeId}', '${safeNama}')" title="Hapus Akun User" style="background:none; border:none; cursor:pointer; font-size:18px; color:#f44336;">🗑️</button>
                        </td>
                    `;
                }
            } else {
                actionButtons = '<td></td>';
            }
            
            const sourceBadge = staff.source === 'user_auth' 
                ? '<br><small class="text-small" style="color:#4caf50;">(Dari Akun)</small>' 
                : '';
            
            tbody.innerHTML += `
                <tr data-id="${safeId}" style="border-bottom: 1px solid var(--border);">
                    <td style="text-align:center; padding:8px;">
                        <img src="${photoUrl}" 
                             class="staff-avatar" 
                             style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;"
                             onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff&size=100&bold=true'"
                             onclick="showStaffPhotoModal('${safeId}', '${safeNama}', this.src)">
                    </td>
                    <td style="padding:8px;"><strong>${safeId}</strong>${sourceBadge}</td>
                    <td style="padding:8px;">${safeNama} ${accountBadge}</td>
                    <td style="padding:8px;">${escapeHtmlStaff(staff.jabatan || '-')}</td>
                    <td style="padding:8px;">${escapeHtmlStaff(staff.departemen || '-')}</td>
                    <td style="padding:8px;">${escapeHtmlStaff(staff.noHp || '-')}</td>
                    <td style="padding:8px;">${escapeHtmlStaff(staff.email || '-')}</td>
                    ${actionButtons}
                </tr>
            `;
        }
        
        updateStaffStatistics(staffList);
        console.log(`✅ renderStaffTable selesai, ${staffList.length} staff ditampilkan`);
        
    } catch (err) {
        console.error("❌ Error in renderStaffTable:", err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#f44336;">
            ❌ Gagal memuat data: ${err.message}<br>
            <button onclick="renderStaffTable()" style="margin-top:10px; padding:8px 20px; border-radius:20px; border:none; background:#00bcd4; color:white; cursor:pointer;">🔄 Coba Lagi</button>
        </td></tr>`;
    }
}

function updateStaffStatistics(staffList) {
    let statsContainer = document.getElementById('staffStats');
    if (!statsContainer) {
        const tabStaff = document.getElementById('tab-staff');
        if (tabStaff) {
            const controlsBar = tabStaff.querySelector('.controls-bar:first-child');
            if (controlsBar) {
                statsContainer = document.createElement('div');
                statsContainer.id = 'staffStats';
                statsContainer.style.marginBottom = '10px';
                controlsBar.insertAdjacentElement('afterend', statsContainer);
            }
        }
        if (!statsContainer) return;
    }
    
    const total = staffList.length;
    let withAccount = 0;
    if (dbData && dbData.users_auth) {
        withAccount = staffList.filter(s => s.userId || s.fromUserAuth || 
            dbData.users_auth.some(u => u.uid === s.id || u.staffId === s.id)).length;
    }
    const withoutAccount = total - withAccount;
    const fromUserAuth = staffList.filter(s => s.source === 'user_auth').length;
    const fromStaffNode = staffList.filter(s => s.source === 'staff').length;
    
    const jabatanCount = {};
    staffList.forEach(s => {
        if (s.jabatan) jabatanCount[s.jabatan] = (jabatanCount[s.jabatan] || 0) + 1;
    });
    const topJabatan = Object.entries(jabatanCount).sort((a,b) => b[1]-a[1])[0];
    
    statsContainer.innerHTML = `
        <div style="display:flex; gap:15px; flex-wrap:wrap; padding:12px; background:var(--bg-hover); border-radius:12px; margin-bottom:15px;">
            <div><span style="color:#ff9800;">👥 Total:</span> <strong>${total}</strong></div>
            <div><span style="color:#4caf50;">✅ Berakun:</span> <strong>${withAccount}</strong></div>
            <div><span style="color:#f44336;">❌ Belum Berakun:</span> <strong>${withoutAccount}</strong></div>
            <div><span style="color:#2196f3;">📋 Dari User:</span> <strong>${fromUserAuth}</strong></div>
            <div><span style="color:#888;">📁 Dari Staff:</span> <strong>${fromStaffNode}</strong></div>
            ${topJabatan ? `<div><span style="color:#ff9800;">🏆 Terbanyak:</span> <strong>${topJabatan[0]} (${topJabatan[1]})</strong></div>` : ''}
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
                logActivity('add_staff', `Tambah staff: ${nama} (ID: ${id})`);
            }
            resetStaffForm();
            renderStaffTable();
        }).catch(err => {
            showToast("❌ Gagal: " + err.message, "error");
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        });
    } else {
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
            btnSave.style.background = '#ff9800';
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
    
    let userAccount = null;
    if (dbData && dbData.users_auth) {
        userAccount = dbData.users_auth.find(u => u.staffId == id || u.uid == id);
    }
    
    if (userAccount && !confirm(`⚠️ Staff ini memiliki akun user (${userAccount.email}). Hapus juga akunnya?`)) {
        return;
    }
    
    const btn = event?.target;
    if (btn) btn.disabled = true;
    
    try {
        if (userAccount) {
            await db.ref(`users_auth/${userAccount.uid}`).remove();
            if (typeof logActivity === 'function') {
                logActivity('delete_user', `Hapus akun user ${userAccount.nama} (${userAccount.email}) karena staff dihapus`);
            }
        }
        await db.ref(`staff/${id}`).remove();
        staffPhotoCache.delete(id);
        
        showToast(`✅ ${nama} berhasil dihapus!`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('delete_staff', `Hapus staff: ${nama} (ID: ${id})`);
        }
        
        renderStaffTable();
        if (typeof renderUsersTable === 'function') renderUsersTable();
    } catch (err) {
        showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ======================= MANAJEMEN AKUN USER ========================
async function createStaffUserAccount(staffId, staffName, staffEmail) {
    if (!canManageStaff()) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    if (!staffEmail) {
        showToast("❌ Staff tidak memiliki email! Edit data dan isi email terlebih dahulu.", "error");
        return;
    }
    
    if (dbData && dbData.users_auth) {
        const existingUser = dbData.users_auth.find(u => u.email === staffEmail);
        if (existingUser) {
            showToast(`❌ Email ${staffEmail} sudah terdaftar!`, "error");
            return;
        }
    }
    
    const defaultPassword = `staff${staffId}`;
    
    const btn = event?.target;
    if (btn) btn.disabled = true;
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(staffEmail, defaultPassword);
        const user = userCredential.user;
        
        const userData = {
            uid: user.uid,
            email: staffEmail,
            nama: staffName,
            role: 'guru',
            staffId: staffId,
            registeredAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        await db.ref(`users_auth/${user.uid}`).set(userData);
        await db.ref(`staff/${staffId}/userId`).set(user.uid);
        
        showToast(`✅ Akun berhasil dibuat!`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('create_staff_account', `Buat akun user untuk staff ${staffName}`);
        }
        
        renderStaffTable();
        if (typeof renderUsersTable === 'function') renderUsersTable();
        
        alert(`Akun berhasil dibuat!\n\nEmail: ${staffEmail}\nPassword: ${defaultPassword}\n\nHarap berikan password ini kepada staff.`);
        
    } catch (err) {
        console.error("Create staff account error:", err);
        let msg = err.message;
        if (msg.includes('email-already-in-use')) msg = "Email sudah terdaftar!";
        showToast("❌ Gagal: " + msg, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

function viewUserAccount(userId) {
    if (dbData && dbData.users_auth) {
        const user = dbData.users_auth.find(u => u.uid === userId);
        if (user) {
            if (typeof switchTab === 'function') {
                switchTab('users');
                setTimeout(() => {
                    showToast(`👤 Akun: ${user.nama} (${user.email})`, "info");
                }, 500);
            } else {
                showToast(`👤 Akun: ${user.nama} (${user.email})`, "info");
            }
        } else {
            showToast("❌ Akun user tidak ditemukan!", "error");
        }
    } else {
        showToast("❌ Akun user tidak ditemukan!", "error");
    }
}

async function deleteUserAccount(userId, userName) {
    if (!canManageStaff()) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    if (!confirm(`⚠️ Hapus akun user ${userName}?\n\nAkun akan dihapus dari sistem login.\nData staff tetap tersimpan.\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!`)) return;
    
    let user = null;
    if (dbData && dbData.users_auth) {
        user = dbData.users_auth.find(u => u.uid === userId);
    }
    
    if (!user) {
        showToast("❌ Akun user tidak ditemukan!", "error");
        return;
    }
    
    try {
        await db.ref(`users_auth/${userId}`).remove();
        
        const staff = await db.ref('staff').orderByChild('userId').equalTo(userId).once('value');
        if (staff.exists()) {
            const staffKey = Object.keys(staff.val())[0];
            await db.ref(`staff/${staffKey}/userId`).remove();
        }
        
        showToast(`✅ Akun ${userName} berhasil dihapus!`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('delete_user_account', `Hapus akun user ${userName}`);
        }
        
        renderStaffTable();
        if (typeof renderUsersTable === 'function') renderUsersTable();
        
    } catch (err) {
        console.error("Delete user account error:", err);
        showToast("❌ Gagal: " + err.message, "error");
    }
}

// ======================= MODAL FOTO ========================
function showStaffPhotoModal(staffId, staffName, photoUrl) {
    const modalHtml = `
        <div id="modal-staff-photo" class="modal-overlay open" style="display:flex; align-items:center; justify-content:center; z-index:10000;">
            <div class="modal-box" style="max-width: 500px; text-align: center; background:var(--bg-card); border-radius:20px;">
                <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                    <span>📸 Foto ${escapeHtmlStaff(staffName)}</span>
                    <span onclick="closeModal('modal-staff-photo')" style="cursor:pointer; font-size:24px;">✖</span>
                </div>
                <div style="padding: 20px;">
                    <img src="${photoUrl}" style="max-width: 100%; max-height: 60vh; border-radius: 20px; object-fit: contain;">
                    <p style="margin-top: 15px;">
                        <strong>${escapeHtmlStaff(staffName)}</strong><br>
                        <span style="color: var(--text-muted);">ID: ${staffId}</span>
                    </p>
                </div>
                <div class="modal-actions" style="padding:15px 20px; border-top:1px solid var(--border);">
                    <button class="btn-cancel" onclick="closeModal('modal-staff-photo')" style="padding:8px 20px; border-radius:20px; border:none; cursor:pointer;">Tutup</button>
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
    if (staffInitialized) {
        console.log("👥 Staff system already initialized");
        return;
    }
    
    console.log("👥 Initializing Staff system...");
    
    if (!canManageStaff()) {
        console.log("🔒 Staff system: No access for role:", currentUser?.role);
        return;
    }
    
    addStaffTab();
    setupStaffListeners();
    
    // Render pertama kali
    setTimeout(() => {
        if (document.getElementById('tab-staff')?.classList.contains('active')) {
            renderStaffTable();
        }
    }, 500);
    
    staffInitialized = true;
}

function addStaffTab() {
    if (document.getElementById('tab-staff')) return;
    
    // Tambahkan button ke dropdown
    const dropdownMainContent = document.getElementById('dropdownMainContent');
    if (dropdownMainContent && !Array.from(dropdownMainContent.children).some(btn => btn.innerHTML === '👥 Data Staff')) {
        const staffBtn = document.createElement('button');
        staffBtn.setAttribute('onclick', "switchTab('staff'); closeAllDropdowns()");
        staffBtn.innerHTML = '👥 Data Staff';
        
        const guideBtn = Array.from(dropdownMainContent.children).find(btn => btn.textContent.includes('Panduan'));
        if (guideBtn) {
            dropdownMainContent.insertBefore(staffBtn, guideBtn);
        } else {
            dropdownMainContent.appendChild(staffBtn);
        }
        console.log("✅ Staff button added to dropdown");
    }
    
    // Tambahkan tab content
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && !document.getElementById('tab-staff')) {
        const staffTabHtml = `
            <div id="tab-staff" class="tab-content">
                <div class="info-banner" style="background: var(--bg-hover); padding: 12px 16px; border-radius: 12px; margin-bottom: 15px; border-left: 4px solid #00bcd4;">
                    <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <span style="font-size: 24px;">💡</span>
                        <div>
                            <strong>Info:</strong> Data staff diambil dari dua sumber:
                            <ul style="margin: 5px 0 0 20px; font-size: 12px;">
                                <li>👥 <strong>Manajemen User</strong> - User dengan role <strong>Guru</strong> akan otomatis muncul</li>
                                <li>📁 <strong>Data Staff</strong> - Data yang ditambahkan manual melalui form di bawah</li>
                            </ul>
                        </div>
                    </div>
                </div>
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
                        <button class="btn-action" id="btnSaveStaff" onclick="saveStaff()" style="background:#00bcd4; border:none; padding:8px 16px; border-radius:20px; cursor:pointer;">➕ Simpan</button>
                        <button class="btn-action btn-danger hidden" id="btnCancelStaff" onclick="resetStaffForm()" style="display:none;">Batal</button>
                    </div>
                </div>
                <div class="table-container" style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-hover);">
                                <th style="padding:12px;">Foto</th>
                                <th style="padding:12px;">ID</th>
                                <th style="padding:12px;">Nama</th>
                                <th style="padding:12px;">Jabatan</th>
                                <th style="padding:12px;">Departemen</th>
                                <th style="padding:12px;">No. HP</th>
                                <th style="padding:12px;">Email</th>
                                <th style="padding:12px;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff">
                            <tr><td colspan="8" style="text-align:center; padding:30px;">⏳ Memuat data...</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        dashboardSection.insertAdjacentHTML('beforeend', staffTabHtml);
        console.log("✅ Staff tab content added");
    }
}

function setupStaffListeners() {
    db.ref('staff').on('value', () => {
        if (document.getElementById('tab-staff')?.classList.contains('active')) {
            renderStaffTable();
        }
    });
    
    db.ref('users_auth').on('value', () => {
        if (document.getElementById('tab-staff')?.classList.contains('active')) {
            renderStaffTable();
        }
    });
}

// Override switchTab
if (typeof window.switchTab === 'function') {
    const originalSwitchTabForStaff = window.switchTab;
    window.switchTab = function(tabId) {
        originalSwitchTabForStaff(tabId);
        if (tabId === 'staff') {
            setTimeout(() => renderStaffTable(), 200);
        }
    };
} else {
    window.switchTab = function(tabId) {
        if (tabId === 'staff') {
            setTimeout(() => renderStaffTable(), 200);
        }
    };
}

function escapeHtmlStaff(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// Ekspor ke global
window.initStaffSystem = initStaffSystem;
window.renderStaffTable = renderStaffTable;
window.saveStaff = saveStaff;
window.editStaff = editStaff;
window.resetStaffForm = resetStaffForm;
window.deleteStaff = deleteStaff;
window.createStaffUserAccount = createStaffUserAccount;
window.viewUserAccount = viewUserAccount;
window.deleteUserAccount = deleteUserAccount;
window.showStaffPhotoModal = showStaffPhotoModal;
window.canManageStaff = canManageStaff;
window.getStaffList = getStaffList;

console.log("✅ staff.js V2.1 loaded - Fixed loading issue");