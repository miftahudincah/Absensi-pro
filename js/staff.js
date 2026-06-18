// staff.js - VERSION 3.4 (DENGAN WHATSAPP INTEGRASI)
// Manajemen Data Guru/Karyawan dengan Sinkronisasi penuh ke Akun User
// PERUBAHAN V3.4: 
//   - Menambahkan integrasi WhatsApp untuk notifikasi staff
//   - Menampilkan nomor HP staff di tabel dengan ikon WhatsApp
//   - Menambahkan tombol test WhatsApp untuk staff
//   - Sinkronisasi nomor HP antara staff dan user auth
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

function isStaffMenuVisible() {
    if (!window.currentUser) return false;
    return (window.currentUser.role === 'admin' || window.currentUser.role === 'guru' || window.currentUser.role === 'developer');
}

// ======================= FUNGSI FOTO STAFF DENGAN SYNC YANG BENAR ========================
function getStaffPhotoUrl(staffId, staffName, staffEmail = null) {
    if (!staffId) {
        const initial = staffName ? staffName.charAt(0).toUpperCase() : 'G';
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=ff9800&color=fff&size=100&bold=true`;
    }
    
    // Cek cache dulu
    if (staffPhotoCache.has(staffId)) {
        return staffPhotoCache.get(staffId);
    }
    
    let photoUrl = null;
    let userAuth = null;
    
    // STRATEGI 1: Cari user auth berdasarkan staffId
    if (window.dbData && window.dbData.users_auth) {
        userAuth = window.dbData.users_auth.find(u => u.staffId == staffId);
        
        // STRATEGI 2: Cari berdasarkan uid
        if (!userAuth) {
            userAuth = window.dbData.users_auth.find(u => u.uid == staffId);
        }
        
        // STRATEGI 3: Cari berdasarkan email
        if (!userAuth && staffEmail) {
            userAuth = window.dbData.users_auth.find(u => u.email === staffEmail);
        }
        
        // STRATEGI 4: Cari berdasarkan nama (fallback terakhir)
        if (!userAuth && staffName) {
            userAuth = window.dbData.users_auth.find(u => u.nama === staffName);
        }
    }
    
    // Jika ada user auth, ambil foto dari akun
    if (userAuth && userAuth.photoUrl && userAuth.photoUrl !== 'null' && userAuth.photoUrl !== 'undefined' && userAuth.photoUrl !== '') {
        photoUrl = userAuth.photoUrl;
        // Tambahkan timestamp untuk bypass cache browser
        const separator = photoUrl.includes('?') ? '&' : '?';
        photoUrl = photoUrl + separator + 't=' + Date.now();
        console.log(`📸 Staff ${staffName} (${staffId}) using photo from user account: ${userAuth.email}`);
    }
    
    // Fallback ke avatar inisial jika tidak ada foto
    if (!photoUrl) {
        const initial = staffName ? staffName.charAt(0).toUpperCase() : 'G';
        photoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(initial)}&background=ff9800&color=fff&size=100&bold=true`;
        console.log(`📸 Staff ${staffName} (${staffId}) using avatar fallback (no account photo)`);
    }
    
    // Simpan ke cache
    staffPhotoCache.set(staffId, photoUrl);
    return photoUrl;
}

/**
 * Refresh foto untuk staff tertentu (paksa ambil dari Firebase)
 */
async function refreshStaffPhoto(staffId) {
    if (!staffId) return;
    
    // Hapus cache lama
    staffPhotoCache.delete(staffId);
    
    try {
        // Ambil data user auth terbaru dari Firebase
        let userAuth = null;
        
        // Cari berdasarkan staffId
        const snapshotByStaffId = await db.ref('users_auth').orderByChild('staffId').equalTo(staffId).once('value');
        if (snapshotByStaffId.exists()) {
            const entries = Object.entries(snapshotByStaffId.val());
            if (entries.length > 0) {
                userAuth = { uid: entries[0][0], ...entries[0][1] };
            }
        }
        
        // Cari berdasarkan uid
        if (!userAuth) {
            const snapshotByUid = await db.ref(`users_auth/${staffId}`).once('value');
            if (snapshotByUid.exists()) {
                userAuth = { uid: staffId, ...snapshotByUid.val() };
            }
        }
        
        if (userAuth && userAuth.photoUrl) {
            // Update foto di node staff
            await db.ref(`staff/${staffId}/photoUrl`).set(userAuth.photoUrl);
            await db.ref(`staff/${staffId}/syncedAt`).set(firebase.database.ServerValue.TIMESTAMP);
            console.log(`✅ Staff ${staffId} photo refreshed from user account`);
        }
        
        // Refresh tampilan
        if (document.getElementById('tab-staff')?.classList.contains('active')) {
            renderStaffTable();
        }
        
    } catch (error) {
        console.error(`Error refreshing staff photo for ${staffId}:`, error);
    }
}

// ======================= SINKRONISASI DATA STAFF DARI AKUN USER ========================
/**
 * Sinkronkan data staff dari user auth
 * Memastikan data staff selalu up-to-date dengan akun user
 */
async function syncStaffFromUserAccount(staffId, userId = null) {
    if (!staffId) return null;
    
    try {
        let userAuth = null;
        
        // Cari user berdasarkan staffId atau userId
        if (window.dbData && window.dbData.users_auth) {
            userAuth = window.dbData.users_auth.find(u => u.staffId == staffId);
            if (!userAuth && userId) {
                userAuth = window.dbData.users_auth.find(u => u.uid === userId);
            }
        }
        
        // Jika tidak ditemukan di cache, ambil dari Firebase
        if (!userAuth) {
            const snapshot = await db.ref('users_auth').orderByChild('staffId').equalTo(staffId).once('value');
            if (snapshot.exists()) {
                const entries = Object.entries(snapshot.val());
                if (entries.length > 0) {
                    userAuth = { uid: entries[0][0], ...entries[0][1] };
                }
            }
        }
        
        if (!userAuth && userId) {
            const snapshot = await db.ref(`users_auth/${userId}`).once('value');
            if (snapshot.exists()) {
                userAuth = { uid: userId, ...snapshot.val() };
            }
        }
        
        if (userAuth) {
            // Update data staff dari akun user
            const staffUpdates = {};
            
            if (userAuth.nama) staffUpdates.nama = userAuth.nama;
            if (userAuth.email) staffUpdates.email = userAuth.email;
            if (userAuth.photoUrl) staffUpdates.photoUrl = userAuth.photoUrl;
            if (userAuth.noHp) staffUpdates.noHp = userAuth.noHp;
            
            if (userAuth.role === 'guru' || userAuth.role === 'admin' || userAuth.role === 'wakil_kepala' || userAuth.role === 'staff_tu') {
                const roleToJabatan = {
                    'admin': 'kepala_sekolah',
                    'wakil_kepala': 'wakil_kepala',
                    'staff_tu': 'staff_tu',
                    'guru': 'guru'
                };
                if (!staffUpdates.jabatan) staffUpdates.jabatan = roleToJabatan[userAuth.role] || 'guru';
            }
            staffUpdates.userId = userAuth.uid;
            staffUpdates.syncedAt = firebase.database.ServerValue.TIMESTAMP;
            
            // Simpan ke node staff
            await db.ref(`staff/${staffId}`).update(staffUpdates);
            
            // Clear cache foto
            staffPhotoCache.delete(staffId);
            
            console.log(`🔄 Staff ${staffId} synced from user account: ${userAuth.nama}`);
            return staffUpdates;
        }
    } catch (error) {
        console.error(`Error syncing staff ${staffId}:`, error);
    }
    
    return null;
}

/**
 * Sinkronkan semua staff dari akun user
 * Dipanggil saat inisialisasi atau saat data user berubah
 */
async function syncAllStaffFromUserAccounts() {
    console.log("🔄 Syncing all staff from user accounts...");
    
    if (!window.dbData || !window.dbData.users_auth) {
        console.log("⏳ Users auth data not ready yet");
        return;
    }
    
    // Ambil semua user dengan role guru, admin, wakil_kepala, staff_tu
    const staffUsers = window.dbData.users_auth.filter(u => 
        ['guru', 'admin', 'wakil_kepala', 'staff_tu', 'developer'].includes(u.role)
    );
    
    console.log(`📋 Found ${staffUsers.length} users with staff roles`);
    
    let syncedCount = 0;
    
    for (const user of staffUsers) {
        let staffId = user.staffId;
        
        // Jika tidak ada staffId, coba cari berdasarkan email atau uid di node staff
        if (!staffId) {
            const staffSnapshot = await db.ref('staff').once('value');
            const staffData = staffSnapshot.val();
            
            if (staffData) {
                const existingStaff = Object.entries(staffData).find(([id, data]) => 
                    data.email === user.email || data.userId === user.uid
                );
                if (existingStaff) {
                    staffId = existingStaff[0];
                }
            }
        }
        
        // Jika masih tidak ada staffId, buat staffId baru berdasarkan uid atau email
        if (!staffId) {
            staffId = user.uid;
        }
        
        // Update data staff
        const staffUpdates = {
            id: staffId,
            nama: user.nama,
            email: user.email,
            jabatan: user.role === 'admin' ? 'kepala_sekolah' : 
                     (user.role === 'wakil_kepala' ? 'wakil_kepala' :
                     (user.role === 'staff_tu' ? 'staff_tu' : 
                     (user.role === 'developer' ? 'developer' : 'guru'))),
            departemen: user.departemen || '-',
            noHp: user.noHp || '-',
            userId: user.uid,
            photoUrl: user.photoUrl || null,
            syncedAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        try {
            await db.ref(`staff/${staffId}`).update(staffUpdates);
            syncedCount++;
            
            // Clear cache foto
            staffPhotoCache.delete(staffId);
        } catch (error) {
            console.error(`Error syncing staff ${staffId}:`, error);
        }
    }
    
    console.log(`✅ Synced ${syncedCount} staff from user accounts`);
    
    // Refresh staff list
    staffListLoaded = false;
    if (document.getElementById('tab-staff')?.classList.contains('active')) {
        renderStaffTable();
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

// ======================= AMBIL DATA STAFF DENGAN SYNC ========================
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
                const staff = { ...staffData[key], source: 'staff', id: key };
                
                // Cek apakah ada user auth yang terhubung
                let userAuth = null;
                if (window.dbData && window.dbData.users_auth) {
                    userAuth = window.dbData.users_auth.find(u => u.staffId == key || u.uid == staff.userId);
                    if (!userAuth && staff.email) {
                        userAuth = window.dbData.users_auth.find(u => u.email === staff.email);
                    }
                    if (!userAuth && staff.nama) {
                        userAuth = window.dbData.users_auth.find(u => u.nama === staff.nama);
                    }
                }
                
                // Sinkronkan data dari user auth
                if (userAuth) {
                    if (userAuth.nama && (!staff.nama || staff.nama !== userAuth.nama)) staff.nama = userAuth.nama;
                    if (userAuth.email && (!staff.email || staff.email !== userAuth.email)) staff.email = userAuth.email;
                    if (userAuth.photoUrl) staff.photoUrl = userAuth.photoUrl;
                    if (userAuth.noHp && (!staff.noHp || staff.noHp === '-')) staff.noHp = userAuth.noHp;
                    if (!staff.userId) staff.userId = userAuth.uid;
                    
                    // Map role ke jabatan
                    if (userAuth.role === 'admin') staff.jabatan = 'kepala_sekolah';
                    else if (userAuth.role === 'wakil_kepala') staff.jabatan = 'wakil_kepala';
                    else if (userAuth.role === 'staff_tu') staff.jabatan = 'staff_tu';
                    else if (userAuth.role === 'developer') staff.jabatan = 'developer';
                    else if (userAuth.role === 'guru' && (!staff.jabatan || staff.jabatan === '-')) staff.jabatan = 'guru';
                    
                    staff.fromUserAuth = true;
                    staff.userAccount = userAuth;
                }
                
                staffMap.set(key, staff);
            });
            console.log(`📁 Found ${Object.keys(staffData).length} staff from 'staff' node`);
        }
        
        const users = window.dbData?.users_auth || [];
        const guruUsers = users.filter(u => ['guru', 'admin', 'wakil_kepala', 'staff_tu', 'developer'].includes(u.role));
        
        console.log(`👥 Found ${guruUsers.length} users with staff roles`);
        
        for (const user of guruUsers) {
            // Cari staff berdasarkan userId, staffId, email, atau nama
            let existingStaff = null;
            let staffId = null;
            
            // Cari berdasarkan userId
            if (user.uid) {
                existingStaff = staffMap.get(user.uid);
                if (existingStaff) staffId = user.uid;
            }
            
            // Cari berdasarkan staffId
            if (!existingStaff && user.staffId) {
                existingStaff = staffMap.get(user.staffId);
                if (existingStaff) staffId = user.staffId;
            }
            
            // Cari berdasarkan email
            if (!existingStaff && user.email) {
                for (const [id, staff] of staffMap.entries()) {
                    if (staff.email === user.email) {
                        existingStaff = staff;
                        staffId = id;
                        break;
                    }
                }
            }
            
            // Cari berdasarkan nama
            if (!existingStaff && user.nama) {
                for (const [id, staff] of staffMap.entries()) {
                    if (staff.nama === user.nama) {
                        existingStaff = staff;
                        staffId = id;
                        break;
                    }
                }
            }
            
            if (!existingStaff) {
                // Buat staff baru dari user auth
                staffId = user.uid;
                staffMap.set(staffId, {
                    id: staffId,
                    nama: user.nama || user.email?.split('@')[0] || 'Unknown',
                    jabatan: user.role === 'admin' ? 'kepala_sekolah' : 
                             (user.role === 'wakil_kepala' ? 'wakil_kepala' :
                             (user.role === 'staff_tu' ? 'staff_tu' :
                             (user.role === 'developer' ? 'developer' : 'guru'))),
                    departemen: user.departemen || '-',
                    noHp: user.noHp || '-',
                    email: user.email,
                    userId: user.uid,
                    photoUrl: user.photoUrl || null,
                    source: 'user_auth',
                    fromUserAuth: true,
                    userAccount: user
                });
            } else if (existingStaff.source === 'staff' && !existingStaff.userId) {
                existingStaff.userId = user.uid;
                existingStaff.email = existingStaff.email || user.email;
                if (user.photoUrl && !existingStaff.photoUrl) existingStaff.photoUrl = user.photoUrl;
                if (user.nama && existingStaff.nama !== user.nama) existingStaff.nama = user.nama;
                if (user.noHp && (!existingStaff.noHp || existingStaff.noHp === '-')) existingStaff.noHp = user.noHp;
                existingStaff.userAccount = user;
                
                // Update ke Firebase
                window.firebase.database().ref(`staff/${staffId}`).update({
                    userId: user.uid,
                    email: existingStaff.email,
                    nama: existingStaff.nama,
                    photoUrl: existingStaff.photoUrl,
                    noHp: existingStaff.noHp
                }).catch(e => console.warn("Update staff failed:", e));
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
    
    console.log(`✅ Staff list loaded: ${staffList.length} staff total (${staffList.filter(s => s.fromUserAuth).length} from user auth)`);
    return staffList;
}

// ======================= RENDER TABEL STAFF (DENGAN WHATSAPP) ========================
async function renderStaffTable() {
    console.log("👥 renderStaffTable dipanggil");
    
    if (!isStaffMenuVisible()) {
        console.log("🔒 Staff table hidden for role:", window.currentUser?.role);
        const tbody = document.getElementById('tbody-staff');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:40px;">
                <div style="font-size: 48px; margin-bottom: 16px;">🔒</div>
                <h3>Akses Terbatas</h3>
                <p style="color: var(--text-muted);">Anda tidak memiliki akses ke halaman ini.</p>
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
                    table.style.cssText = 'width:100%; border-collapse:collapse;';
                    table.innerHTML = `
                        <thead>
                            <tr style="background:var(--bg-hover); border-bottom: 2px solid var(--border);">
                                <th style="padding:14px 12px; text-align:left; font-weight:600;">Foto</th>
                                <th style="padding:14px 12px; text-align:left; font-weight:600;">ID</th>
                                <th style="padding:14px 12px; text-align:left; font-weight:600;">Nama Staff</th>
                                <th style="padding:14px 12px; text-align:left; font-weight:600;">Jabatan</th>
                                <th style="padding:14px 12px; text-align:left; font-weight:600;">Departemen</th>
                                <th style="padding:14px 12px; text-align:left; font-weight:600;">Kontak</th>
                                <th style="padding:14px 12px; text-align:left; font-weight:600;">Aksi</th>
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
    
    // Tampilkan loading skeleton
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="text-align:center; padding:40px;">
                <div style="display:inline-block; width:36px; height:36px; border:3px solid var(--border); border-top-color:#00bcd4; border-radius:50%; animation: spin 1s linear infinite;"></div>
                <div style="margin-top:12px; color: var(--text-muted);">⏳ Memuat data staff...</div>
            </td>
        </tr>
    `;
    
    try {
        const staffList = await getStaffList(true);
        
        if (!staffList || staffList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:60px 20px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📭</div>
                        <h3 style="margin-bottom: 8px;">Belum Ada Data Staff</h3>
                        <p style="color: var(--text-muted); margin-bottom: 20px;">Silakan tambah guru/karyawan melalui form di atas.</p>
                        <button onclick="openAddStaffForm()" style="padding:10px 24px; background:#00bcd4; border:none; border-radius:30px; color:white; cursor:pointer; font-weight:500;">
                            ➕ Tambah Staff Baru
                        </button>
                        <div style="margin-top: 16px;">
                            <small style="color: var(--text-muted);">💡 Tips: Tambah user dengan role "Guru" di Manajemen User juga akan muncul di sini</small>
                        </div>
                    </div>
                </tr>
            `;
            updateStaffStatistics(staffList || []);
            return;
        }
        
        const filteredStaff = filterStaffList(staffList);
        
        if (filteredStaff.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding:60px 20px;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                        <h3 style="margin-bottom: 8px;">Tidak Ada Data yang Sesuai</h3>
                        <p style="color: var(--text-muted); margin-bottom: 20px;">Tidak ditemukan staff dengan filter atau pencarian yang dipilih.</p>
                        <button onclick="resetStaffFilters()" style="padding:10px 24px; background:#00bcd4; border:none; border-radius:30px; color:white; cursor:pointer; font-weight:500;">
                            🔄 Reset Filter
                        </button>
                    </div>
                </tr>
            `;
            updateStaffStatistics(staffList);
            return;
        }
        
        const canEdit = canManageStaff();
        tbody.innerHTML = '';
        
        for (const staff of filteredStaff) {
            // Gunakan foto dari akun user jika ada
            const photoUrl = getStaffPhotoUrl(staff.id, staff.nama, staff.email);
            const initial = staff.nama ? staff.nama.charAt(0).toUpperCase() : 'G';
            const safeId = escapeHtmlStaff(String(staff.id));
            const safeNama = escapeHtmlStaff(staff.nama);
            
            let hasAccount = false;
            let userAccountInfo = null;
            if (window.dbData && window.dbData.users_auth) {
                const userAuth = window.dbData.users_auth.find(u => u.staffId == staff.id || u.uid == staff.id || u.email === staff.email || u.nama === staff.nama);
                hasAccount = !!userAuth;
                userAccountInfo = userAuth;
            }
            
            // Badge Akun dengan tooltip
            const accountBadge = hasAccount 
                ? `<span style="background:#4caf50; color:white; font-size:10px; padding:3px 8px; border-radius:20px; margin-left:6px;" title="Email akun: ${userAccountInfo?.email || '-'}">✓ Berakun</span>` 
                : '<span style="background:#ff9800; color:white; font-size:10px; padding:3px 8px; border-radius:20px; margin-left:6px;" title="Belum memiliki akun login">❌ Belum Berakun</span>';
            
            // ========== WHATSAPP BADGE ==========
            const phoneNumber = staff.noHp || userAccountInfo?.noHp || '';
            const hasWhatsApp = phoneNumber && phoneNumber !== '-' && phoneNumber !== '';
            const waBadge = hasWhatsApp 
                ? `<span style="background:#25D366; color:white; font-size:10px; padding:3px 8px; border-radius:20px; margin-left:6px;" title="Nomor WhatsApp: ${escapeHtmlStaff(phoneNumber)}">📱 WA</span>` 
                : '';
            
            // Jabatan dengan icon
            let jabatanIcon = '👨‍🏫';
            let jabatanDisplay = staff.jabatan || '-';
            if (jabatanDisplay === 'kepala_sekolah') { jabatanIcon = '👑'; jabatanDisplay = 'Kepala Sekolah'; }
            else if (jabatanDisplay === 'wakil_kepala') { jabatanIcon = '👔'; jabatanDisplay = 'Wakil Kepala'; }
            else if (jabatanDisplay === 'staff_tu') { jabatanIcon = '📋'; jabatanDisplay = 'Staff TU'; }
            else if (jabatanDisplay === 'guru') { jabatanIcon = '👨‍🏫'; jabatanDisplay = 'Guru'; }
            else if (jabatanDisplay === 'pustakawan') { jabatanIcon = '📚'; jabatanDisplay = 'Pustakawan'; }
            else if (jabatanDisplay === 'laboran') { jabatanIcon = '🔬'; jabatanDisplay = 'Laboran'; }
            else if (jabatanDisplay === 'security') { jabatanIcon = '🛡️'; jabatanDisplay = 'Security'; }
            else if (jabatanDisplay === 'kebersihan') { jabatanIcon = '🧹'; jabatanDisplay = 'Kebersihan'; }
            else if (jabatanDisplay === 'developer') { jabatanIcon = '👨‍💻'; jabatanDisplay = 'Developer'; }
            
            // Informasi kontak (prioritaskan dari akun user)
            let kontakHtml = '';
            let displayPhone = staff.noHp && staff.noHp !== '-' ? staff.noHp : (userAccountInfo?.noHp || '-');
            let displayEmail = staff.email && staff.email !== '-' ? staff.email : (userAccountInfo?.email || '-');
            
            if (displayPhone && displayPhone !== '-') {
                const formattedPhone = formatPhoneDisplay(displayPhone);
                kontakHtml += `<div style="display:flex; align-items:center; gap:4px; margin-bottom:4px;">
                    <span style="font-size:14px; color:#25D366;">📱</span> 
                    <span style="font-size:13px;">${escapeHtmlStaff(formattedPhone)}</span>
                    ${hasWhatsApp ? `<span style="font-size:10px; color:#25D366;">(WA)</span>` : ''}
                </div>`;
            }
            if (displayEmail && displayEmail !== '-') {
                kontakHtml += `<div style="display:flex; align-items:center; gap:4px;">
                    <span style="font-size:14px;">✉️</span> 
                    <span style="font-size:13px;">${escapeHtmlStaff(displayEmail)}</span>
                </div>`;
            }
            if (!kontakHtml) {
                kontakHtml = '<span style="color: var(--text-muted); font-size:12px;">-</span>';
            }
            
            // Source badge
            const sourceBadge = staff.source === 'user_auth' || staff.fromUserAuth
                ? '<div><span style="background:#2196f3; color:white; font-size:9px; padding:2px 6px; border-radius:12px;" title="Data diambil dari akun user">👥 Dari Akun User</span></div>' 
                : '<div><span style="background:#ff9800; color:white; font-size:9px; padding:2px 6px; border-radius:12px;" title="Data ditambahkan manual">📁 Data Manual</span></div>';
            
            // ========== ACTION BUTTONS (DENGAN WHATSAPP) ==========
            let actionButtons = '';
            if (canEdit) {
                const isFromUserAuth = staff.source === 'user_auth' || staff.fromUserAuth;
                
                // Tombol test WhatsApp (jika ada nomor)
                const waTestBtn = hasWhatsApp 
                    ? `<button onclick="testStaffWhatsApp('${safeId}', '${safeNama}', '${escapeHtmlStaff(displayPhone)}')" class="staff-action-btn wa-test" title="Test Kirim WA" style="background:#25D366; color:white; border:none; border-radius:10px; padding:6px 10px; cursor:pointer; font-size:14px;">📱</button>` 
                    : '';
                
                if (!isFromUserAuth) {
                    actionButtons = `
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <button onclick="editStaff('${safeId}')" class="staff-action-btn edit" title="Edit Staff">✏️</button>
                            <button onclick="deleteStaff('${safeId}', '${safeNama}')" class="staff-action-btn delete" title="Hapus Staff">🗑️</button>
                            ${!hasAccount ? `<button onclick="createStaffUserAccount('${safeId}', '${safeNama}', '${escapeHtmlStaff(displayEmail)}')" class="staff-action-btn create-account" title="Buat Akun User">👤</button>` : ''}
                            ${hasAccount && userAccountInfo?.photoUrl ? `<button onclick="refreshStaffPhoto('${safeId}')" class="staff-action-btn refresh" title="Refresh Foto">🔄</button>` : ''}
                            ${waTestBtn}
                        </div>
                    `;
                } else {
                    actionButtons = `
                        <div style="display:flex; gap:6px; flex-wrap:wrap;">
                            <button onclick="viewUserAccount('${staff.userId || safeId}')" class="staff-action-btn view" title="Lihat Akun">👁️</button>
                            <button onclick="deleteUserAccount('${staff.userId || safeId}', '${safeNama}')" class="staff-action-btn delete" title="Hapus Akun">🗑️</button>
                            <button onclick="refreshStaffPhoto('${safeId}')" class="staff-action-btn refresh" title="Refresh Foto">🔄</button>
                            ${waTestBtn}
                        </div>
                    `;
                }
            } else {
                actionButtons = '<span style="color: var(--text-muted);">-</span>';
            }
            
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.backgroundColor='var(--bg-hover)'" onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding:12px;">
                        <div style="display:flex; justify-content:center;">
                            <img src="${photoUrl}" 
                                 class="staff-avatar"
                                 style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; cursor: pointer; border: 2px solid #ff9800;"
                                 onerror="this.src='https://ui-avatars.com/api/?name=${initial}&background=ff9800&color=fff&size=100&bold=true'"
                                 onclick="showStaffPhotoModal('${safeId}', '${safeNama}', this.src)">
                        </div>
                    </td>
                    <td style="padding:12px;">
                        <strong style="font-family: monospace; font-size: 14px;">${safeId}</strong>
                        ${sourceBadge}
                    </td>
                    <td style="padding:12px;">
                        <div style="font-weight: 600; font-size: 15px;">${safeNama}</div>
                        <div style="display:flex; gap:4px; margin-top:4px; flex-wrap:wrap;">${accountBadge} ${waBadge}</div>
                    </td>
                    <td style="padding:12px;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="font-size: 18px;">${jabatanIcon}</span>
                            <span>${escapeHtmlStaff(jabatanDisplay)}</span>
                        </div>
                    </td>
                    <td style="padding:12px;">
                        <span style="background: var(--bg-input); padding:4px 10px; border-radius:20px; font-size:12px;">
                            ${escapeHtmlStaff(staff.departemen || '-')}
                        </span>
                    </td>
                    <td style="padding:12px;">
                        ${kontakHtml}
                    </td>
                    <td style="padding:12px; text-align:center;">
                        ${actionButtons}
                    </td>
                </tr>
            `;
        }
        
        updateStaffStatistics(staffList, filteredStaff.length);
        console.log(`✅ renderStaffTable selesai, ${filteredStaff.length}/${staffList.length} staff ditampilkan`);
        
    } catch (err) {
        console.error("❌ Error in renderStaffTable:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:60px 20px;">
                    <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
                    <h3 style="margin-bottom: 8px; color: #f44336;">Gagal Memuat Data</h3>
                    <p style="color: var(--text-muted); margin-bottom: 20px;">${escapeHtmlStaff(err.message)}</p>
                    <button onclick="renderStaffTable()" style="padding:10px 24px; background:#00bcd4; border:none; border-radius:30px; color:white; cursor:pointer; font-weight:500;">
                        🔄 Coba Lagi
                    </button>
                  </div>
            </tr>
        `;
    }
}

/**
 * Format nomor telepon untuk tampilan
 * @param {string} phone - Nomor telepon
 * @returns {string} Nomor yang diformat
 */
function formatPhoneDisplay(phone) {
    if (!phone) return '-';
    // Hapus semua karakter non-digit
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length <= 4) return cleaned;
    if (cleaned.length <= 8) return cleaned.substring(0, 4) + '-' + cleaned.substring(4);
    if (cleaned.length <= 12) return cleaned.substring(0, 4) + '-' + cleaned.substring(4, 8) + '-' + cleaned.substring(8);
    return cleaned.substring(0, 4) + '-' + cleaned.substring(4, 8) + '-' + cleaned.substring(8, 12) + '-' + cleaned.substring(12);
}

/**
 * Test kirim WhatsApp ke staff
 */
async function testStaffWhatsApp(staffId, staffName, phoneNumber) {
    if (!phoneNumber || phoneNumber === '-') {
        showToast("❌ Tidak ada nomor WhatsApp untuk staff ini!", "error");
        return;
    }
    
    if (typeof sendWhatsAppMessage !== 'function') {
        showToast("❌ Fungsi WhatsApp tidak tersedia!", "error");
        return;
    }
    
    const schoolName = document.getElementById('schoolNameDisplay')?.innerText || 'Sekolah';
    const message = `*🧪 TEST NOTIFIKASI STAFF - ${schoolName}*

Halo *${staffName}*,

Ini adalah pesan test dari Sistem Absensi.

👤 *Staff:* ${staffName}
🆔 *ID:* ${staffId}

✅ Sistem WhatsApp berjalan dengan baik!
📱 Anda akan menerima notifikasi saat Anda absen masuk/pulang.

--- 
📱 *Sistem Absensi IoT*
🔔 Test dikirim: ${new Date().toLocaleString('id-ID')}`;
    
    showToast(`📤 Mengirim test WA ke ${formatPhoneDisplay(phoneNumber)}...`, "info");
    
    const result = await sendWhatsAppMessage(phoneNumber, message, 'test_staff');
    
    if (result.success) {
        showToast(`✅ Test WA berhasil dikirim ke ${formatPhoneDisplay(phoneNumber)}`, "success");
        if (typeof logActivity === 'function') {
            logActivity('test_whatsapp_staff', `Test WA ke staff ${staffName} (${staffId})`);
        }
    } else {
        showToast(`❌ Gagal mengirim test WA: ${result.error || 'Unknown error'}`, "error");
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
                statsContainer.style.marginBottom = '20px';
                filterButtons.insertAdjacentElement('afterend', statsContainer);
            }
        }
        if (!statsContainer) return;
    }
    
    const total = staffList.length;
    const displayCount = filteredCount !== null ? filteredCount : total;
    let withAccount = 0;
    let withWhatsApp = 0;
    let syncedCount = 0;
    
    if (window.dbData && window.dbData.users_auth) {
        withAccount = staffList.filter(s => s.userId || s.fromUserAuth || 
            window.dbData.users_auth.some(u => u.uid === s.id || u.staffId === s.id || u.email === s.email || u.nama === s.nama)).length;
        syncedCount = staffList.filter(s => s.fromUserAuth || window.dbData.users_auth.some(u => u.staffId == s.id)).length;
    }
    
    // Hitung staff dengan WhatsApp
    withWhatsApp = staffList.filter(s => s.noHp && s.noHp !== '-' && s.noHp !== '').length;
    
    const withoutAccount = total - withAccount;
    const withoutWhatsApp = total - withWhatsApp;
    const fromUserAuth = staffList.filter(s => s.source === 'user_auth' || s.fromUserAuth).length;
    const fromStaffNode = staffList.filter(s => s.source === 'staff' && !s.fromUserAuth).length;
    
    const filterInfo = (displayCount !== total) ? `<span style="color:#00bcd4;"> (Menampilkan ${displayCount} dari ${total})</span>` : '';
    
    statsContainer.innerHTML = `
        <div style="display:flex; gap:20px; flex-wrap:wrap; padding:16px 20px; background: var(--bg-card); border-radius:16px; border:1px solid var(--border);">
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px;">👥</span>
                <div><strong style="font-size:18px;">${total}</strong><br><span style="font-size:11px; color:var(--text-muted);">Total Staff</span></div>
                ${filterInfo}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px;">✅</span>
                <div><strong style="font-size:18px; color:#4caf50;">${withAccount}</strong><br><span style="font-size:11px; color:var(--text-muted);">Sudah Berakun</span></div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px;">❌</span>
                <div><strong style="font-size:18px; color:#f44336;">${withoutAccount}</strong><br><span style="font-size:11px; color:var(--text-muted);">Belum Berakun</span></div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px; color:#25D366;">📱</span>
                <div><strong style="font-size:18px; color:#25D366;">${withWhatsApp}</strong><br><span style="font-size:11px; color:var(--text-muted);">Ada WhatsApp</span></div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px;">📱</span>
                <div><strong style="font-size:18px; color:#888;">${withoutWhatsApp}</strong><br><span style="font-size:11px; color:var(--text-muted);">Tanpa WhatsApp</span></div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px;">👥</span>
                <div><strong style="font-size:18px; color:#2196f3;">${fromUserAuth}</strong><br><span style="font-size:11px; color:var(--text-muted);">Terintegrasi Akun</span></div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:20px;">📁</span>
                <div><strong style="font-size:18px; color:#ff9800;">${fromStaffNode}</strong><br><span style="font-size:11px; color:var(--text-muted);">Data Manual</span></div>
            </div>
        </div>
    `;
}

// ======================= MODAL FOTO ========================
function showStaffPhotoModal(staffId, staffName, photoUrl) {
    const modalId = 'modal-staff-photo';
    const existingModal = document.getElementById(modalId);
    if (existingModal) existingModal.remove();
    
    // Cari informasi akun untuk ditampilkan
    let userAccountInfo = null;
    if (window.dbData && window.dbData.users_auth) {
        userAccountInfo = window.dbData.users_auth.find(u => u.staffId == staffId || u.uid == staffId || u.email === staffId || u.nama === staffName);
    }
    
    const accountInfo = userAccountInfo 
        ? `<div style="margin-top: 12px; padding: 10px; background: rgba(76, 175, 80, 0.1); border-radius: 12px;">
            <small>✅ Akun terhubung: <strong>${escapeHtmlStaff(userAccountInfo.email || '-')}</strong></small><br>
            <small>👤 Nama akun: <strong>${escapeHtmlStaff(userAccountInfo.nama || '-')}</strong></small>
            ${userAccountInfo.photoUrl ? `<small>📸 Foto profil: <strong>Tersedia</strong></small>` : '<small>📸 Foto profil: <strong>Belum diupload</strong></small>'}
            ${userAccountInfo.noHp ? `<small>📱 WhatsApp: <strong>${escapeHtmlStaff(userAccountInfo.noHp)}</strong></small>` : ''}
           </div>`
        : '<div style="margin-top: 12px; padding: 10px; background: rgba(255, 152, 0, 0.1); border-radius: 12px;"><small>⚠️ Staff ini belum memiliki akun user. Klik tombol 👤 untuk membuat akun.</small></div>';
    
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
                    ${accountInfo}
                    <div style="margin-top: 12px;">
                        <button onclick="refreshStaffPhoto('${staffId}')" class="btn-action btn-primary" style="background: #00bcd4; border: none; padding: 6px 16px; border-radius: 20px; color: white; cursor: pointer;">
                            🔄 Refresh Foto
                        </button>
                    </div>
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

// ======================= CRUD STAFF ========================
function openAddStaffForm() {
    if (!isStaffMenuVisible()) {
        if (window.showToast) window.showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    resetStaffForm();
    document.getElementById('staffId')?.focus();
    
    // Scroll ke form
    const formElement = document.querySelector('#tab-staff .controls-bar');
    if (formElement) {
        formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    
    if (mode === 'add') {
        staffData.createdAt = firebase.database.ServerValue.TIMESTAMP;
        
        // Cek apakah sudah ada staff dengan ID yang sama
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
                const phoneInfo = noHp ? `, WA: ${noHp}` : '';
                window.logActivity('add_staff', `Tambah staff: ${nama} (ID: ${id})${phoneInfo}`);
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
                const phoneInfo = noHp ? `, WA: ${noHp}` : '';
                window.logActivity('edit_staff', `Edit staff: ${nama} (ID: ${id})${phoneInfo}`);
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
        
        // Scroll ke form
        const formElement = document.querySelector('#tab-staff .controls-bar');
        if (formElement) {
            formElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
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
            registeredAt: firebase.database.ServerValue.TIMESTAMP
        };
        
        await window.firebase.database().ref(`users_auth/${user.uid}`).set(userData);
        await window.firebase.database().ref(`staff/${staffId}/userId`).set(user.uid);
        
        // Sync data dari staff ke user
        const staffSnapshot = await window.firebase.database().ref(`staff/${staffId}`).once('value');
        const staffData = staffSnapshot.val();
        if (staffData && staffData.noHp) {
            await window.firebase.database().ref(`users_auth/${user.uid}/noHp`).set(staffData.noHp);
        }
        
        if (window.showToast) window.showToast(`✅ Akun berhasil dibuat!`, "success");
        
        if (typeof window.logActivity === 'function') {
            window.logActivity('create_staff_account', `Buat akun user untuk staff ${staffName}`);
        }
        
        // Clear cache
        staffPhotoCache.delete(staffId);
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

// ======================= SETUP REAL-TIME SYNC LISTENERS ========================
function setupStaffSyncListeners() {
    if (!window.firebase) return;
    
    // Listener untuk perubahan di users_auth
    window.firebase.database().ref('users_auth').on('child_changed', (snapshot) => {
        const userData = snapshot.val();
        if (userData && ['guru', 'admin', 'wakil_kepala', 'staff_tu', 'developer'].includes(userData.role)) {
            console.log(`🔄 User ${userData.nama} updated, syncing staff data...`);
            
            // Cari staff yang terhubung
            const staffId = userData.staffId || userData.uid;
            if (staffId) {
                // Update data staff
                const staffUpdates = {
                    nama: userData.nama,
                    email: userData.email,
                    noHp: userData.noHp || '-',
                    photoUrl: userData.photoUrl || null,
                    updatedAt: firebase.database.ServerValue.TIMESTAMP
                };
                
                // Map role ke jabatan jika perlu
                if (userData.role === 'admin') staffUpdates.jabatan = 'kepala_sekolah';
                else if (userData.role === 'wakil_kepala') staffUpdates.jabatan = 'wakil_kepala';
                else if (userData.role === 'staff_tu') staffUpdates.jabatan = 'staff_tu';
                else if (userData.role === 'developer') staffUpdates.jabatan = 'developer';
                else if (userData.role === 'guru') staffUpdates.jabatan = 'guru';
                
                window.firebase.database().ref(`staff/${staffId}`).update(staffUpdates)
                    .then(() => {
                        // Clear cache
                        staffPhotoCache.delete(staffId);
                        staffListLoaded = false;
                        if (document.getElementById('tab-staff')?.classList.contains('active')) {
                            renderStaffTable();
                        }
                    })
                    .catch(err => console.warn("Error syncing staff from user:", err));
            }
        }
    });
    
    // Listener khusus untuk perubahan foto profil user
    window.firebase.database().ref('users_auth').on('child_changed', (snapshot) => {
        const userData = snapshot.val();
        if (userData && userData.photoUrl) {
            const staffId = userData.staffId || userData.uid;
            if (staffId) {
                console.log(`📸 Photo changed for staff ${staffId}, clearing cache...`);
                staffPhotoCache.delete(staffId);
                if (document.getElementById('tab-staff')?.classList.contains('active')) {
                    setTimeout(() => renderStaffTable(), 100);
                }
            }
        }
    });
    
    console.log("✅ Staff sync listeners set up");
}

// ======================= INITIALIZATION ========================
function initStaffSystem() {
    if (staffInitialized) {
        console.log("👥 Staff system already initialized");
        return;
    }
    
    console.log("👥 Initializing Staff system with full sync...");
    
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
    setupStaffSyncListeners();
    
    // Sync all staff from user accounts
    setTimeout(() => {
        syncAllStaffFromUserAccounts();
    }, 2000);
    
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
                <!-- Info Banner -->
                <div class="info-banner" style="background: linear-gradient(135deg, var(--bg-hover), var(--bg-card)); padding: 16px 20px; border-radius: 16px; margin-bottom: 20px; border-left: 4px solid #00bcd4;">
                    <div style="display: flex; align-items: center; gap: 16px; flex-wrap: wrap;">
                        <span style="font-size: 32px;">💡</span>
                        <div>
                            <strong style="font-size: 15px;">Info Data Staff</strong>
                            <div style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">
                                Data staff diambil dari dua sumber: 
                                <strong>Manajemen User</strong> (role Guru) dan <strong>Data Staff</strong> (manual).
                                Data akan otomatis tersinkronisasi dengan akun user masing-masing.
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Filter Buttons -->
                <div class="filter-buttons" style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px;">
                    <button class="filter-btn active" data-filter="all" onclick="window.setStaffFilter('all')" style="padding: 8px 18px; border-radius: 30px; border: none; cursor: pointer; transition: all 0.2s;">📋 Semua Data</button>
                    <button class="filter-btn" data-filter="withAccount" onclick="window.setStaffFilter('withAccount')" style="padding: 8px 18px; border-radius: 30px; border: none; cursor: pointer; transition: all 0.2s;">✅ Sudah Berakun</button>
                    <button class="filter-btn" data-filter="withoutAccount" onclick="window.setStaffFilter('withoutAccount')" style="padding: 8px 18px; border-radius: 30px; border: none; cursor: pointer; transition: all 0.2s;">❌ Belum Berakun</button>
                    <button class="filter-btn" data-filter="fromStaff" onclick="window.setStaffFilter('fromStaff')" style="padding: 8px 18px; border-radius: 30px; border: none; cursor: pointer; transition: all 0.2s;">📁 Dari Data Staff</button>
                    <button class="filter-btn" data-filter="fromUser" onclick="window.setStaffFilter('fromUser')" style="padding: 8px 18px; border-radius: 30px; border: none; cursor: pointer; transition: all 0.2s;">👥 Dari Akun User</button>
                </div>
                
                <!-- Search Bar -->
                <div class="search-bar" style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                    <div class="search-input-wrapper" style="flex: 1; position: relative;">
                        <input type="text" id="staffSearchInput" class="search-input" placeholder="🔍 Cari staff berdasarkan nama, ID, jabatan, atau email..." 
                               style="width: 100%; padding: 12px 40px 12px 16px; border-radius: 30px; border: 1px solid var(--border); background: var(--bg-input); color: var(--text-primary);"
                               onkeyup="if(event.key === 'Enter') window.searchStaff()">
                        <button class="search-clear-btn" onclick="window.clearSearch()" style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; font-size: 16px; color: #888;">✖</button>
                    </div>
                    <button class="search-btn" onclick="window.searchStaff()" style="padding: 10px 24px; border-radius: 30px; border: none; background: #00bcd4; color: white; cursor: pointer; font-weight: 500;">🔍 Cari</button>
                    <button class="reset-btn" onclick="window.resetStaffFilters()" style="padding: 10px 24px; border-radius: 30px; border: none; background: #f44336; color: white; cursor: pointer; font-weight: 500;">🔄 Reset</button>
                </div>
                
                <!-- Statistics -->
                <div id="staffStats"></div>
                
                <!-- Form Tambah/Edit Staff -->
                <div class="controls-bar" style="background: var(--bg-card); border-radius: 20px; padding: 20px; margin-bottom: 24px; border: 1px solid var(--border);">
                    <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end;">
                        <input type="hidden" id="staffEditMode" value="add">
                        <div class="filter-group" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 12px; font-weight: 500;">ID</label>
                            <input type="text" id="staffId" placeholder="ID" style="width: 100px; padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-input);">
                        </div>
                        <div class="filter-group" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 12px; font-weight: 500;">Nama Lengkap</label>
                            <input type="text" id="staffNama" placeholder="Nama" style="width: 180px; padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-input);">
                        </div>
                        <div class="filter-group" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 12px; font-weight: 500;">Jabatan</label>
                            <select id="staffJabatan" style="padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-input);">
                                <option value="guru">👨‍🏫 Guru</option>
                                <option value="kepala_sekolah">👑 Kepala Sekolah</option>
                                <option value="wakil_kepala">👔 Wakil Kepala</option>
                                <option value="staff_tu">📋 Staff TU</option>
                                <option value="pustakawan">📚 Pustakawan</option>
                                <option value="laboran">🔬 Laboran</option>
                                <option value="security">🛡️ Security</option>
                                <option value="kebersihan">🧹 Kebersihan</option>
                            </select>
                        </div>
                        <div class="filter-group" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 12px; font-weight: 500;">Departemen</label>
                            <select id="staffDepartemen" style="padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-input);">
                                <option value="">-- Pilih --</option>
                                <option value="akademik">Akademik</option>
                                <option value="kesiswaan">Kesiswaan</option>
                                <option value="humas">Humas</option>
                                <option value="sapras">Sapras</option>
                                <option value="kurikulum">Kurikulum</option>
                            </select>
                        </div>
                        <div class="filter-group" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 12px; font-weight: 500;">No. HP</label>
                            <input type="tel" id="staffNoHp" placeholder="No. HP" style="width: 130px; padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-input);">
                        </div>
                        <div class="filter-group" style="display: flex; flex-direction: column; gap: 4px;">
                            <label style="font-size: 12px; font-weight: 500;">Email</label>
                            <input type="email" id="staffEmail" placeholder="Email" style="width: 180px; padding: 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--bg-input);">
                        </div>
                        <div class="filter-group" style="display: flex; gap: 8px;">
                            <button class="btn-action role-guru role-admin" id="btnSaveStaff" onclick="window.saveStaff()" style="background: #00bcd4; border: none; border-radius: 30px; padding: 10px 24px; color: white; cursor: pointer; font-weight: 500;">➕ Simpan Staff</button>
                            <button class="btn-action btn-danger hidden" id="btnCancelStaff" onclick="window.resetStaffForm()" style="display: none; background: #f44336; border: none; border-radius: 30px; padding: 10px 24px; color: white; cursor: pointer; font-weight: 500;">✖ Batal</button>
                        </div>
                    </div>
                </div>
                
                <!-- Tabel Staff -->
                <div class="table-container" style="overflow-x: auto; border-radius: 16px; border: 1px solid var(--border);">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background: var(--bg-hover); border-bottom: 2px solid var(--border);">
                                <th style="padding: 14px 12px; text-align: left;">Foto</th>
                                <th style="padding: 14px 12px; text-align: left;">ID</th>
                                <th style="padding: 14px 12px; text-align: left;">Nama Staff</th>
                                <th style="padding: 14px 12px; text-align: left;">Jabatan</th>
                                <th style="padding: 14px 12px; text-align: left;">Departemen</th>
                                <th style="padding: 14px 12px; text-align: left;">Kontak</th>
                                <th style="padding: 14px 12px; text-align: left;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-staff">
                            <tr><td colspan="7" style="text-align:center; padding:40px;">⏳ Memuat data...<\/td><\/tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        
        // Tambahkan CSS untuk tombol aksi (DENGAN WHATSAPP)
        const style = document.createElement('style');
        style.textContent = `
            .staff-action-btn {
                width: 34px;
                height: 34px;
                border-radius: 10px;
                border: none;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.2s;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .staff-action-btn.edit { background: #2196f3; color: white; }
            .staff-action-btn.edit:hover { background: #1976d2; transform: scale(1.05); }
            .staff-action-btn.delete { background: #f44336; color: white; }
            .staff-action-btn.delete:hover { background: #d32f2f; transform: scale(1.05); }
            .staff-action-btn.create-account { background: #4caf50; color: white; }
            .staff-action-btn.create-account:hover { background: #388e3c; transform: scale(1.05); }
            .staff-action-btn.view { background: #00bcd4; color: white; }
            .staff-action-btn.view:hover { background: #0097a7; transform: scale(1.05); }
            .staff-action-btn.refresh { background: #9c27b0; color: white; }
            .staff-action-btn.refresh:hover { background: #7b1fa2; transform: scale(1.05); }
            .staff-action-btn.wa-test { background: #25D366; color: white; }
            .staff-action-btn.wa-test:hover { background: #128C7E; transform: scale(1.05); }
            
            .filter-btn {
                transition: all 0.2s;
            }
            .filter-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            }
            .filter-btn.active {
                background: #00bcd4 !important;
                color: white !important;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
        
        dashboardSection.insertAdjacentHTML('beforeend', staffTabHtml);
        console.log("✅ Staff tab content added with WhatsApp integration");
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
window.closeStaffPhotoModal = closeStaffPhotoModal;
window.syncStaffFromUserAccount = syncStaffFromUserAccount;
window.syncAllStaffFromUserAccounts = syncAllStaffFromUserAccounts;
window.setupStaffSyncListeners = setupStaffSyncListeners;
window.refreshStaffPhoto = refreshStaffPhoto;
window.testStaffWhatsApp = testStaffWhatsApp;
window.formatPhoneDisplay = formatPhoneDisplay;

console.log("✅ staff.js V3.4 loaded - DENGAN WhatsApp integration! No HP staff tersinkron dengan akun user.");

// Auto-initialize when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initStaffSystem, 1000);
    });
} else {
    setTimeout(initStaffSystem, 1000);
}