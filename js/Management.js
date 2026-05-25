// management.js - VERSION 1.0
// Manajemen User & Kode Registrasi
// Fungsi-fungsi untuk render tabel users, codes, dan manajemen role
// ============================================================================

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
    const roleOrder = { developer: 0, admin: 1, guru: 2, siswa: 3 };
    data.sort((a, b) => (roleOrder[a.role] || 4) - (roleOrder[b.role] || 4));
    
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
        const canManage = currentUser && (currentUser.role === 'admin' || currentUser.role === 'developer');
        const canManageThisUser = canManage && !isDeveloper && !isMe;
        
        if (canManageThisUser) {
            roleHtml = `
                <select class="form-control" onchange="updateUserRole('${u.uid}', this.value)" 
                        style="background:#2c2c2c; color:white; border:1px solid #444; padding:5px; border-radius:4px; font-size:0.8rem;">
                    <option value="siswa" ${u.role === 'siswa' ? 'selected' : ''}>📚 Siswa</option>
                    <option value="guru" ${u.role === 'guru' ? 'selected' : ''}>👨‍🏫 Guru</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>👑 Admin</option>
                </select>
            `;
            actionsHtml = `
                <button class="btn-icon delete" onclick="deleteUser('${u.uid}', '${escapeHtmlUsers(u.nama)}')" 
                        title="Hapus User" style="background:transparent; border:none; cursor:pointer; color:#f44336; font-size:18px;">🗑️</button>
                <button class="btn-icon" onclick="resetUserPassword('${u.email}')" 
                        title="Reset Password" style="background:transparent; border:none; cursor:pointer; color:#ff9800; font-size:18px;">🔑</button>
            `;
        } else {
            let roleIcon = '📚';
            let roleClass = 'role-siswa';
            if (u.role === 'admin') {
                roleIcon = '👑';
                roleClass = 'role-admin';
            } else if (u.role === 'guru') {
                roleIcon = '👨‍🏫';
                roleClass = 'role-guru';
            } else if (u.role === 'developer') {
                roleIcon = '👨‍💻';
                roleClass = 'role-developer';
            }
            roleHtml = `<span class="role-badge ${roleClass}">${roleIcon} ${u.role.toUpperCase()}</span>`;
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
        } else if (u.role === 'developer') {
            detailIcon = '⚡';
            detailText = 'Developer (Paten)';
        } else {
            detailIcon = '⚙️';
            detailText = 'Administrator';
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
        const typeLabel = c.type ? c.type.toUpperCase() : 'UMUM';
        const typeIcon = c.type === 'siswa' ? '👨‍🎓' : (c.type === 'guru' ? '👨‍🏫' : '🔑');
        const linkedLabel = c.linkedId ? `<br><small style="color:#888">🔒 ID: ${c.linkedId}</small>` : '';
        const createdByName = c.createdBy ? `<br><small>👤 ${c.createdBy}</small>` : '';
        const timeRemaining = getCodeTimeRemaining(c.createdAt);
        
        tbody.innerHTML += `
            <tr class="${!c.used && timeRemaining?.includes('menit') ? 'code-expiring-soon' : ''}" style="border-bottom: 1px solid var(--border);">
                <td style="padding: 12px 8px; font-family:monospace; font-weight:bold;">
                    <span style="color:${c.type === 'siswa' ? '#4a90e2' : '#ff9800'}">${typeIcon}</span>
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
            </tr>
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
    const teacherCodes = codes.filter(c => c.type === 'guru' && !c.used).length;
    
    statsContainer.innerHTML = `
        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 15px; padding: 10px; background: var(--bg-hover); border-radius: 8px;">
            <div><span style="color: #4caf50;">🟢 Aktif:</span> <strong>${activeCodes}</strong></div>
            <div><span style="color: #888;">🔴 Terpakai:</span> <strong>${usedCodes}</strong></div>
            <div><span style="color: #4a90e2;">👨‍🎓 Siswa:</span> <strong>${studentCodes}</strong></div>
            <div><span style="color: #ff9800;">👨‍🏫 Guru:</span> <strong>${teacherCodes}</strong></div>
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
    
    if (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer') {
        showToast("⛔ Hanya Admin, Guru, dan Developer yang dapat generate kode!", "error");
        return;
    }
    
    const targetType = document.querySelector('input[name="genTarget"]:checked')?.value;
    if (!targetType) {
        showToast("Pilih target kode (Siswa/Guru)!", "error");
        return;
    }
    
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `REG-${timestamp.slice(-3)}${random}`;
    
    const codeData = {
        used: false,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        type: targetType,
        createdBy: currentUser.nama || currentUser.email
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
                    <div>Dibuat oleh: <strong>${currentUser.nama || currentUser.email}</strong></div>
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
                logActivity('generate_code', `Generate kode ${targetType}: ${code} untuk ${studentName} (ID: ${selectedId})`);
            }
            
            if (typeof renderCodesTable === 'function') renderCodesTable();
            updateCodesStatistics();
        }).catch(err => {
            console.error("Generate code error:", err);
            showToast("❌ Gagal membuat kode: " + err.message, "error");
        }).finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
        });
        
    } else { // targetType === 'guru'
        db.ref('codes/' + code).set(codeData).then(() => {
            const display = document.getElementById('generatedKeyDisplay');
            display.style.display = 'block';
            const qrData = JSON.stringify({ code: code });
            const qrContainerId = `qrcode-${code.replace(/[^a-zA-Z0-9]/g, '')}`;
            
            display.innerHTML = `
                <div style="background: var(--bg-hover); border-radius: 12px; padding: 15px; margin: 10px 0; border-left: 4px solid #ff9800;">
                    <div style="font-size: 12px; color: #888;">✨ KODE REGISTRASI GURU ✨</div>
                    <div style="font-size: 20px; font-family: monospace; font-weight: bold; color: #ff9800; margin: 10px 0;">${code}</div>
                    <div>Tipe: <strong>${targetType.toUpperCase()}</strong></div>
                    <div>Dibuat oleh: <strong>${currentUser.nama || currentUser.email}</strong></div>
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
            showToast(`✅ Kode registrasi Guru berhasil dibuat!`, "success");
            
            if (typeof logActivity === 'function') {
                logActivity('generate_code', `Generate kode ${targetType}: ${code}`);
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
    const codeInfo = codeData?.type ? `${codeData.type.toUpperCase()} - ${code}` : code;
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
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya Admin dan Developer yang dapat mengubah role!", "error");
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
    
    const roleNames = { siswa: 'Siswa', guru: 'Guru', admin: 'Admin' };
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
        showToast("⛔ Hanya Admin dan Developer yang dapat menghapus user!", "error");
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
                logActivity('delete_user', `Hapus user: ${nama} (UID: ${uid})`);
            }
            
            if (typeof renderUsersTable === 'function') renderUsersTable();
        })
        .catch((err) => showToast("❌ Gagal menghapus: " + err.message, "error"))
        .finally(() => { if (btn) btn.disabled = false; });
}

// ======================= RESET PASSWORD ========================

function resetUserPassword(email) {
    if (!email) { showToast("❌ Email tidak valid!", "error"); return; }
    if (!confirm(`⚠️ Kirim link reset password ke ${email}?`)) return;
    
    auth.sendPasswordResetEmail(email)
        .then(() => {
            showToast(`✅ Link reset password telah dikirim ke ${email}`, "success");
            if (typeof logActivity === 'function') {
                logActivity('reset_user_password', `Kirim link reset password ke ${email}`);
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
        showToast("⛔ Hanya Admin atau Developer yang dapat mereset sistem!", "error");
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
                logActivity('reset_system', `Reset semua data sistem oleh ${currentUser.nama} (${currentUser.email})`);
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

console.log("✅ management.js V1.0 loaded - Manajemen User & Kode Registrasi");