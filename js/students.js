// students.js - VERSION 3.6 (PERBAIKAN: RENDER TABLE & POPULATE DROPDOWN)
// ======================= MANAJEMEN DATA SISWA =======================
// Fitur: CRUD siswa, sinkronisasi dengan ESP32, delay per siswa,
//        dukungan kelas & jurusan dinamis dari pengaturan sekolah,
//        real-time update, import/export CSV.
// PERUBAHAN: 
//   - Memperbaiki variabel data di renderStudentsTable
//   - Menambahkan populateKelasOptions dan populateJurusanOptions untuk form
//   - Menambahkan retry mechanism untuk dropdown form
// ====================================================================

let studentFormResetTimer = null;
let studentsDataReadyListenerAdded = false;
let studentsTabActive = false;
let studentFiltersRetryCount = 0;
let formDropdownRetryCount = 0;
const MAX_STUDENT_FILTERS_RETRY = 10;
const MAX_FORM_DROPDOWN_RETRY = 10;

// ======================= EVENT LISTENER DATA READY ========================
function setupStudentsDataReadyListener() {
    if (studentsDataReadyListenerAdded) {
        console.log("⚠️ students dataReady listener already added, skipping");
        return;
    }
    
    studentsDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for students module");
    
    window.addEventListener('dataReady', (e) => {
        console.log("🔄 students.js: dataReady received, updating students UI");
        
        if (typeof populateKelasOptions === 'function') populateKelasOptions();
        if (typeof populateJurusanOptions === 'function') populateJurusanOptions();
        if (typeof populateStudentFilters === 'function') populateStudentFilters();
        if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
        
        if (studentsTabActive) {
            if (typeof renderStudentsTable === 'function') renderStudentsTable();
        } else {
            console.log("📊 students.js: Tab siswa tidak aktif, skip render sementara");
        }
        updateStudentStatistics();
    });
}

// Monitor tab aktif
function initTabActiveMonitor() {
    const checkActiveTab = () => {
        const tabStudents = document.getElementById('tab-students');
        studentsTabActive = !!(tabStudents && tabStudents.classList.contains('active'));
        if (studentsTabActive) {
            console.log("✅ Tab siswa aktif, siap render");
            if (typeof dbData !== 'undefined' && dbData.users) {
                renderStudentsTable();
            }
        }
    };
    
    checkActiveTab();
    
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'class') {
                const target = mutation.target;
                if (target.id === 'tab-students') {
                    const wasActive = studentsTabActive;
                    studentsTabActive = target.classList.contains('active');
                    if (studentsTabActive && !wasActive) {
                        console.log("📊 Tab siswa diaktifkan, render ulang");
                        renderStudentsTable();
                        populateStudentFilters();
                        // Refresh form dropdowns when tab becomes active
                        setTimeout(() => {
                            populateKelasOptions();
                            populateJurusanOptions();
                        }, 100);
                    }
                }
            }
        });
    });
    
    const tabStudents = document.getElementById('tab-students');
    if (tabStudents) {
        observer.observe(tabStudents, { attributes: true });
    } else {
        console.warn("Tab students belum ada, observer ditunda");
        setTimeout(() => initTabActiveMonitor(), 500);
        return;
    }
    
    window.addEventListener('tabSwitched', (e) => {
        if (e.detail && e.detail.tabId === 'students') {
            studentsTabActive = true;
            renderStudentsTable();
            populateStudentFilters();
            setTimeout(() => {
                populateKelasOptions();
                populateJurusanOptions();
            }, 100);
        } else if (e.detail && e.detail.tabId !== 'students') {
            studentsTabActive = false;
        }
    });
}

// ======================= DROPDOWN DINAMIS (DIPERKUAT) =======================

function populateKelasOptions() {
    console.log("🔧 populateKelasOptions dipanggil untuk form tambah siswa");
    
    const kelasSelect = document.getElementById('newKelas');
    if (!kelasSelect) {
        if (formDropdownRetryCount < MAX_FORM_DROPDOWN_RETRY) {
            formDropdownRetryCount++;
            console.warn(`⚠️ newKelas not found, retrying (${formDropdownRetryCount}/${MAX_FORM_DROPDOWN_RETRY})...`);
            setTimeout(() => populateKelasOptions(), 300);
        }
        return;
    }
    
    // Reset retry counter on success
    formDropdownRetryCount = 0;
    
    let options = [];
    
    // Coba ambil dari window.currentSchoolConfig terlebih dahulu
    if (window.currentSchoolConfig && window.currentSchoolConfig.classes && window.currentSchoolConfig.classes.length > 0) {
        options = window.currentSchoolConfig.classes;
        console.log(`📚 populateKelasOptions: ${options.length} kelas dari window.currentSchoolConfig`);
    } 
    // Fallback default
    else {
        const schoolType = window.currentSchoolConfig?.type || 'smp';
        if (schoolType === 'smp') {
            options = ['VII', 'VIII', 'IX'];
        } else if (schoolType === 'smk') {
            options = ['X', 'XI', 'XII'];
        } else {
            options = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
        }
        console.log(`📚 populateKelasOptions: menggunakan default (${schoolType}) -> ${options.join(', ')}`);
    }
    
    const currentVal = kelasSelect.value;
    kelasSelect.innerHTML = '<option value="">-- Pilih Kelas --</option>' + options.map(k => `<option value="${k}">${k}</option>`).join('');
    
    if (currentVal && options.includes(currentVal)) {
        kelasSelect.value = currentVal;
    }
    
    console.log(`✅ populateKelasOptions selesai, total options: ${kelasSelect.options.length}`);
}

function populateJurusanOptions() {
    console.log("🔧 populateJurusanOptions dipanggil untuk form tambah siswa");
    
    const jurusanSelect = document.getElementById('newJurusan');
    if (!jurusanSelect) {
        if (formDropdownRetryCount < MAX_FORM_DROPDOWN_RETRY) {
            setTimeout(() => populateJurusanOptions(), 300);
        }
        return;
    }
    
    const currentVal = jurusanSelect.value;
    jurusanSelect.innerHTML = '<option value="">-- Pilih Jurusan --</option>';
    
    if (window.currentSchoolConfig && window.currentSchoolConfig.majors && window.currentSchoolConfig.majors.length > 0) {
        window.currentSchoolConfig.majors.forEach(j => {
            jurusanSelect.innerHTML += `<option value="${j}">${j}</option>`;
        });
        console.log(`🎓 populateJurusanOptions: ${window.currentSchoolConfig.majors.length} jurusan dari config`);
    } else {
        jurusanSelect.innerHTML += '<option value="UMUM">UMUM</option>';
        console.log(`🎓 populateJurusanOptions: menggunakan default UMUM`);
    }
    
    const availableOptions = Array.from(jurusanSelect.options).map(opt => opt.value);
    if (currentVal && availableOptions.includes(currentVal)) {
        jurusanSelect.value = currentVal;
    }
    
    console.log(`✅ populateJurusanOptions selesai, total options: ${jurusanSelect.options.length}`);
}

function populateStudentFilters() {
    console.log("🔧 populateStudentFilters dipanggil, retry count:", studentFiltersRetryCount);
    
    const kSelect = document.getElementById('filterStudentKelas');
    const jSelect = document.getElementById('filterStudentJurusan');
    
    if (!kSelect || !jSelect) {
        if (studentFiltersRetryCount < MAX_STUDENT_FILTERS_RETRY) {
            studentFiltersRetryCount++;
            console.warn(`⚠️ Student filter elements not found, retrying (${studentFiltersRetryCount}/${MAX_STUDENT_FILTERS_RETRY})...`);
            setTimeout(() => populateStudentFilters(), 300);
            return;
        } else {
            console.error("❌ Gagal menemukan filterStudentKelas atau filterStudentJurusan");
            return;
        }
    }
    
    studentFiltersRetryCount = 0;

    let kelasOptions = [];
    if (window.currentSchoolConfig && window.currentSchoolConfig.classes && window.currentSchoolConfig.classes.length > 0) {
        kelasOptions = window.currentSchoolConfig.classes;
    } else {
        const type = window.currentSchoolConfig?.type || 'smp';
        if (type === 'smp') kelasOptions = ['VII', 'VIII', 'IX'];
        else if (type === 'smk') kelasOptions = ['X', 'XI', 'XII'];
        else kelasOptions = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    }
    
    const currentKelas = kSelect.value;
    kSelect.innerHTML = '<option value="all">📚 Semua Kelas</option>' + 
        kelasOptions.map(k => `<option value="${k}">${k}</option>`).join('');
    if (currentKelas !== 'all' && kelasOptions.includes(currentKelas)) {
        kSelect.value = currentKelas;
    }

    let jurusanOptions = ['UMUM'];
    if (window.currentSchoolConfig && window.currentSchoolConfig.majors && window.currentSchoolConfig.majors.length > 0) {
        jurusanOptions = window.currentSchoolConfig.majors;
    }
    
    const currentJurusan = jSelect.value;
    jSelect.innerHTML = '<option value="all">🎓 Semua Jurusan</option>' + 
        jurusanOptions.map(j => `<option value="${j}">${j}</option>`).join('');
    if (currentJurusan !== 'all' && jurusanOptions.includes(currentJurusan)) {
        jSelect.value = currentJurusan;
    }
    
    console.log(`✅ populateStudentFilters selesai: ${kelasOptions.length} kelas, ${jurusanOptions.length} jurusan`);
}

// ======================= DELAY INPUT HANDLERS =======================

function toggleDelayInput() {
    const unit = document.getElementById('delayUnit');
    if (!unit) return;
    const minutesGroup = document.getElementById('delayMinutesGroup');
    const hoursGroup = document.getElementById('delayHoursGroup');
    const hidden = document.getElementById('newDelay');
    if (unit.value === 'minutes') {
        if (minutesGroup) minutesGroup.style.display = 'flex';
        if (hoursGroup) hoursGroup.style.display = 'none';
        if (hidden) hidden.value = parseInt(document.getElementById('delayMinutesValue')?.value) || 60;
    } else {
        if (minutesGroup) minutesGroup.style.display = 'none';
        if (hoursGroup) hoursGroup.style.display = 'flex';
        if (hidden) hidden.value = (parseInt(document.getElementById('delayHoursValue')?.value) || 1) * 60;
    }
}

function updateDelayFromMinutes() {
    const val = parseInt(document.getElementById('delayMinutesValue')?.value) || 0;
    const hidden = document.getElementById('newDelay');
    if (hidden) hidden.value = val;
}

function updateDelayFromHours() {
    const val = parseInt(document.getElementById('delayHoursValue')?.value) || 0;
    const hidden = document.getElementById('newDelay');
    if (hidden) hidden.value = val * 60;
}

function getDelayInMinutes() {
    const unit = document.getElementById('delayUnit')?.value;
    if (unit === 'minutes') return parseInt(document.getElementById('delayMinutesValue')?.value) || 60;
    return (parseInt(document.getElementById('delayHoursValue')?.value) || 1) * 60;
}

function setDelayFormValue(delayMinutes) {
    if (!delayMinutes && delayMinutes !== 0) delayMinutes = 60;
    const hours = Math.floor(delayMinutes / 60);
    const minutes = delayMinutes % 60;
    const unit = document.getElementById('delayUnit');
    const hoursSelect = document.getElementById('delayHoursValue');
    const minutesInput = document.getElementById('delayMinutesValue');
    if (hours > 0 && minutes === 0) {
        if (unit) unit.value = 'hours';
        if (hoursSelect) hoursSelect.value = hours;
    } else {
        if (unit) unit.value = 'minutes';
        if (minutesInput) minutesInput.value = delayMinutes;
    }
    toggleDelayInput();
}

function formatDelayDisplay(delayMinutes) {
    if (!delayMinutes && delayMinutes !== 0) return '-';
    const jam = Math.floor(delayMinutes / 60);
    const menit = delayMinutes % 60;
    if (jam > 0 && menit > 0) return `${jam} jam ${menit} menit`;
    if (jam > 0) return `${jam} jam`;
    return `${menit} menit`;
}

// ======================= RENDER TABEL SISWA (DIPERBAIKI) =======================

function renderStudentsTable(retryCount = 0) {
    const MAX_RETRY = 5;
    const RETRY_DELAY = 200;
    
    const tabStudents = document.getElementById('tab-students');
    if (!tabStudents) {
        console.error("students.js: Tab students container not found!");
        return;
    }
    
    let tbody = document.getElementById('tbody-students');
    if (!tbody) {
        tbody = tabStudents.querySelector('.table-container tbody');
    }
    
    if (!tbody) {
        const tableContainer = tabStudents.querySelector('.table-container');
        if (tableContainer) {
            let table = tableContainer.querySelector('table');
            if (!table) {
                table = document.createElement('table');
                table.innerHTML = '<thead><tr><th>ID FP</th><th>Nama</th><th>Kelas</th><th>Jurusan</th><th>Delay</th><th>Aksi</th></tr></thead>';
                tableContainer.appendChild(table);
                console.log("students.js: Created table dynamically");
            }
            tbody = document.createElement('tbody');
            tbody.id = 'tbody-students';
            table.appendChild(tbody);
            console.log("students.js: Created tbody-students dynamically");
        }
    }
    
    if (!tbody) {
        if (retryCount < MAX_RETRY) {
            console.warn(`students.js: tbody-students not found, retrying (${retryCount+1}/${MAX_RETRY})...`);
            setTimeout(() => renderStudentsTable(retryCount + 1), RETRY_DELAY);
            return;
        } else {
            console.error("students.js: Gagal menemukan tbody-students");
            return;
        }
    }
    
    // CEK DATA
    if (typeof dbData === 'undefined' || !dbData.users) {
        console.log("⏳ students.js: dbData.users not ready yet");
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;">⏳ Memuat data siswa...</td></tr>`;
        return;
    }
    
    if (dbData.users.length === 0) {
        console.log("📭 students.js: Tidak ada data siswa");
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;">📭 Belum ada data siswa. Silakan tambah siswa melalui form di atas.</div></div></div></td></tr>`;
        updateStudentStatistics();
        return;
    }
    
    // AMBIL FILTER
    const search = document.getElementById('searchStudentName')?.value.toLowerCase() || '';
    const kelas = document.getElementById('filterStudentKelas')?.value || 'all';
    const jurusan = document.getElementById('filterStudentJurusan')?.value || 'all';

    // 🔥 PERBAIKAN: Definisikan variabel data
    let data = dbData.users.filter(u => u.nama && u.nama.toLowerCase().includes(search));
    if (kelas !== 'all') data = data.filter(u => u.kelas === kelas);
    if (jurusan !== 'all') data = data.filter(u => u.jurusan === jurusan);
    data.sort((a, b) => parseInt(a.id) - parseInt(b.id));

    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;">📭 Data siswa tidak ditemukan.${search ? '<br><small>Coba kata kunci lain</small>' : ''}</div></div></div></td></tr>`;
        updateStudentStatistics();
        return;
    }

    // RENDER SISWA
    data.forEach(s => {
        const isNew = s.createdAt && (Date.now() - s.createdAt < 300000);
        tbody.innerHTML += `
            <tr data-id="${s.id}">
                <td><strong>${s.id}</strong>${isNew ? '<br><span class="badge-new-student">NEW</span>' : ''}</div>
                <td>${escapeHtmlStudents(s.nama)}</div>
                <td>${s.kelas || '-'}</div>
                <td>${s.jurusan || '-'}</div>
                <td><span class="delay-badge">⏱️ ${formatDelayDisplay(s.delayOut)}</span></div>
                <td>
                    <button class="btn-icon edit" onclick="editStudent('${s.id}')" title="Edit Siswa">✏️</button>
                    <button class="btn-icon delete" onclick="deleteStudentWithFP('${s.id}')" title="Hapus Siswa">🗑️</button>
                  </div>
              </tr>
        `;
    });
    
    updateStudentStatistics();
    console.log(`✅ renderStudentsTable selesai, menampilkan ${data.length} siswa`);
}

// ======================= UPDATE STATISTIK =======================

function updateStudentStatistics() {
    let statsContainer = document.getElementById('studentsStats');
    if (!statsContainer) {
        const controlsBar = document.querySelector('#tab-students .controls-bar:first-child');
        if (controlsBar) {
            statsContainer = document.createElement('div');
            statsContainer.id = 'studentsStats';
            statsContainer.style.marginBottom = '10px';
            controlsBar.insertAdjacentElement('afterend', statsContainer);
        } else return;
    }

    const total = dbData.users?.length || 0;
    const kelasCount = {}, jurusanCount = {};
    if (dbData.users) {
        dbData.users.forEach(s => {
            if (s.kelas) kelasCount[s.kelas] = (kelasCount[s.kelas] || 0) + 1;
            if (s.jurusan) jurusanCount[s.jurusan] = (jurusanCount[s.jurusan] || 0) + 1;
        });
    }
    const topKelas = Object.entries(kelasCount).sort((a,b) => b[1]-a[1])[0];
    const topJurusan = Object.entries(jurusanCount).sort((a,b) => b[1]-a[1])[0];

    statsContainer.innerHTML = `
        <div style="display:flex;gap:20px;flex-wrap:wrap;padding:10px;background:#1e1e1e;border-radius:8px;margin-bottom:15px;">
            <div><span style="color:#4a90e2;">👥 Total Siswa:</span> <strong>${total}</strong></div>
            <div><span style="color:#4a90e2;">📚 Kelas Terbanyak:</span> <strong>${topKelas ? `${topKelas[0]} (${topKelas[1]})` : '-'}</strong></div>
            <div><span style="color:#4a90e2;">🎓 Jurusan Terbanyak:</span> <strong>${topJurusan ? `${topJurusan[0]} (${topJurusan[1]})` : '-'}</strong></div>
        </div>
    `;
}

// ======================= CRUD SISWA =======================

function saveStudent() {
    if (!currentUser || currentUser.role === 'siswa') {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    let idStr = document.getElementById('newId')?.value.trim();
    const nama = document.getElementById('newNama')?.value.trim();
    const kelas = document.getElementById('newKelas')?.value;
    const jurusan = document.getElementById('newJurusan')?.value;
    const delay = getDelayInMinutes();
    const mode = document.getElementById('editMode')?.value;

    if (!nama || !idStr) { showToast("⚠️ ID dan Nama wajib diisi!", "error"); return; }
    if (!kelas) { showToast("⚠️ Pilih Kelas!", "error"); return; }
    if (!jurusan) { showToast("⚠️ Pilih Jurusan!", "error"); return; }
    if (delay <= 0) { showToast("⚠️ Delay harus > 0!", "error"); return; }
    if (isNaN(parseInt(idStr))) { showToast("⚠️ ID harus angka!", "error"); return; }

    const studentData = {
        id: parseInt(idStr),
        nama: nama,
        kelas: kelas,
        jurusan: jurusan,
        delayOut: delay,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    if (mode === 'add') studentData.createdAt = firebase.database.ServerValue.TIMESTAMP;

    if (mode === 'add' && dbData.users?.some(u => u.id == idStr)) {
        showToast("❌ ID sudah ada!", "error");
        return;
    }

    const btn = document.getElementById('btnSaveStudent');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '💾 Menyimpan...'; }

    db.ref(`users/${idStr}`).set(studentData)
        .then(() => {
            showToast(mode === 'add' ? "✅ Siswa ditambahkan" : "✅ Siswa diupdate");
            resetStudentForm();
            const authUser = dbData.users_auth?.find(u => u.fpId == idStr);
            if (authUser) {
                db.ref(`users_auth/${authUser.uid}`).update({ nama, kelas, jurusan });
                if (currentUser.uid === authUser.uid) {
                    currentUser.nama = nama;
                    currentUser.kelas = kelas;
                    currentUser.jurusan = jurusan;
                    if (typeof saveUserToLocalStorage === 'function') saveUserToLocalStorage(currentUser);
                    if (typeof updateUserInterface === 'function') updateUserInterface();
                }
            }
        })
        .catch(err => showToast("❌ Gagal: " + err.message, "error"))
        .finally(() => {
            if (btn) { btn.disabled = false; btn.innerHTML = originalText || (mode === 'add' ? '➕ Simpan Siswa' : '💾 Update'); }
        });
}

function editStudent(id) {
    const s = dbData.users?.find(u => u.id == id);
    if (!s) { showToast("❌ Data tidak ditemukan", "error"); return; }
    document.querySelector('#tab-students .controls-bar:first-child')?.scrollIntoView({ behavior: 'smooth' });
    document.getElementById('newId').value = s.id;
    document.getElementById('newId').disabled = true;
    document.getElementById('newNama').value = s.nama;
    document.getElementById('newKelas').value = s.kelas;
    document.getElementById('newJurusan').value = s.jurusan;
    setDelayFormValue(s.delayOut || 60);
    document.getElementById('editMode').value = 'edit';
    const btnSave = document.getElementById('btnSaveStudent');
    const btnCancel = document.getElementById('btnCancelStudent');
    if (btnSave) { btnSave.innerHTML = '💾 Update Siswa'; btnSave.style.background = 'var(--warning)'; }
    if (btnCancel) btnCancel.classList.remove('hidden');
    showToast(`✏️ Edit mode: ${s.nama}`, "info");
}

function resetStudentForm() {
    if (studentFormResetTimer) clearTimeout(studentFormResetTimer);
    document.getElementById('newId').value = '';
    document.getElementById('newId').disabled = false;
    document.getElementById('newNama').value = '';
    document.getElementById('newKelas').value = '';
    document.getElementById('newJurusan').value = '';
    setDelayFormValue(60);
    document.getElementById('editMode').value = 'add';
    const btnSave = document.getElementById('btnSaveStudent');
    const btnCancel = document.getElementById('btnCancelStudent');
    if (btnSave) { btnSave.innerHTML = '➕ Simpan Siswa'; btnSave.style.background = ''; }
    if (btnCancel) btnCancel.classList.add('hidden');
    studentFormResetTimer = setTimeout(() => document.getElementById('newId')?.focus(), 100);
}

// ======================= HAPUS SISWA =======================

async function deleteStudentWithFP(studentId) {
    if (!currentUser || currentUser.role === 'siswa') {
        showToast("⛔ Akses ditolak!", "error");
        return;
    }
    const student = dbData.users?.find(u => u.id == studentId);
    const name = student?.nama || studentId;
    if (!confirm(`⚠️ Hapus siswa "${name}"?\n\nTINDAKAN INI TIDAK DAPAT DIBATALKAN!`)) return;

    const registeredUser = dbData.users_auth?.find(u => u.fpId == studentId);
    if (registeredUser && !confirm(`⚠️ Siswa ini punya akun (${registeredUser.email}). Hapus juga akunnya?`)) return;

    const btns = document.querySelectorAll(`button[onclick*="deleteStudent"][onclick*="${studentId}"]`);
    btns.forEach(btn => { btn.disabled = true; btn.innerHTML = '⏳'; });

    showToast(`🗑️ Menghapus ${name}...`, "info");

    try {
        await db.ref('commands/esp32/delete_fingerprint').set({
            studentId: parseInt(studentId),
            studentName: name,
            requestedBy: currentUser.nama || currentUser.email,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        // Tunggu response (timeout 15 detik)
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        setTimeout(() => db.ref('commands/esp32/delete_fingerprint').remove().catch(()=>{}), 2000);
    } catch(e) { console.warn(e); }

    if (registeredUser) await db.ref(`users_auth/${registeredUser.uid}`).remove().catch(()=>{});
    await db.ref(`users/${studentId}`).remove();
    showToast(`✅ Siswa "${name}" dihapus`, "success");
    if (typeof renderStudentsTable === 'function') renderStudentsTable();
    btns.forEach(btn => { btn.disabled = false; btn.innerHTML = '🗑️'; });
}

function deleteStudent(id) {
    if (confirm("Hapus siswa ini?")) deleteStudentWithFP(id);
}

// ======================= BULK OPERATIONS =======================

function importStudentsFromCSV(csvText) {
    const lines = csvText.trim().split('\n');
    let success = 0, fail = 0;
    for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 4) {
            const id = parts[0].trim();
            const nama = parts[1].trim();
            const kelas = parts[2].trim();
            const jurusan = parts[3].trim();
            const delay = parts[4] ? parseInt(parts[4].trim()) : 60;
            if (id && nama && kelas && jurusan) {
                db.ref(`users/${id}`).set({
                    id: parseInt(id), nama, kelas, jurusan, delayOut: delay,
                    createdAt: firebase.database.ServerValue.TIMESTAMP
                }).then(() => success++).catch(() => fail++);
            } else fail++;
        } else fail++;
    }
    setTimeout(() => showToast(`✅ Import: ${success} berhasil, ${fail} gagal`, fail ? "warning" : "success"), 1000);
}

function exportStudentsToCSV() {
    if (!dbData.users?.length) { showToast("❌ Tidak ada data", "error"); return; }
    let csv = "\uFEFFID,Nama,Kelas,Jurusan,Delay (menit)\n";
    dbData.users.forEach(s => {
        csv += `"${s.id}","${escapeCsv(s.nama)}","${s.kelas || '-'}","${s.jurusan || '-'}","${s.delayOut || 60}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `data_siswa_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("📥 Data siswa diekspor", "success");
}

function escapeCsv(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
    return str;
}

// ======================= CLEANUP =======================

function cleanupStudentsSystem() {
    if (studentFormResetTimer) clearTimeout(studentFormResetTimer);
    studentsDataReadyListenerAdded = false;
    studentsTabActive = false;
    studentFiltersRetryCount = 0;
    formDropdownRetryCount = 0;
    console.log("🧹 Students system cleaned up");
}

// ======================= UTILITY =======================

function escapeHtmlStudents(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function initDelayEventListeners() {
    const minutes = document.getElementById('delayMinutesValue');
    const hours = document.getElementById('delayHoursValue');
    const unit = document.getElementById('delayUnit');
    if (minutes) minutes.addEventListener('input', updateDelayFromMinutes);
    if (hours) hours.addEventListener('change', updateDelayFromHours);
    if (unit) unit.addEventListener('change', toggleDelayInput);
    setTimeout(() => toggleDelayInput(), 100);
}

// ======================= INISIALISASI ========================
setupStudentsDataReadyListener();
initTabActiveMonitor();

// Initial population of student filters
function initialPopulateStudentFilters() {
    if (document.getElementById('filterStudentKelas') && document.getElementById('filterStudentJurusan')) {
        populateStudentFilters();
    } else {
        console.log("⏳ Menunggu DOM untuk populateStudentFilters...");
        setTimeout(initialPopulateStudentFilters, 300);
    }
}

// Initial population of form dropdowns
function initialPopulateFormDropdowns() {
    if (document.getElementById('newKelas') && document.getElementById('newJurusan')) {
        populateKelasOptions();
        populateJurusanOptions();
        console.log("✅ Form dropdowns initialized");
    } else {
        console.log("⏳ Menunggu DOM untuk form dropdowns...");
        setTimeout(initialPopulateFormDropdowns, 300);
    }
}

// Start initial populations
setTimeout(initialPopulateStudentFilters, 500);
setTimeout(initialPopulateFormDropdowns, 500);

// Jika data sudah ada
if (typeof window !== 'undefined' && window.dbData && window.dbData.users) {
    console.log("📊 students.js: Data already available");
    setTimeout(() => {
        if (studentsTabActive) {
            renderStudentsTable();
        }
        populateKelasOptions();
        populateJurusanOptions();
        populateStudentFilters();
    }, 100);
}

// Override switchTab
const originalSwitchTab = window.switchTab;
if (originalSwitchTab && typeof originalSwitchTab === 'function') {
    window.switchTab = function(tabId) {
        originalSwitchTab(tabId);
        window.dispatchEvent(new CustomEvent('tabSwitched', { detail: { tabId: tabId } }));
        if (tabId === 'students') {
            setTimeout(() => {
                renderStudentsTable();
                populateStudentFilters();
                populateKelasOptions();
                populateJurusanOptions();
            }, 100);
        }
    };
}

// ======================= EXPORT KE GLOBAL =======================
window.populateKelasOptions = populateKelasOptions;
window.populateJurusanOptions = populateJurusanOptions;
window.populateStudentFilters = populateStudentFilters;
window.renderStudentsTable = renderStudentsTable;
window.saveStudent = saveStudent;
window.editStudent = editStudent;
window.resetStudentForm = resetStudentForm;
window.deleteStudent = deleteStudent;
window.deleteStudentWithFP = deleteStudentWithFP;
window.importStudentsFromCSV = importStudentsFromCSV;
window.exportStudentsToCSV = exportStudentsToCSV;
window.cleanupStudentsSystem = cleanupStudentsSystem;
window.initDelayEventListeners = initDelayEventListeners;

console.log("✅ students.js V3.6 loaded - Fixed renderStudentsTable data variable");