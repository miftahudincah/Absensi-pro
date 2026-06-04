// staff.js - VERSION 2.11 (DENGAN NOTIFIKASI WHATSAPP UNTUK STAFF & PERBAIKAN CLOSE MODAL)
// Manajemen Data Guru/Karyawan - Terintegrasi dengan users_auth (role guru)
// Fitur WhatsApp: Simpan nomor staff, test kirim pesan, dan notifikasi otomatis
// ============================================================================

let staffDataReadyListenerAdded = false;
let staffTabActive = false;
let staffInitialized = false;
let staffListCache = [];
let staffListLoaded = false;
let staffRetryCount = 0;
const STAFF_MAX_RETRY = 5;

// Cache untuk foto staff
const staffPhotoCache = new Map();

// Variabel untuk filter
let currentStaffFilter = 'all';
let currentSearchTerm = '';

// ======================= CEK AKSES ========================
function canManageStaff() {
    if (!window.currentUser) return false;
    return (window.currentUser.role === 'admin' || window.currentUser.role === 'guru' || window.currentUser.role === 'developer');
}

// ======================= CEK APAKAH MENU STAFF VISIBLE ========================
function isStaffMenuVisible() {
    if (!window.currentUser) return false;
    return (window.currentUser.role === 'admin' || window.currentUser.role === 'guru' || window.currentUser.role === 'developer');
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
    if (window.dbData && window.dbData.users_auth) {
        userAuth = window.dbData.users_auth.find(u => u.staffId == staffId || u.uid == staffId);
        if (!userAuth) {
            userAuth = window.dbData.users_auth.find(u => u.email === staffId);
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
    if (typeof window.WHATSAPP_CONFIG === 'undefined' || !window.WHATSAPP_CONFIG.enabled) {
        console.log('📱 WhatsApp notification disabled for staff');
        return;
    }
    
    if (type === 'check_in' && !window.WHATSAPP_CONFIG.sendOnCheckIn) return;
    if (type === 'check_out' && !window.WHATSAPP_CONFIG.sendOnCheckOut) return;
    
    try {
        let phoneNumber = null;
        
        const staffContactSnapshot = await db.ref(`staff_contacts/${staffId}`).once('value');
        const staffContactData = staffContactSnapshot.val();
        
        if (staffContactData && staffContactData.phoneNumber) {
            phoneNumber = staffContactData.phoneNumber;
        } else {
            const staffSnapshot = await db.ref(`staff/${staffId}`).once('value');
            const staffData = staffSnapshot.val();
            if (staffData && staffData.noHp) {
                phoneNumber = staffData.noHp;
            }
        }
        
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
        
        let formattedNumber = phoneNumber.replace(/[^0-9]/g, '');
        if (formattedNumber.startsWith('0')) formattedNumber = '62' + formattedNumber.substring(1);
        if (!formattedNumber.startsWith('62')) formattedNumber = '62' + formattedNumber;
        
        const today = date || new Date().toISOString().split('T')[0];
        const formattedDate = formatIndonesianDate(today);
        
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
        
        if (typeof sendViaFonnte === 'function') {
            const fullMessage = `*📢 SISTEM ABSENSI SEKOLAH*\n\n*${title}*\n\n${message}\n\n---\n📱 Sistem Absensi IoT - Real-time`;
            const result = await sendViaFonnte(formattedNumber, fullMessage);
            if (result) {
                console.log(`📱 WhatsApp sent to staff ${staffName}: ${type}`);
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

function formatIndonesianDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parts[2]} ${bulan[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

async function saveStaffContact(staffId, staffName, phoneNumber, relation = 'staff') {
    if (!window.currentUser || (window.currentUser.role !== 'admin' && window.currentUser.role !== 'developer')) {
        if (window.showToast) window.showToast('⛔ Hanya Admin dan Developer yang dapat mengedit kontak staff!', 'error');
        return false;
    }
    
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

async function getStaffContact(staffId) {
    try {
        const snapshot = await db.ref(`staff_contacts/${staffId}`).once('value');
        return snapshot.val();
    } catch (error) {
        console.error('Get staff contact error:', error);
        return null;
    }
}

// ======================= FUNGSI CLOSE MODAL (DIPERBAIKI) ========================

/**
 * Menutup modal staff contact
 */
function closeStaffContactModal() {
    const modal = document.getElementById('modal-staff-contact');
    if (modal) {
        modal.classList.remove('open');
        modal.style.display = 'none';
        setTimeout(() => {
            if (modal && modal.parentNode) {
                modal.remove();
            }
        }, 300);
    }
}

/**
 * Menutup modal staff photo
 */
function closeStaffPhotoModal() {
    const modal = document.getElementById('modal-staff-photo');
    if (modal) {
        modal.classList.remove('open');
        modal.style.display = 'none';
        setTimeout(() => {
            if (modal && modal.parentNode) {
                modal.remove();
            }
        }, 300);
    }
}

// Override window.closeModal untuk menangani modal staff
if (typeof window.closeModal === 'function') {
    const originalCloseModal = window.closeModal;
    window.closeModal = function(modalId) {
        if (modalId === 'modal-staff-contact') {
            closeStaffContactModal();
            return;
        }
        if (modalId === 'modal-staff-photo') {
            closeStaffPhotoModal();
            return;
        }
        originalCloseModal(modalId);
    };
} else {
    window.closeModal = function(modalId) {
        if (modalId === 'modal-staff-contact') {
            closeStaffContactModal();
            return;
        }
        if (modalId === 'modal-staff-photo') {
            closeStaffPhotoModal();
            return;
        }
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('open');
            modal.style.display = 'none';
        }
    };
}

// ======================= MODAL STAFF CONTACT ========================

function openStaffContactModal(staffId, staffName) {
    const modalId = 'modal-staff-contact';
    let existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    db.ref(`staff_contacts/${staffId}`).once('value', (snapshot) => {
        const contact = snapshot.val();
        let existingNumber = '';
        let existingRelation = 'staff';
        
        if (contact && contact.rawNumber) {
            existingNumber = contact.rawNumber;
            existingRelation = contact.relation || 'staff';
        }
        
        const modalHtml = `
            <div id="${modalId}" class="modal-overlay open" style="display:flex; align-items:center; justify-content:center; z-index:10000;">
                <div class="modal-box" style="max-width: 450px; background:var(--bg-card); border-radius:20px;">
                    <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                        <span>📱 WhatsApp Staff - ${escapeHtmlStaff(staffName)}</span>
                        <span class="close-staff-modal" style="cursor:pointer; font-size:24px;">✖</span>
                    </div>
                    <div style="padding: 20px;">
                        <div class="form-group">
                            <label>👤 Staff</label>
                            <input type="text" id="staffContactName" value="${escapeHtmlStaff(staffName)}" readonly style="background: var(--bg-hover); width:100%; padding:10px; border-radius:8px;">
                        </div>
                        <div class="form-group">
                            <label>📱 Nomor WhatsApp</label>
                            <input type="tel" id="staffContactPhone" placeholder="Contoh: 08123456789 atau 628123456789" value="${escapeHtmlStaff(existingNumber)}" style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--border); background:var(--bg-input);">
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
                            <button class="btn-cancel close-staff-modal" style="padding:8px 20px; border-radius:20px; border:none; cursor:pointer;">Batal</button>
                            <button class="btn-save" onclick="saveStaffContactFromModal('${staffId}', '${escapeHtmlStaff(staffName)}')" style="padding:8px 20px; border-radius:20px; border:none; background:#4caf50; color:white; cursor:pointer;">💾 Simpan Nomor</button>
                        </div>
                        <div class="text-small" style="margin-top: 15px; text-align: center; color: var(--text-muted);">
                            <hr>
                            📱 <strong>Test Kirim Pesan</strong><br>
                            <button class="btn-action btn-success" onclick="testSendStaffWhatsApp('${staffId}', '${escapeHtmlStaff(staffName)}')" style="margin-top: 8px; padding: 6px 12px; font-size: 0.75rem;">
                                🔔 Kirim Test WhatsApp
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Tambahkan event listener untuk tombol close
        document.querySelectorAll('.close-staff-modal').forEach(btn => {
            btn.addEventListener('click', closeStaffContactModal);
        });
        
        // Tutup modal jika klik di luar area modal
        const modalOverlay = document.getElementById(modalId);
        if (modalOverlay) {
            modalOverlay.addEventListener('click', function(e) {
                if (e.target === modalOverlay) {
                    closeStaffContactModal();
                }
            });
        }
        
        // Tutup modal dengan tombol ESC
        const escHandler = function(e) {
            if (e.key === 'Escape') {
                closeStaffContactModal();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

async function saveStaffContactFromModal(staffId, staffName) {
    const phoneNumber = document.getElementById('staffContactPhone')?.value.trim();
    const relation = document.getElementById('staffContactRelation')?.value;
    
    if (!phoneNumber) {
        if (window.showToast) window.showToast('Masukkan nomor WhatsApp!', 'error');
        return;
    }
    
    await saveStaffContact(staffId, staffName, phoneNumber, relation);
    closeStaffContactModal();
}

async function testSendStaffWhatsApp(staffId, staffName) {
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

// ======================= FUNGSI FILTER ========================
function filterStaffList(staffList) {
    if (!staffList) return [];
    
    let filtered = [...staffList];
    
    if (currentStaffFilter !== 'all') {
        switch(currentStaffFilter) {
            case 'withAccount':
                filtered = filtered.filter(s => {
                    if (window.dbData && window.dbData.users_auth) {
                        return s.userId || s.fromUserAuth || 
                            window.dbData.users_auth.some(u => u.uid === s.id || u.staffId === s.id);
                    }
                    return false;
                });
                break;
            case 'withoutAccount':
                filtered = filtered.filter(s => {
                    if (window.dbData && window.dbData.users_auth) {
                        return !(s.userId || s.fromUserAuth || 
                            window.dbData.users_auth.some(u => u.uid === s.id || u.staffId === s.id));
                    }
                    return true;
                });
                break;
            case 'fromStaff':
                filtered = filtered.filter(s => s.source === 'staff');
                break;
            case 'fromUser':
                filtered = filtered.filter(s => s.source === 'user_auth' || s.fromUserAuth);
                break;
        }
    }
    
    if (currentSearchTerm.trim() !== '') {
        const searchLower = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(s => 
            (s.nama && s.nama.toLowerCase().includes(searchLower)) ||
            (s.id && String(s.id).toLowerCase().includes(searchLower)) ||
            (s.jabatan && s.jabatan.toLowerCase().includes(searchLower)) ||
            (s.departemen && s.departemen.toLowerCase().includes(searchLower)) ||
            (s.email && s.email.toLowerCase().includes(searchLower)) ||
            (s.noHp && s.noHp.toLowerCase().includes(searchLower))
        );
    }
    
    return filtered;
}

function setStaffFilter(filterType) {
    console.log("🎯 Set staff filter to:", filterType);
    currentStaffFilter = filterType;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = '#e0e0e0';
        btn.style.color = '#333';
    });
    
    const activeBtn = document.querySelector(`.filter-btn[data-filter="${filterType}"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = '#00bcd4';
        activeBtn.style.color = 'white';
    }
    
    renderStaffTable();
}

function searchStaff() {
    const searchInput = document.getElementById('staffSearchInput');
    if (searchInput) {
        currentSearchTerm = searchInput.value;
        console.log("🔍 Search staff for:", currentSearchTerm);
        renderStaffTable();
    }
}

function clearSearch() {
    const searchInput = document.getElementById('staffSearchInput');
    if (searchInput) {
        searchInput.value = '';
        currentSearchTerm = '';
        renderStaffTable();
    }
}

function resetStaffFilters() {
    setStaffFilter('all');
    clearSearch();
}

// ======================= AMBIL DATA STAFF ========================
async function getStaffList(forceRefresh = false) {
    if (!forceRefresh && staffListLoaded && staffListCache.length > 0) {
        console.log("📋 Using cached staff list:", staffListCache.length);
        return staffListCache;
    }
    
    console.log("📋 Fetching fresh staff data...");
    const staffMap = new Map();
    
    if (!window.firebase || !window.firebase.database) {
        console.log("⏳ Firebase not ready, waiting...");
        await new Promise(resolve => setTimeout(resolve, 500));
        if (!window.firebase || !window.firebase.database) {
            console.error("❌ Firebase still not available");
            return [];
        }
    }
    
    try {
        const staffSnapshot = await window.firebase.database().ref('staff').once('value');
        const staffData = staffSnapshot.val();
        
        if (staffData) {
            Object.keys(staffData).forEach(key => {
                staffMap.set(key, { ...staffData[key], source: 'staff', id: key });
            });
            console.log(`📁 Found ${Object.keys(staffData).length} staff from 'staff' node`);
        }
        
        const users = window.dbData?.users_auth || [];
        const guruUsers = users.filter(u => u.role === 'guru' || u.role === 'developer');
        
        console.log(`👥 Found ${guruUsers.length} users with role guru/developer`);
        
        for (const user of guruUsers) {
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
                window.firebase.database().ref(`staff/${existingStaff.id}/userId`).set(user.uid)
                    .catch(e => console.warn("Update staff userId failed:", e));
                if (!existingStaff.email && user.email) {
                    window.firebase.database().ref(`staff/${existingStaff.id}/email`).set(user.email)
                        .catch(e => console.warn("Update staff email failed:", e));
                }
            }
        }
        
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
    
    staffListCache = staffList;
    staffListLoaded = true;
    
    console.log(`✅ Staff list loaded: ${staffList.length} staff total`);
    return staffList;
}

// ======================= RENDER TABEL STAFF ========================
async function renderStaffTable() {
    console.log("👥 renderStaffTable dipanggil");
    
    if (!isStaffMenuVisible()) {
        console.log("🔒 Staff table hidden for role:", window.currentUser?.role);
        const tbody = document.getElementById('tbody-staff');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">
                🔒 Anda tidak memiliki akses ke halaman ini.
            <\/td><\/tr>`;
        }
        return;
    }
    
    if (!window.currentUser) {
        console.log("⏳ Menunggu currentUser...");
        if (staffRetryCount < STAFF_MAX_RETRY) {
            staffRetryCount++;
            setTimeout(() => renderStaffTable(), 500);
        }
        return;
    }
    
    staffRetryCount = 0;
    
    let tbody = document.getElementById('tbody-staff');
    
    if (!tbody) {
        console.log("🔍 Mencari atau membuat tbody-staff...");
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
                        <tbody id="tbody-staff"></tbody>
                    `;
                    tableContainer.appendChild(table);
                    console.log("✅ Created staff table dynamically");
                }
                tbody = document.getElementById('tbody-staff');
            }
        }
    }
    
    if (!tbody) {
        console.error("❌ tbody-staff still not found!");
        setTimeout(() => renderStaffTable(), 1000);
        return;
    }
    
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">
        <div style="display:inline-block; width:30px; height:30px; border:3px solid var(--border); border-top-color:#00bcd4; border-radius:50%; animation: spin 1s linear infinite;"></div>
        <div style="margin-top:10px;">⏳ Memuat data staff...</div>
    <\/td><\/tr>`;
    
    try {
        const staffList = await getStaffList(true);
        
        if (!staffList || staffList.length === 0) {
            tbody.innerHTML = `<td><td colspan="8" style="text-align:center; padding:30px;">
                📭 Belum ada data guru/karyawan.<br><br>
                <div style="margin-top:15px;">
                    <button onclick="openAddStaffForm()" style="padding:8px 20px; background:#00bcd4; border:none; border-radius:20px; color:white; cursor:pointer;">➕ Tambah Staff Baru</button>
                </div>
                <small style="display:block; margin-top:15px;">💡 Tips: Tambah user dengan role "Guru" di Manajemen User juga akan muncul di sini</small>
            <\/td><\/tr>`;
            updateStaffStatistics(staffList || []);
            return;
        }
        
        const filteredStaff = filterStaffList(staffList);
        
        if (filteredStaff.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">
                🔍 Tidak ada data yang sesuai dengan filter yang dipilih.<br><br>
                <button onclick="resetStaffFilters()" style="padding:8px 20px; background:#00bcd4; border:none; border-radius:20px; color:white; cursor:pointer;">Reset Filter</button>
            <\/td><\/tr>`;
            updateStaffStatistics(staffList);
            return;
        }
        
        const canEdit = canManageStaff();
        tbody.innerHTML = '';
        const canManageWhatsApp = window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.role === 'developer');
        
        for (const staff of filteredStaff) {
            const photoUrl = getStaffPhotoUrl(staff.id, staff.nama);
            const initial = staff.nama ? staff.nama.charAt(0).toUpperCase() : 'G';
            const safeId = escapeHtmlStaff(String(staff.id));
            const safeNama = escapeHtmlStaff(staff.nama);
            
            let hasAccount = false;
            if (window.dbData && window.dbData.users_auth) {
                hasAccount = !!(staff.userId || staff.fromUserAuth || 
                    window.dbData.users_auth.some(u => u.uid === staff.id || u.staffId === staff.id || u.email === staff.email));
            }
            
            const accountBadge = hasAccount 
                ? '<span style="background:#4caf50; color:white; font-size:9px; padding:2px 6px; border-radius:12px; margin-left:5px;">✓ Berakun</span>' 
                : '<span style="background:#ff9800; color:white; font-size:9px; padding:2px 6px; border-radius:12px; margin-left:5px;">❌ Belum Berakun</span>';
            
            let hasWhatsApp = false;
            if (staff.noHp && staff.noHp !== '-') hasWhatsApp = true;
            
            const waBadge = hasWhatsApp 
                ? '<span style="background:#25D366; color:white; font-size:9px; padding:2px 6px; border-radius:12px; margin-left:5px;" title="Nomor WhatsApp tersimpan">📱 WA</span>' 
                : '';
            
            let actionButtons = '';
            if (canEdit) {
                const isFromUserAuth = staff.source === 'user_auth' || staff.fromUserAuth;
                
                if (!isFromUserAuth) {
                    actionButtons = `
                        <td style="white-space: nowrap; padding:8px;">
                            <button onclick="editStaff('${safeId}')" title="Edit" style="background:#2196f3; border:none; border-radius:8px; padding:5px 10px; margin:0 2px; cursor:pointer; color:white;">✏️</button>
                            <button onclick="deleteStaff('${safeId}', '${safeNama}')" title="Hapus" style="background:#f44336; border:none; border-radius:8px; padding:5px 10px; margin:0 2px; cursor:pointer; color:white;">🗑️</button>
                            ${!hasAccount ? `<button onclick="createStaffUserAccount('${safeId}', '${safeNama}', '${escapeHtmlStaff(staff.email || '')}')" title="Buat Akun User" style="background:#4caf50; border:none; border-radius:8px; padding:5px 10px; margin:0 2px; cursor:pointer; color:white;">👤</button>` : ''}
                            ${canManageWhatsApp ? `<button onclick="openStaffContactModal('${safeId}', '${safeNama}')" title="Set WhatsApp" style="background:#25D366; border:none; border-radius:8px; padding:5px 10px; margin:0 2px; cursor:pointer; color:white;">📱</button>` : ''}
                        <\/td>
                    `;
                } else {
                    actionButtons = `
                        <td style="white-space: nowrap; padding:8px;">
                            <button onclick="viewUserAccount('${safeId}')" title="Lihat Akun" style="background:#00bcd4; border:none; border-radius:8px; padding:5px 10px; margin:0 2px; cursor:pointer; color:white;">👁️</button>
                            <button onclick="deleteUserAccount('${safeId}', '${safeNama}')" title="Hapus Akun" style="background:#f44336; border:none; border-radius:8px; padding:5px 10px; margin:0 2px; cursor:pointer; color:white;">🗑️</button>
                            ${canManageWhatsApp ? `<button onclick="openStaffContactModal('${safeId}', '${safeNama}')" title="Set WhatsApp" style="background:#25D366; border:none; border-radius:8px; padding:5px 10px; margin:0 2px; cursor:pointer; color:white;">📱</button>` : ''}
                        <\/td>
                    `;
                }
            } else {
                actionButtons = '<td style="padding:8px;">-<\/td>';
            }
            
            const sourceBadge = staff.source === 'user_auth' 
                ? '<br><small style="color:#4caf50;">(Dari Akun User)</small>' 
                : '';
            
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="text-align:center; padding:8px;">
                        <img src="${photoUrl}" 
                             style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; cursor: pointer;"
                             onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff&size=100&bold=true'"
                             onclick="showStaffPhotoModal('${safeId}', '${safeNama}', this.src)">
                    <\/td>
                    <td style="padding:8px;"><strong>${safeId}</strong>${sourceBadge}<\/td>
                    <td style="padding:8px;">${safeNama} ${accountBadge} ${waBadge}<\/td>
                    <td style="padding:8px;">${escapeHtmlStaff(staff.jabatan || '-')}<\/td>
                    <td style="padding:8px;">${escapeHtmlStaff(staff.departemen || '-')}<\/td>
                    <td style="padding:8px;">${escapeHtmlStaff(staff.noHp || '-')}<\/td>
                    <td style="padding:8px;">${escapeHtmlStaff(staff.email || '-')}<\/td>
                    ${actionButtons}
                </tr>
            `;
        }
        
        updateStaffStatistics(staffList, filteredStaff.length);
        console.log(`✅ renderStaffTable selesai, ${filteredStaff.length}/${staffList.length} staff ditampilkan`);
        
    } catch (err) {
        console.error("❌ Error in renderStaffTable:", err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#f44336;">
            ❌ Gagal memuat data: ${err.message}<br>
            <button onclick="renderStaffTable()" style="margin-top:10px; padding:8px 20px; border-radius:20px; border:none; background:#00bcd4; color:white; cursor:pointer;">🔄 Coba Lagi</button>
        <\/td><\/tr>`;
    }
}

function updateStaffStatistics(staffList, filteredCount = null) {
    if (!isStaffMenuVisible()) return;
    
    let statsContainer = document.getElementById('staffStats');
    if (!statsContainer) {
        const tabStaff = document.getElementById('tab-staff');
        if (tabStaff) {
            const filterButtons = tabStaff.querySelector('.filter-buttons');
            if (filterButtons) {
                statsContainer = document.createElement('div');
                statsContainer.id = 'staffStats';
                statsContainer.style.marginBottom = '15px';
                filterButtons.insertAdjacentElement('afterend', statsContainer);
            }
        }
        if (!statsContainer) return;
    }
    
    const total = staffList.length;
    const displayCount = filteredCount !== null ? filteredCount : total;
    let withAccount = 0;
    if (window.dbData && window.dbData.users_auth) {
        withAccount = staffList.filter(s => s.userId || s.fromUserAuth || 
            window.dbData.users_auth.some(u => u.uid === s.id || u.staffId === s.id)).length;
    }
    const withoutAccount = total - withAccount;
    const fromUserAuth = staffList.filter(s => s.source === 'user_auth').length;
    const fromStaffNode = staffList.filter(s => s.source === 'staff').length;
    
    const filterInfo = (displayCount !== total) ? `<span style="color:#00bcd4;"> (Menampilkan ${displayCount} dari ${total})</span>` : '';
    
    statsContainer.innerHTML = `
        <div style="display:flex; gap:15px; flex-wrap:wrap; padding:12px; background:var(--bg-hover); border-radius:12px;">
            <div>👥 <strong>Total:</strong> ${total}${filterInfo}</div>
            <div>✅ <strong style="color:#4caf50;">Berakun:</strong> ${withAccount}</div>
            <div>❌ <strong style="color:#f44336;">Belum Berakun:</strong> ${withoutAccount}</div>
            <div>📋 <strong>Dari User:</strong> ${fromUserAuth}</div>
            <div>📁 <strong>Dari Staff:</strong> ${fromStaffNode}</div>
        </div>
    `;
}

// ======================= MODAL FOTO ========================
function showStaffPhotoModal(staffId, staffName, photoUrl) {
    const modalId = 'modal-staff-photo';
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    const modalHtml = `
        <div id="${modalId}" class="modal-overlay open" style="display:flex; align-items:center; justify-content:center; z-index:10000;">
            <div class="modal-box" style="max-width: 500px; text-align: center; background:var(--bg-card); border-radius:20px;">
                <div class="modal-title" style="display:flex; justify-content:space-between; align-items:center; padding:15px 20px; border-bottom:1px solid var(--border);">
                    <span>📸 Foto ${escapeHtmlStaff(staffName)}</span>
                    <span class="close-staff-photo-modal" style="cursor:pointer; font-size:24px;">✖</span>
                </div>
                <div style="padding: 20px;">
                    <img src="${photoUrl}" style="max-width: 100%; max-height: 60vh; border-radius: 20px; object-fit: contain;">
                    <p style="margin-top: 15px;">
                        <strong>${escapeHtmlStaff(staffName)}</strong><br>
                        <span style="color: var(--text-muted);">ID: ${staffId}</span>
                    </p>
                </div>
                <div class="modal-actions" style="padding:15px 20px; border-top:1px solid var(--border);">
                    <button class="btn-cancel close-staff-photo-modal" style="padding:8px 20px; border-radius:20px; border:none; cursor:pointer;">Tutup</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.querySelectorAll('.close-staff-photo-modal').forEach(btn => {
        btn.addEventListener('click', closeStaffPhotoModal);
    });
    
    const modalOverlay = document.getElementById(modalId);
    if (modalOverlay) {
        modalOverlay.addEventListener('click', function(e) {
            if (e.target === modalOverlay) {
                closeStaffPhotoModal();
            }
        });
    }
}

// ======================= CRUD STAFF ========================
function openAddStaffForm() {
    if (!isStaffMenuVisible()) {
        if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    resetStaffForm();
    document.getElementById('staffId')?.focus();
}

function saveStaff() {
    if (!canManageStaff()) {
        if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
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
        if (window.showToast) window.showToast("⚠️ ID dan Nama wajib diisi!", "error");
        return;
    }
    if (!jabatan) {
        if (window.showToast) window.showToast("⚠️ Pilih Jabatan!", "error");
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
        updatedAt: window.firebase.database.ServerValue.TIMESTAMP
    };
    
    if (mode === 'add') {
        staffData.createdAt = window.firebase.database.ServerValue.TIMESTAMP;
        window.firebase.database().ref(`staff/${id}`).once('value').then((snapshot) => {
            if (snapshot.exists()) {
                if (window.showToast) window.showToast("❌ ID sudah ada!", "error");
                if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
                return;
            }
            return window.firebase.database().ref(`staff/${id}`).set(staffData);
        }).then(() => {
            if (window.showToast) window.showToast("✅ Guru/Karyawan berhasil ditambahkan!");
            if (typeof window.logActivity === 'function') {
                window.logActivity('add_staff', `Tambah staff: ${nama} (ID: ${id})`);
            }
            resetStaffForm();
            staffListLoaded = false;
            setTimeout(() => renderStaffTable(), 500);
        }).catch(err => {
            if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        });
    } else {
        window.firebase.database().ref(`staff/${id}`).update(staffData).then(() => {
            if (window.showToast) window.showToast("✅ Data guru/karyawan berhasil diupdate!");
            if (typeof window.logActivity === 'function') {
                window.logActivity('edit_staff', `Edit staff: ${nama} (ID: ${id})`);
            }
            resetStaffForm();
            staffListLoaded = false;
            setTimeout(() => renderStaffTable(), 500);
        }).catch(err => {
            if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        });
    }
}

function editStaff(id) {
    if (!canManageStaff()) {
        if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    window.firebase.database().ref(`staff/${id}`).once('value', (snapshot) => {
        const staff = snapshot.val();
        if (!staff) {
            if (window.showToast) window.showToast("❌ Data tidak ditemukan!", "error");
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
        
        if (window.showToast) window.showToast(`✏️ Edit mode: ${staff.nama}`, "info");
        document.getElementById('staffNama').focus();
    });
}

function resetStaffForm() {
    const idInput = document.getElementById('staffId');
    if (idInput) {
        idInput.value = '';
        idInput.disabled = false;
    }
    const namaInput = document.getElementById('staffNama');
    if (namaInput) namaInput.value = '';
    const jabatanSelect = document.getElementById('staffJabatan');
    if (jabatanSelect) jabatanSelect.value = 'guru';
    const deptSelect = document.getElementById('staffDepartemen');
    if (deptSelect) deptSelect.value = '';
    const noHpInput = document.getElementById('staffNoHp');
    if (noHpInput) noHpInput.value = '';
    const emailInput = document.getElementById('staffEmail');
    if (emailInput) emailInput.value = '';
    
    const editMode = document.getElementById('staffEditMode');
    if (editMode) editMode.value = 'add';
    
    const btnSave = document.getElementById('btnSaveStaff');
    const btnCancel = document.getElementById('btnCancelStaff');
    if (btnSave) {
        btnSave.innerHTML = '➕ Simpan';
        btnSave.style.background = '';
    }
    if (btnCancel) btnCancel.classList.add('hidden');
}

async function deleteStaff(id, nama) {
    if (!canManageStaff()) {
        if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    if (!confirm(`⚠️ Hapus ${nama} dari data guru/karyawan?\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!`)) return;
    
    let userAccount = null;
    if (window.dbData && window.dbData.users_auth) {
        userAccount = window.dbData.users_auth.find(u => u.staffId == id || u.uid == id);
    }
    
    if (userAccount && !confirm(`⚠️ Staff ini memiliki akun user (${userAccount.email}). Hapus juga akunnya?`)) {
        return;
    }
    
    const btn = event?.target;
    if (btn) btn.disabled = true;
    
    try {
        if (userAccount) {
            await window.firebase.database().ref(`users_auth/${userAccount.uid}`).remove();
            if (typeof window.logActivity === 'function') {
                window.logActivity('delete_user', `Hapus akun user ${userAccount.nama} karena staff dihapus`);
            }
        }
        await window.firebase.database().ref(`staff/${id}`).remove();
        staffPhotoCache.delete(id);
        staffListLoaded = false;
        
        if (window.showToast) window.showToast(`✅ ${nama} berhasil dihapus!`, "success");
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('delete_staff', `Hapus staff: ${nama} (ID: ${id})`);
        }
        
        setTimeout(() => renderStaffTable(), 500);
        if (typeof window.renderUsersTable === 'function') window.renderUsersTable();
    } catch (err) {
        if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ======================= MANAJEMEN AKUN USER ========================
async function createStaffUserAccount(staffId, staffName, staffEmail) {
    if (!canManageStaff()) {
        if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    if (!staffEmail) {
        if (window.showToast) window.showToast("❌ Staff tidak memiliki email! Edit data dan isi email terlebih dahulu.", "error");
        return;
    }
    
    if (window.dbData && window.dbData.users_auth) {
        const existingUser = window.dbData.users_auth.find(u => u.email === staffEmail);
        if (existingUser) {
            if (window.showToast) window.showToast(`❌ Email ${staffEmail} sudah terdaftar!`, "error");
            return;
        }
    }
    
    const defaultPassword = `staff${staffId}`;
    
    const btn = event?.target;
    if (btn) btn.disabled = true;
    
    try {
        const userCredential = await window.firebase.auth().createUserWithEmailAndPassword(staffEmail, defaultPassword);
        const user = userCredential.user;
        
        const userData = {
            uid: user.uid,
            email: staffEmail,
            nama: staffName,
            role: 'guru',
            staffId: staffId,
            registeredAt: window.firebase.database.ServerValue.TIMESTAMP
        };
        
        await window.firebase.database().ref(`users_auth/${user.uid}`).set(userData);
        await window.firebase.database().ref(`staff/${staffId}/userId`).set(user.uid);
        
        if (window.showToast) window.showToast(`✅ Akun berhasil dibuat!`, "success");
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('create_staff_account', `Buat akun user untuk staff ${staffName}`);
        }
        
        staffListLoaded = false;
        setTimeout(() => renderStaffTable(), 500);
        if (typeof window.renderUsersTable === 'function') window.renderUsersTable();
        
        alert(`Akun berhasil dibuat!\n\nEmail: ${staffEmail}\nPassword: ${defaultPassword}\n\nHarap berikan password ini kepada staff.`);
        
    } catch (err) {
        console.error("Create staff account error:", err);
        let msg = err.message;
        if (msg.includes('email-already-in-use')) msg = "Email sudah terdaftar!";
        if (window.showToast) window.showToast("❌ Gagal: " + msg, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

function viewUserAccount(userId) {
    if (window.dbData && window.dbData.users_auth) {
        const user = window.dbData.users_auth.find(u => u.uid === userId);
        if (user) {
            if (typeof window.switchTab === 'function') {
                window.switchTab('users');
                setTimeout(() => {
                    if (window.showToast) window.showToast(`👤 Akun: ${user.nama} (${user.email})`, "info");
                }, 500);
            } else {
                if (window.showToast) window.showToast(`👤 Akun: ${user.nama} (${user.email})`, "info");
            }
        } else {
            if (window.showToast) window.showToast("❌ Akun user tidak ditemukan!", "error");
        }
    }
}

async function deleteUserAccount(userId, userName) {
    if (!canManageStaff()) {
        if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    if (!confirm(`⚠️ Hapus akun user ${userName}?\n\nAkun akan dihapus dari sistem login.\nData staff tetap tersimpan.\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!`)) return;
    
    let user = null;
    if (window.dbData && window.dbData.users_auth) {
        user = window.dbData.users_auth.find(u => u.uid === userId);
    }
    
    if (!user) {
        if (window.showToast) window.showToast("❌ Akun user tidak ditemukan!", "error");
        return;
    }
    
    try {
        await window.firebase.database().ref(`users_auth/${userId}`).remove();
        
        const staff = await window.firebase.database().ref('staff').orderByChild('userId').equalTo(userId).once('value');
        if (staff.exists()) {
            const staffKey = Object.keys(staff.val())[0];
            await window.firebase.database().ref(`staff/${staffKey}/userId`).remove();
        }
        
        if (window.showToast) window.showToast(`✅ Akun ${userName} berhasil dihapus!`, "success");
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('delete_user_account', `Hapus akun user ${userName}`);
        }
        
        staffListLoaded = false;
        setTimeout(() => renderStaffTable(), 500);
        if (typeof window.renderUsersTable === 'function') window.renderUsersTable();
        
    } catch (err) {
        console.error("Delete user account error:", err);
        if (window.showToast) window.showToast("❌ Gagal: " + err.message, "error");
    }
}

// ======================= INITIALIZATION ========================
function initStaffSystem() {
    if (staffInitialized) {
        console.log("👥 Staff system already initialized");
        return;
    }
    
    console.log("👥 Initializing Staff system...");
    
    if (!window.currentUser) {
        console.log("⏳ Waiting for currentUser...");
        setTimeout(initStaffSystem, 500);
        return;
    }
    
    if (!window.firebase || !window.firebase.database) {
        console.log("⏳ Waiting for Firebase...");
        setTimeout(initStaffSystem, 500);
        return;
    }
    
    if (!isStaffMenuVisible()) {
        console.log("🔒 Staff system: No access for role:", window.currentUser?.role);
        const staffTab = document.getElementById('tab-staff');
        if (staffTab) staffTab.style.display = 'none';
        const staffBtn = document.querySelector('#dropdownMainContent button[onclick*="staff"]');
        if (staffBtn) staffBtn.style.display = 'none';
        return;
    }
    
    addStaffTab();
    setupStaffListeners();
    
    setTimeout(() => {
        console.log("📊 First render of staff table");
        renderStaffTable();
    }, 1000);
    
    staffInitialized = true;
}

function addStaffTab() {
    if (!isStaffMenuVisible()) {
        console.log("🔒 Staff tab not added - user role:", window.currentUser?.role);
        return;
    }
    
    if (document.getElementById('tab-staff')) return;
    
    const dropdownMainContent = document.getElementById('dropdownMainContent');
    if (dropdownMainContent) {
        const existingBtn = Array.from(dropdownMainContent.children).find(btn => btn.innerHTML === '👥 Data Staff');
        if (!existingBtn) {
            const staffBtn = document.createElement('button');
            staffBtn.setAttribute('onclick', "window.switchTab('staff'); window.closeAllDropdowns()");
            staffBtn.innerHTML = '👥 Data Staff';
            staffBtn.className = 'role-admin role-guru role-developer';
            
            const guideBtn = Array.from(dropdownMainContent.children).find(btn => btn.textContent.includes('Panduan'));
            if (guideBtn) {
                dropdownMainContent.insertBefore(staffBtn, guideBtn);
            } else {
                dropdownMainContent.appendChild(staffBtn);
            }
            console.log("✅ Staff button added to dropdown");
        }
    }
    
    const dashboardSection = document.getElementById('dashboard-section');
    if (dashboardSection && !document.getElementById('tab-staff')) {
        const staffTabHtml = `
            <div id="tab-staff" class="tab-content role-admin role-guru role-developer">
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
                
                <div class="filter-buttons">
                    <button class="filter-btn active" data-filter="all" onclick="window.setStaffFilter('all')">📋 Semua Data</button>
                    <button class="filter-btn" data-filter="withAccount" onclick="window.setStaffFilter('withAccount')">✅ Sudah Berakun</button>
                    <button class="filter-btn" data-filter="withoutAccount" onclick="window.setStaffFilter('withoutAccount')">❌ Belum Berakun</button>
                    <button class="filter-btn" data-filter="fromStaff" onclick="window.setStaffFilter('fromStaff')">📁 Dari Data Staff</button>
                    <button class="filter-btn" data-filter="fromUser" onclick="window.setStaffFilter('fromUser')">👥 Dari Akun User</button>
                </div>
                
                <div class="search-bar">
                    <div class="search-input-wrapper">
                        <input type="text" id="staffSearchInput" class="search-input" placeholder="🔍 Cari staff..." onkeyup="if(event.key === 'Enter') window.searchStaff()">
                        <button class="search-clear-btn" onclick="window.clearSearch()">✖</button>
                    </div>
                    <button class="search-btn" onclick="window.searchStaff()">Cari</button>
                    <button class="reset-btn" onclick="window.resetStaffFilters()">Reset</button>
                </div>
                
                <div id="staffStats"></div>
                
                <div class="controls-bar">
                    <div style="display:flex; gap:10px; flex-wrap:wrap; width:100%;">
                        <input type="hidden" id="staffEditMode" value="add">
                        <div class="filter-group"><label>ID:</label><input type="text" id="staffId" placeholder="ID" style="width:80px; padding:8px; border-radius:8px; border:1px solid var(--border);"></div>
                        <div class="filter-group"><label>Nama:</label><input type="text" id="staffNama" placeholder="Nama Lengkap" style="width:180px; padding:8px; border-radius:8px; border:1px solid var(--border);"></div>
                        <div class="filter-group"><label>Jabatan:</label>
                            <select id="staffJabatan" style="padding:8px; border-radius:8px; border:1px solid var(--border);">
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
                            <select id="staffDepartemen" style="padding:8px; border-radius:8px; border:1px solid var(--border);">
                                <option value="">-- Pilih --</option>
                                <option value="akademik">Akademik</option>
                                <option value="kesiswaan">Kesiswaan</option>
                                <option value="humas">Humas</option>
                                <option value="sapras">Sapras</option>
                                <option value="kurikulum">Kurikulum</option>
                            </select>
                        </div>
                        <div class="filter-group"><label>No. HP:</label><input type="tel" id="staffNoHp" placeholder="No. HP" style="width:120px; padding:8px; border-radius:8px; border:1px solid var(--border);"></div>
                        <div class="filter-group"><label>Email:</label><input type="email" id="staffEmail" placeholder="Email" style="width:180px; padding:8px; border-radius:8px; border:1px solid var(--border);"></div>
                        <button class="btn-action role-guru role-admin" id="btnSaveStaff" onclick="window.saveStaff()" style="background:#00bcd4; border:none; border-radius:8px; padding:8px 20px; color:white; cursor:pointer;">➕ Simpan</button>
                        <button class="btn-action btn-danger hidden" id="btnCancelStaff" onclick="window.resetStaffForm()" style="display:none; background:#f44336; border:none; border-radius:8px; padding:8px 20px; color:white; cursor:pointer;">Batal</button>
                    </div>
                </div>
                
                <div class="table-container" style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--bg-hover);">
                                <th style="padding:12px; text-align:left;">Foto</th>
                                <th style="padding:12px; text-align:left;">ID</th>
                                <th style="padding:12px; text-align:left;">Nama</th>
                                <th style="padding:12px; text-align:left;">Jabatan</th>
                                <th style="padding:12px; text-align:left;">Departemen</th>
                                <th style="padding:12px; text-align:left;">No. HP</th>
                                <th style="padding:12px; text-align:left;">Email</th>
                                <th style="padding:12px; text-align:left;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff">
                            <tr><td colspan="8" style="text-align:center; padding:30px;">⏳ Memuat data...<\/td><\/tr>
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
    if (!window.firebase) return;
    
    window.firebase.database().ref('staff').on('value', () => {
        console.log("🔄 Staff data changed, refreshing...");
        staffListLoaded = false;
        if (document.getElementById('tab-staff')?.classList.contains('active') && isStaffMenuVisible()) {
            renderStaffTable();
        }
    });
    
    window.firebase.database().ref('users_auth').on('value', () => {
        console.log("🔄 Users auth changed, refreshing staff...");
        staffListLoaded = false;
        if (document.getElementById('tab-staff')?.classList.contains('active') && isStaffMenuVisible()) {
            renderStaffTable();
        }
    });
}

function escapeHtmlStaff(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// Tambahkan CSS animation untuk spinner jika belum ada
if (!document.querySelector('#staff-spinner-style')) {
    const style = document.createElement('style');
    style.id = 'staff-spinner-style';
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .filter-btn {
            transition: all 0.3s ease;
            padding: 8px 16px;
            margin: 0 4px;
            border-radius: 20px;
            cursor: pointer;
            border: none;
        }
        
        .filter-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        .search-bar {
            display: flex;
            gap: 10px;
            margin: 15px 0;
            flex-wrap: wrap;
        }
        
        .search-input-wrapper {
            flex: 1;
            position: relative;
        }
        
        .search-input {
            width: 100%;
            padding: 10px 35px 10px 15px;
            border-radius: 30px;
            border: 1px solid var(--border);
            background: var(--bg-input);
            color: var(--text-primary);
        }
        
        .search-clear-btn {
            position: absolute;
            right: 10px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            font-size: 16px;
            color: #888;
        }
        
        .search-btn, .reset-btn {
            padding: 8px 20px;
            border-radius: 30px;
            border: none;
            cursor: pointer;
        }
        
        .search-btn {
            background: #00bcd4;
            color: white;
        }
        
        .reset-btn {
            background: #f44336;
            color: white;
        }
    `;
    document.head.appendChild(style);
}

// ======================= EKSPOR KE GLOBAL =======================
window.initStaffSystem = initStaffSystem;
window.renderStaffTable = renderStaffTable;
window.saveStaff = saveStaff;
window.editStaff = editStaff;
window.resetStaffForm = resetStaffForm;
window.deleteStaff = deleteStaff;
window.openAddStaffForm = openAddStaffForm;
window.createStaffUserAccount = createStaffUserAccount;
window.viewUserAccount = viewUserAccount;
window.deleteUserAccount = deleteUserAccount;
window.showStaffPhotoModal = showStaffPhotoModal;
window.canManageStaff = canManageStaff;
window.getStaffList = getStaffList;
window.isStaffMenuVisible = isStaffMenuVisible;
window.setStaffFilter = setStaffFilter;
window.searchStaff = searchStaff;
window.clearSearch = clearSearch;
window.resetStaffFilters = resetStaffFilters;
// Ekspor fungsi WhatsApp staff
window.sendStaffWhatsAppNotification = sendStaffWhatsAppNotification;
window.saveStaffContact = saveStaffContact;
window.getStaffContact = getStaffContact;
window.openStaffContactModal = openStaffContactModal;
window.saveStaffContactFromModal = saveStaffContactFromModal;
window.testSendStaffWhatsApp = testSendStaffWhatsApp;
// Ekspor fungsi close modal
window.closeStaffContactModal = closeStaffContactModal;
window.closeStaffPhotoModal = closeStaffPhotoModal;

console.log("✅ staff.js V2.11 loaded - Dengan notifikasi WhatsApp untuk staff & perbaikan close modal menggunakan event listener");

// Auto-initialize when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initStaffSystem, 1000);
    });
} else {
    setTimeout(initStaffSystem, 1000);
}