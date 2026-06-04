// management.js - VERSION 2.0 (DENGAN ROLE BARU: WAKIL KEPALA SEKOLAH & STAFF TU)
// Manajemen User & Kode Registrasi
// Fungsi-fungsi untuk render tabel users, codes, dan manajemen role
// Role yang didukung: developer, admin (Kepala Sekolah), wakil_kepala, staff_tu, guru, siswa
// ============================================================================

// ======================= ROLE HELPER FUNCTIONS =======================

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
 * Mendapatkan priority role untuk sorting
 */
function getRolePriority(role) {
    const priorities = {
        developer: 0,
        admin: 1,
        wakil_kepala: 2,
        staff_tu: 3,
        guru: 4,
        siswa: 5
    };
    return priorities[role] !== undefined ? priorities[role] : 99;
}

/**
 * Cek apakah user dapat mengelola user lain
 */
function canManageUser(currentUser, targetUser) {
    if (!currentUser) return false;
    
    // Developer bisa manage semua kecuali developer lain
    if (currentUser.role === 'developer') {
        return targetUser.role !== 'developer';
    }
    
    // Admin (Kepala Sekolah) bisa manage semua kecuali developer dan admin lain
    if (currentUser.role === 'admin') {
        return targetUser.role !== 'developer' && targetUser.role !== 'admin';
    }
    
    // Wakil Kepala Sekolah hanya bisa manage siswa dan guru
    if (currentUser.role === 'wakil_kepala') {
        return targetUser.role === 'siswa' || targetUser.role === 'guru';
    }
    
    // Staff TU hanya bisa manage siswa
    if (currentUser.role === 'staff_tu') {
        return targetUser.role === 'siswa';
    }
    
    // Guru hanya bisa manage siswa
    if (currentUser.role === 'guru') {
        return targetUser.role === 'siswa';
    }
    
    return false;
}

/**
 * Cek apakah user dapat menggenerate kode
 */
function canGenerateCode(userRole) {
    const allowedRoles = ['admin', 'developer', 'wakil_kepala', 'guru'];
    return allowedRoles.includes(userRole);
}

/**
 * Cek apakah user dapat menghapus user
 */
function canDeleteUser(userRole) {
    const allowedRoles = ['admin', 'developer'];
    return allowedRoles.includes(userRole);
}

// ======================= RENDER TABEL PENGGUNA ========================

function renderUsersTable() {
    console.log("🎨 [management.js] renderUsersTable dipanggil");
    const tbody = document.getElementById('tbody-users');
    const searchInput = document.getElementById('searchUser');
    const search = searchInput?.value.toLowerCase() || '';
    
    if (!tbody) {
        console.warn("⚠️ tbody-users tidak ditemukan, mencoba membuat...");
        const tabUsers = document.getElementById('tab-users');
        if (tabUsers) {
            const tableContainer = tabUsers.querySelector('.table-container');
            if (tableContainer) {
                let table = tableContainer.querySelector('table');
                if (!table) {
                    table = document.createElement('table');
                    table.innerHTML = `
                        <thead>
                            <tr>
                                <th>Foto</th>
                                <th>Nama</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Detail</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-users"></tbody>
                    `;
                    tableContainer.appendChild(table);
                    console.log("✅ Table users created dynamically");
                }
                const newTbody = document.getElementById('tbody-users');
                if (newTbody) {
                    renderUsersTable();
                    return;
                }
            }
        }
        return;
    }
    
    // Cek apakah data users_auth tersedia
    if (typeof dbData === 'undefined' || !dbData.users_auth || dbData.users_auth.length === 0) {
        console.log("📭 Belum ada data users_auth");
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:#888;">👥 Belum ada pengguna terdaftar.</td></tr>`;
        return;
    }
    
    // Filter dan sort data
    let data = dbData.users_auth.filter(u => u.nama && u.nama.toLowerCase().includes(search));
    data.sort((a, b) => getRolePriority(a.role) - getRolePriority(b.role));
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:#888;">🔍 Tidak ada pengguna yang cocok dengan pencarian.</td></tr>`;
        return;
    }
    
    tbody.innerHTML = '';
    
    for (const u of data) {
        const isMe = (currentUser && currentUser.uid === u.uid);
        const avatar = u.photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nama || 'User')}&background=00bcd4&color=fff&size=40`;
        
        let roleHtml = '';
        let actionsHtml = '-';
        
        const isDeveloper = (u.role === 'developer');
        const canManageThisUser = canManageUser(currentUser, u);
        const canDeleteThisUser = canDeleteUser(currentUser?.role);
        
        if (canManageThisUser) {
            // Dropdown role dengan opsi lengkap
            roleHtml = `
                <select class="form-control" onchange="updateUserRole('${u.uid}', this.value)" 
                        style="background:#2c2c2c; color:white; border:1px solid #444; padding:5px; border-radius:4px; font-size:0.8rem;">
                    <option value="siswa" ${u.role === 'siswa' ? 'selected' : ''}>👨‍🎓 Siswa</option>
                    <option value="guru" ${u.role === 'guru' ? 'selected' : ''}>👨‍🏫 Guru</option>
                    <option value="staff_tu" ${u.role === 'staff_tu' ? 'selected' : ''}>📋 Staff TU</option>
                    <option value="wakil_kepala" ${u.role === 'wakil_kepala' ? 'selected' : ''}>👔 Wakil Kepala Sekolah</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Kepala Sekolah</option>
                </select>
            `;
            
            actionsHtml = `
                <button class="btn-icon delete" onclick="deleteUser('${u.uid}', '${escapeHtmlUsers(u.nama)}')" 
                        title="Hapus User" style="background:transparent; border:none; cursor:pointer; color:#f44336; font-size:18px;">🗑️</button>
                <button class="btn-icon" onclick="resetUserPassword('${u.email}')" 
                        title="Reset Password" style="background:transparent; border:none; cursor:pointer; color:#ff9800; font-size:18px;">🔑</button>
            `;
        } else {
            const roleIcon = getRoleIcon(u.role);
            const roleDisplay = getRoleDisplayName(u.role);
            let roleClass = `role-${u.role}`;
            if (u.role === 'admin') roleClass = 'role-admin';
            else if (u.role === 'wakil_kepala') roleClass = 'role-wakil-kepala';
            else if (u.role === 'staff_tu') roleClass = 'role-staff-tu';
            else if (u.role === 'guru') roleClass = 'role-guru';
            else if (u.role === 'developer') roleClass = 'role-developer';
            else roleClass = 'role-siswa';
            
            roleHtml = `<span class="role-badge ${roleClass}">${roleIcon} ${roleDisplay}</span>`;
            if (isMe) roleHtml += ` <small style="color:#4a90e2;">(Anda)</small>`;
        }
        
        let detailText = '';
        let detailIcon = '';
        if (u.role === 'siswa') {
            detailIcon = '📚';
            detailText = `${u.kelas || '-'} / ${u.jurusan || '-'}`;
        } else if (u.role === 'guru') {
            detailIcon = '📖';
            detailText = u.subject || '-';
        } else if (u.role === 'staff_tu') {
            detailIcon = '📋';
            detailText = u.departemen || 'Staff TU';
        } else if (u.role === 'wakil_kepala') {
            detailIcon = '👔';
            detailText = u.bidang || 'Wakil Kepala Sekolah';
        } else if (u.role === 'developer') {
            detailIcon = '⚡';
            detailText = 'Developer (Super Admin)';
        } else {
            detailIcon = '👑';
            detailText = 'Kepala Sekolah';
        }
        
        const registeredDate = u.registeredAt ? new Date(u.registeredAt).toLocaleDateString('id-ID') : '-';
        
        tbody.innerHTML += `
            <tr class="${isMe ? 'current-user-row' : ''}" style="border-bottom: 1px solid var(--border);">
                <td style="text-align:center; padding: 12px 8px;">
                    <img src="${avatar}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                </td>
                <td style="padding: 12px 8px;">
                    <strong>${escapeHtmlUsers(u.nama)}</strong>${isMe ? '<br><small style="color:#4a90e2;">Akun Anda</small>' : ''}
                </td>
                <td style="padding: 12px 8px; color: var(--text-muted); font-size:0.85rem;">${u.email || '-'}</td>
                <td style="padding: 12px 8px;">${roleHtml}</td>
                <td style="padding: 12px 8px; color: var(--text-muted); font-size:0.8rem;">
                    ${detailIcon} ${escapeHtmlUsers(detailText)}<br><small>📅 ${registeredDate}</small>
                </td>
                <td style="text-align:center; padding: 12px 8px;">${actionsHtml}</td>
            </tr>
        `;
    }
    
    console.log(`✅ [management.js] renderUsersTable: ${data.length} users ditampilkan`);
}

// ======================= RENDER TABEL KODE REGISTRASI ========================

function renderCodesTable() {
    console.log("🎨 [management.js] renderCodesTable dipanggil");
    const tbody = document.getElementById('tbody-codes');
    
    if (!tbody) {
        console.warn("⚠️ tbody-codes tidak ditemukan, mencoba membuat...");
        const tabUsers = document.getElementById('tab-users');
        if (tabUsers) {
            const tableContainer = tabUsers.querySelector('.table-container:first-child');
            if (tableContainer) {
                let table = tableContainer.querySelector('table');
                if (!table) {
                    table = document.createElement('table');
                    table.innerHTML = `
                        <thead>
                            <tr>
                                <th>Kode</th>
                                <th>Status</th>
                                <th>Dibuat</th>
                                <th>Pengguna</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-codes"></tbody>
                    `;
                    tableContainer.appendChild(table);
                    console.log("✅ Table codes created dynamically");
                }
                const newTbody = document.getElementById('tbody-codes');
                if (newTbody) {
                    renderCodesTable();
                    return;
                }
            }
        }
        return;
    }
    
    if (typeof dbData === 'undefined' || !dbData.codes || dbData.codes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 30px; color:#888;">🔑 Belum ada kode registrasi. Generate kode di atas.</td></tr>`;
        updateCodesStatistics();
        return;
    }
    
    const sorted = [...dbData.codes].reverse();
    tbody.innerHTML = '';
    
    for (const c of sorted) {
        let typeLabel = c.type ? c.type.toUpperCase() : 'UMUM';
        let typeIcon = '🔑';
        if (c.type === 'siswa') typeIcon = '👨‍🎓';
        else if (c.type === 'guru') typeIcon = '👨‍🏫';
        else if (c.type === 'staff_tu') typeIcon = '📋';
        else if (c.type === 'wakil_kepala') typeIcon = '👔';
        else if (c.type === 'admin') typeIcon = '👑';
        
        const linkedLabel = c.linkedId ? `<br><small style="color:#888">🔒 ID: ${c.linkedId}</small>` : '';
        const createdByName = c.createdBy ? `<br><small>👤 ${c.createdBy}</small>` : '';
        const timeRemaining = getCodeTimeRemaining(c.createdAt);
        
        let colorStyle = '#4a90e2';
        if (c.type === 'guru') colorStyle = '#ff9800';
        else if (c.type === 'staff_tu') colorStyle = '#607d8b';
        else if (c.type === 'wakil_kepala') colorStyle = '#9c27b0';
        else if (c.type === 'admin') colorStyle = '#f44336';
        
        tbody.innerHTML += `
            <tr class="${!c.used && timeRemaining?.includes('menit') ? 'code-expiring-soon' : ''}" style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px 8px; font-family:monospace; font-weight:bold;">
                    <span style="color:${colorStyle}">${typeIcon}</span>
                    <strong>${c.code}</strong>
                    <br><small style="font-weight:normal; color:#888">${typeLabel}${linkedLabel}${createdByName}</small>
                </td>
                <td style="padding: 12px 8px;">
                    ${c.used ? '<span style="color:#4caf50;">✅ Terpakai</span>' : `<span style="color:#ff9800;">🟢 Aktif</span>${timeRemaining ? `<br><small style="color:#888;">⏰ ${timeRemaining}</small>` : ''}`}
                </td>
                <td style="padding: 12px 8px; font-size: 12px;">${c.createdAt ? new Date(c.createdAt).toLocaleString('id-ID') : '-'}</td>
                <td style="padding: 12px 8px; font-size: 12px;">${c.userId ? c.userId.substring(0, 20) + '...' : '-'}</td>
                <td style="padding: 12px 8px;">
                    ${!c.used ? `
                        <button class="btn-icon" onclick="copyToClipboard('${c.code}')" title="Salin Kode" style="background:transparent; border:none; cursor:pointer; margin-right:5px;">📋</button>
                        <button class="btn-icon delete" onclick="deleteCode('${c.code}')" title="Hapus Kode" style="background:transparent; border:none; cursor:pointer; color:#f44336;">🗑️</button>
                    ` : '-'}
                </td>
            </table>
        `;
    }
    
    updateCodesStatistics();
}

function getCodeTimeRemaining(createdAt) {
    if (!createdAt) return null;
    const now = Date.now();
    const expiredAt = createdAt + (5 * 60 * 60 * 1000);
    const remaining = expiredAt - now;
    if (remaining <= 0) return 'Expired';
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours} jam ${minutes} menit`;
    else if (minutes > 0) return `${minutes} menit`;
    else return '< 1 menit';
}

// ======================= UPDATE STATISTIK KODE ========================

function updateCodesStatistics() {
    const statsContainer = document.getElementById('codesStats');
    if (!statsContainer) {
        createCodesStatsContainer();
        return;
    }
    
    const codes = dbData?.codes || [];
    const activeCodes = codes.filter(c => !c.used).length;
    const usedCodes = codes.filter(c => c.used).length;
    const studentCodes = codes.filter(c => c.type === 'siswa' && !c.used).length;
    const teacherCodes = codes.filter(c => (c.type === 'guru' || c.type === 'staff_tu' || c.type === 'wakil_kepala') && !c.used).length;
    
    statsContainer.innerHTML = `
        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 15px; padding: 10px; background: var(--bg-hover); border-radius: 8px;">
            <div><span style="color: #4caf50;">🟢 Aktif:</span> <strong>${activeCodes}</strong></div>
            <div><span style="color: #888;">🔴 Terpakai:</span> <strong>${usedCodes}</strong></div>
            <div><span style="color: #4a90e2;">👨‍🎓 Siswa:</span> <strong>${studentCodes}</strong></div>
            <div><span style="color: #ff9800;">👨‍🏫 Guru/Staff:</span> <strong>${teacherCodes}</strong></div>
            <div><span style="color: #888;">📊 Total:</span> <strong>${codes.length}</strong></div>
        </div>
    `;
}

function createCodesStatsContainer() {
    const keyBox = document.querySelector('#tab-users .key-box');
    if (keyBox && !document.getElementById('codesStats')) {
        const statsDiv = document.createElement('div');
        statsDiv.id = 'codesStats';
        statsDiv.style.marginTop = '10px';
        keyBox.insertAdjacentElement('afterend', statsDiv);
    }
}

// ======================= DROPDOWN SISWA UNTUK GENERATE KODE ========================

function populateStudentSelectForCode() {
    const select = document.getElementById('selectStudentForCode');
    if (!select) return;
    
    const currentVal = select.value;
    
    if (typeof dbData === 'undefined' || !dbData.users || !dbData.users_auth) {
        console.log("⏳ [management.js] dbData not ready yet for populateStudentSelectForCode");
        select.innerHTML = '<option value="">-- Memuat data siswa --</option>';
        setTimeout(() => populateStudentSelectForCode(), 500);
        return;
    }
    
    select.innerHTML = '<option value="">-- Pilih Siswa --</option>';
    
    const registeredUserIds = dbData.users_auth?.map(u => u.fpId).filter(id => id) || [];
    const availableStudents = dbData.users.filter(s => !registeredUserIds.includes(s.id));
    
    if (availableStudents.length === 0) {
        select.innerHTML += '<option value="" disabled>✨ Semua siswa sudah memiliki akun</option>';
    } else {
        availableStudents.forEach(s => {
            select.innerHTML += `<option value="${s.id}">${escapeHtmlUsers(s.nama)} (ID: ${s.id}) | Kelas ${s.kelas || '-'}</option>`;
        });
    }
    
    if (currentVal && availableStudents.some(s => s.id == currentVal)) {
        select.value = currentVal;
    }
}

// ======================= GENERATE KODE REGISTRASI ========================

function generateRegistrationCode() {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    
    if (!canGenerateCode(currentUser.role)) {
        showToast("⛔ Hanya Admin, Wakil Kepala Sekolah, Guru, dan Developer yang dapat generate kode!", "error");
        return;
    }
    
    const targetType = document.querySelector('input[name="genTarget"]:checked')?.value;
    if (!targetType) {
        showToast("Pilih target kode (Siswa/Guru/Staff)!", "error");
        return;
    }
    
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `REG-${timestamp.slice(-3)}${random}`;
    
    const codeData = {
        used: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        type: targetType,
        createdBy: currentUser.nama || currentUser.email,
        createdRole: currentUser.role
    };
    
    const btn = document.querySelector('button[onclick*="generateRegistrationCode"]');
    const originalText = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Generating...';
    }
    
    if (targetType === 'siswa') {
        const selectedId = document.getElementById('selectStudentForCode').value;
        if (!selectedId) {
            showToast("⚠️ Harap pilih Siswa terlebih dahulu!", "error");
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            return;
        }
        
        const existingUser = dbData.users_auth?.find(u => u.fpId == selectedId);
        if (existingUser) {
            showToast(`❌ GAGAL: ID Siswa (${selectedId}) sudah terdaftar pada akun (${existingUser.email}).`, "error");
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            return;
        }
        
        const existingCode = dbData.codes?.find(c => c.linkedId == selectedId && !c.used && c.type === 'siswa');
        if (existingCode) {
            showToast(`❌ GAGAL: Siswa ini masih memiliki kode aktif (${existingCode.code}). Tunggu expired!`, "error");
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
            return;
        }
        
        codeData.linkedId = selectedId;
        const student = dbData.users.find(s => s.id == selectedId);
        const studentName = student?.nama || selectedId;
        
        db.ref('codes/' + code).set(codeData).then(() => {
            const display = document.getElementById('generatedKeyDisplay');
            display.style.display = 'block';
            const qrData = JSON.stringify({ code: code, studentId: selectedId });
            const qrContainerId = `qrcode-${code.replace(/[^a-zA-Z0-9]/g, '')}`;
            
            display.innerHTML = `
                <div style="background: var(--bg-hover); border-radius: 12px; padding: 15px; margin: 10px 0; border-left: 4px solid #4a90e2;">
                    <div style="font-size: 12px; color: #888;">✨ KODE REGISTRASI BERHASIL DIGENERATE ✨</div>
                    <div style="font-size: 20px; font-family: monospace; font-weight: bold; color: #4a90e2; margin: 10px 0;">${code}</div>
                    <div>Tipe: <strong>${targetType.toUpperCase()}</strong></div>
                    <div>Terkunci ID: <strong>${selectedId}</strong> - ${studentName}</div>
                    <div>Dibuat oleh: <strong>${currentUser.nama || currentUser.email} (${getRoleDisplayName(currentUser.role)})</strong></div>
                    <div style="margin-top: 10px;"><small>⏰ Kode akan expired dalam 5 jam</small></div>
                    <div id="${qrContainerId}" style="margin: 15px auto; display: flex; justify-content: center;"></div>
                    <button class="btn-action btn-success" onclick="copyToClipboard('${code}')" style="margin-top: 10px;">📋 Copy Kode</button>
                </div>
            `;
            
            try {
                if (typeof QRCode !== 'undefined') {
                    new QRCode(document.getElementById(qrContainerId), {
                        text: qrData,
                        width: 150,
                        height: 150,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                } else {
                    document.getElementById(qrContainerId).innerHTML = '<span style="color:#ff9800;">⚠️ QR Code library not loaded</span>';
                }
            } catch (err) {
                console.error("QR Code generation error:", err);
                document.getElementById(qrContainerId).innerHTML = '<span style="color:red;">Gagal generate QR</span>';
            }
            showToast(`✅ Kode untuk ${studentName} berhasil dibuat!`, "success");
            
            if (typeof logActivity === 'function') {
                logActivity('generate_code', `Generate kode ${targetType}: ${code} untuk ${studentName} (ID: ${selectedId}) oleh ${getRoleDisplayName(currentUser.role)}`);
            }
            
            if (typeof renderCodesTable === 'function') renderCodesTable();
            updateCodesStatistics();
        }).catch(err => {
            console.error("Generate code error:", err);
            showToast("❌ Gagal membuat kode: " + err.message, "error");
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        });
        
    } else { // targetType === 'guru' atau lainnya
        db.ref('codes/' + code).set(codeData).then(() => {
            const display = document.getElementById('generatedKeyDisplay');
            display.style.display = 'block';
            const qrData = JSON.stringify({ code: code });
            const qrContainerId = `qrcode-${code.replace(/[^a-zA-Z0-9]/g, '')}`;
            
            const typeDisplay = targetType === 'guru' ? 'GURU' : (targetType === 'staff_tu' ? 'STAFF TU' : (targetType === 'wakil_kepala' ? 'WAKIL KEPALA SEKOLAH' : targetType.toUpperCase()));
            const borderColor = targetType === 'guru' ? '#ff9800' : (targetType === 'staff_tu' ? '#607d8b' : '#9c27b0');
            const textColor = targetType === 'guru' ? '#ff9800' : (targetType === 'staff_tu' ? '#607d8b' : '#9c27b0');
            
            display.innerHTML = `
                <div style="background: var(--bg-hover); border-radius: 12px; padding: 15px; margin: 10px 0; border-left: 4px solid ${borderColor};">
                    <div style="font-size: 12px; color: #888;">✨ KODE REGISTRASI ${typeDisplay} ✨</div>
                    <div style="font-size: 20px; font-family: monospace; font-weight: bold; color: ${textColor}; margin: 10px 0;">${code}</div>
                    <div>Tipe: <strong>${typeDisplay}</strong></div>
                    <div>Dibuat oleh: <strong>${currentUser.nama || currentUser.email} (${getRoleDisplayName(currentUser.role)})</strong></div>
                    <div style="margin-top: 10px;"><small>⏰ Kode akan expired dalam 5 jam</small></div>
                    <div id="${qrContainerId}" style="margin: 15px auto; display: flex; justify-content: center;"></div>
                    <button class="btn-action btn-success" onclick="copyToClipboard('${code}')" style="margin-top: 10px;">📋 Copy Kode</button>
                </div>
            `;
            
            try {
                if (typeof QRCode !== 'undefined') {
                    new QRCode(document.getElementById(qrContainerId), {
                        text: qrData,
                        width: 150,
                        height: 150,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: QRCode.CorrectLevel.H
                    });
                } else {
                    document.getElementById(qrContainerId).innerHTML = '<span style="color:#ff9800;">⚠️ QR Code library not loaded</span>';
                }
            } catch (err) {
                console.error("QR Code generation error:", err);
                document.getElementById(qrContainerId).innerHTML = '<span style="color:red;">Gagal generate QR</span>';
            }
            showToast(`✅ Kode registrasi ${typeDisplay} berhasil dibuat!`, "success");
            
            if (typeof logActivity === 'function') {
                logActivity('generate_code', `Generate kode ${targetType}: ${code} oleh ${getRoleDisplayName(currentUser.role)}`);
            }
            
            if (typeof renderCodesTable === 'function') renderCodesTable();
            updateCodesStatistics();
        }).catch(err => {
            console.error("Generate code error:", err);
            showToast("❌ Gagal membuat kode: " + err.message, "error");
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        });
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("📋 Kode berhasil disalin!", "success");
    }).catch(() => {
        showToast("❌ Gagal menyalin kode", "error");
    });
}

// ======================= DELETE KODE REGISTRASI ========================

function deleteCode(code) {
    const codeData = dbData.codes?.find(c => c.code === code);
    const typeDisplay = codeData?.type ? getRoleDisplayName(codeData.type) : 'UMUM';
    const codeInfo = `${typeDisplay} - ${code}`;
    if (!confirm(`⚠️ Yakin ingin menghapus kode: ${codeInfo}?\n\nKode yang sudah dihapus tidak dapat digunakan lagi.`)) return;
    
    db.ref('codes/' + code).remove()
        .then(() => {
            showToast(`✅ Kode ${code} berhasil dihapus`, "success");
            
            if (typeof logActivity === 'function') {
                logActivity('delete_code', `Hapus kode: ${codeInfo}`);
            }
            
            if (typeof renderCodesTable === 'function') renderCodesTable();
            updateCodesStatistics();
        })
        .catch((err) => showToast("❌ Gagal menghapus kode: " + err.message, "error"));
}

// ======================= UPDATE USER ROLE ========================

function updateUserRole(uid, newRole) {
    // Cek akses berdasarkan role
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    
    if (currentUser.role !== 'admin' && currentUser.role !== 'developer') {
        showToast("⛔ Hanya Kepala Sekolah dan Developer yang dapat mengubah role!", "error");
        return;
    }
    
    const user = dbData.users_auth?.find(u => u.uid === uid);
    if (!user) {
        showToast("❌ User tidak ditemukan!", "error");
        return;
    }
    
    if (user.role === 'developer') {
        showToast("⛔ Role Developer tidak dapat diubah!", "error");
        return;
    }
    if (newRole === 'developer') {
        showToast("⛔ Tidak dapat memberikan role Developer! Role ini hanya untuk akun paten.", "error");
        return;
    }
    if (currentUser.uid === uid) {
        showToast("❌ Anda tidak dapat mengubah role sendiri!", "error");
        return;
    }
    
    const roleNames = { 
        siswa: 'Siswa', 
        guru: 'Guru', 
        staff_tu: 'Staff TU',
        wakil_kepala: 'Wakil Kepala Sekolah',
        admin: 'Kepala Sekolah' 
    };
    
    if (!confirm(`⚠️ Yakin ingin mengubah role ${user.nama} dari ${roleNames[user.role]} menjadi ${roleNames[newRole]}?`)) return;
    
    const btn = document.querySelector(`select[onchange*="updateUserRole('${uid}']`);
    if (btn) btn.disabled = true;
    
    db.ref('users_auth/' + uid).update({
        role: newRole,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
        showToast(`✅ Role ${user.nama} berhasil diubah menjadi ${roleNames[newRole]}`, "success");
        
        if (typeof logActivity === 'function') {
            logActivity('update_user_role', `Ubah role ${user.nama} (${user.email}) dari ${user.role} menjadi ${newRole}`);
        }
        
        if (currentUser.uid === uid) {
            currentUser.role = newRole;
            if (typeof saveUserToLocalStorage === 'function') saveUserToLocalStorage(currentUser);
            if (typeof applyRolePermissions === 'function') applyRolePermissions();
            if (typeof updateUserInterface === 'function') updateUserInterface();
        }
        
        if (typeof renderUsersTable === 'function') renderUsersTable();
    }).catch((err) => {
        console.error("Update role error:", err);
        showToast("❌ Gagal mengubah role: " + err.message, "error");
    }).finally(() => {
        if (btn) btn.disabled = false;
    });
}

// ======================= DELETE USER ========================

function deleteUser(uid, nama) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Kepala Sekolah dan Developer yang dapat menghapus user!", "error");
        return;
    }
    if (currentUser.uid === uid) {
        showToast("❌ Anda tidak dapat menghapus akun sendiri!", "error");
        return;
    }
    
    const targetUser = dbData.users_auth?.find(u => u.uid === uid);
    if (targetUser && targetUser.role === 'developer') {
        showToast("⛔ Akun Developer tidak dapat dihapus!", "error");
        return;
    }
    
    if (!confirm(`⚠️ Yakin ingin menghapus user: ${nama}?\n\nUser ini akan kehilangan akses login.\nData absensi yang terkait tidak akan terpengaruh.\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!`)) return;
    
    const btn = document.querySelector(`button[onclick*="deleteUser('${uid}']`);
    if (btn) btn.disabled = true;
    
    db.ref('users_auth/' + uid).remove()
        .then(() => {
            showToast(`✅ User "${nama}" berhasil dihapus dari Database.`, "success");
            
            if (typeof logActivity === 'function') {
                logActivity('delete_user', `Hapus user: ${nama} (UID: ${uid}) oleh ${getRoleDisplayName(currentUser.role)}`);
            }
            
            if (typeof renderUsersTable === 'function') renderUsersTable();
        })
        .catch((err) => showToast("❌ Gagal menghapus: " + err.message, "error"))
        .finally(() => { if (btn) btn.disabled = false; });
}

// ======================= RESET PASSWORD ========================

function resetUserPassword(email) {
    if (!email) { showToast("❌ Email tidak valid!", "error"); return; }
    
    // Cek akses
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer' && currentUser.role !== 'wakil_kepala')) {
        showToast("⛔ Hanya Kepala Sekolah, Wakil Kepala Sekolah, dan Developer yang dapat mereset password!", "error");
        return;
    }
    
    if (!confirm(`⚠️ Kirim link reset password ke ${email}?`)) return;
    
    auth.sendPasswordResetEmail(email)
        .then(() => {
            showToast(`✅ Link reset password telah dikirim ke ${email}`, "success");
            if (typeof logActivity === 'function') {
                logActivity('reset_user_password', `Kirim link reset password ke ${email} oleh ${getRoleDisplayName(currentUser.role)}`);
            }
        })
        .catch((err) => {
            if (err.code === 'auth/user-not-found') showToast("❌ Email tersebut tidak terdaftar di Firebase Auth!", "error");
            else showToast("❌ Gagal mengirim: " + err.message, "error");
        });
}

// ======================= RESET SYSTEM DATA ========================

function resetSystemData() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Kepala Sekolah atau Developer yang dapat mereset sistem!", "error");
        return;
    }
    
    if (!confirm("🚨 PERINGATAN BERAT! 🚨\n\nSemua data akan dihapus:\n- Data siswa (users)\n- Data absensi\n- Kode registrasi\n- Data pengguna (users_auth) KECUALI akun developer (zaki5go@gmail.com)\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!\n\nKetik 'RESET' untuk konfirmasi:")) return;
    
    const confirmation = prompt("Ketik 'RESET' untuk konfirmasi:");
    if (confirmation !== "RESET") {
        showToast("❌ Reset dibatalkan", "error");
        return;
    }
    
    showToast("⏳ Mereset data sistem...", "info");
    
    const protectedEmail = "zaki5go@gmail.com";
    
    const promises = [
        db.ref('users').remove(),
        db.ref('absensi').remove(),
        db.ref('codes').remove()
    ];
    
    const deleteUsersPromise = db.ref('users_auth').once('value').then(snapshot => {
        const users = snapshot.val();
        if (users) {
            const deletePromises = [];
            for (const [uid, userData] of Object.entries(users)) {
                if (userData.email !== protectedEmail) {
                    deletePromises.push(db.ref('users_auth/' + uid).remove());
                }
            }
            return Promise.all(deletePromises);
        }
    }).catch(err => console.error("Gagal melindungi akun:", err));
    
    promises.push(deleteUsersPromise);
    
    Promise.all(promises)
        .then(() => {
            showToast("✅ Reset berhasil! Akun " + protectedEmail + " tetap aman.", "success");
            
            if (typeof logActivity === 'function') {
                logActivity('reset_system', `Reset semua data sistem oleh ${currentUser.nama} (${getRoleDisplayName(currentUser.role)})`);
            }
            
            setTimeout(() => { auth.signOut().then(() => location.reload()); }, 2000);
        })
        .catch((err) => showToast("❌ Gagal mereset: " + err.message, "error"));
}

// ======================= UTILITY ========================

function escapeHtmlUsers(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= EVENT LISTENERS ========================

function setupManagementDataReadyListener() {
    console.log("📡 Setting up dataReady event listener for management module");
    window.addEventListener('dataReady', (e) => {
        console.log("🔄 management.js: dataReady received, updating management UI");
        if (typeof renderUsersTable === 'function') renderUsersTable();
        if (typeof renderCodesTable === 'function') renderCodesTable();
        if (typeof updateCodesStatistics === 'function') updateCodesStatistics();
        if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
    });
}

// ======================= CLEANUP ========================

function cleanupManagementSystem() {
    console.log("🧹 Management system cleaned up");
}

// ======================= INISIALISASI ========================
setupManagementDataReadyListener();

if (typeof dbData !== 'undefined' && dbData.users_auth) {
    setTimeout(() => {
        if (typeof renderUsersTable === 'function') renderUsersTable();
        if (typeof renderCodesTable === 'function') renderCodesTable();
        if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
    }, 100);
}

// ======================= EKSPOR KE GLOBAL ========================
window.renderUsersTable = renderUsersTable;
window.renderCodesTable = renderCodesTable;
window.updateCodesStatistics = updateCodesStatistics;
window.populateStudentSelectForCode = populateStudentSelectForCode;
window.generateRegistrationCode = generateRegistrationCode;
window.copyToClipboard = copyToClipboard;
window.deleteCode = deleteCode;
window.updateUserRole = updateUserRole;
window.deleteUser = deleteUser;
window.resetUserPassword = resetUserPassword;
window.resetSystemData = resetSystemData;
window.cleanupManagementSystem = cleanupManagementSystem;
window.getRoleDisplayName = getRoleDisplayName;
window.getRoleIcon = getRoleIcon;
window.canManageUser = canManageUser;
window.canGenerateCode = canGenerateCode;

console.log("✅ management.js V2.0 loaded - Dengan role: Developer, Kepala Sekolah, Wakil Kepala Sekolah, Staff TU, Guru, Siswa");