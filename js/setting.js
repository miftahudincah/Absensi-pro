// setting.js - VERSION 3.8 (DENGAN DETEKSI OFFLINE ESP32 & LAST SEEN)
// PENGATURAN SEKOLAH (SCHOOL CONFIG) & DELAY GLOBAL
// Dengan dukungan manajemen KELAS dan JURUSAN yang bisa diedit
// SENSOR STATUS: Dengan deteksi offline berdasarkan timestamp
// PERUBAHAN V3.8: Menambahkan deteksi ESP32 offline berdasarkan last_ping
// ============================================================================

let currentSchoolConfig = {
    type: 'smp',
    majors: [],
    classes: ['VII', 'VIII', 'IX']
};

// Pengaturan jam efektif & hari libur (default)
let attendanceSettings = {
    lateThreshold: '07:30',
    minOutTime: '14:00',
    weeklyHolidays: [0], // Minggu
    dateHolidays: []
};

let settingDataReadyListenerAdded = false;
let settingUiReadyListenerAdded = false;
let isSchoolConfigLoaded = false;
let esp32OfflineCheckInterval = null;
let lastEsp32DataTimestamp = null;
let isEsp32Online = false;

// Konfigurasi timeout ESP32 (2 menit = 120000 ms)
const ESP32_TIMEOUT_MS = 120000; // 2 menit

// Pastikan window.currentSchoolConfig selalu sinkron (dengan return promise)
function syncSchoolConfigToWindow() {
    window.currentSchoolConfig = {
        type: currentSchoolConfig.type,
        majors: [...currentSchoolConfig.majors],
        classes: [...currentSchoolConfig.classes]
    };
    console.log("🔄 Synced school config to window:", window.currentSchoolConfig.type, 
                "classes:", window.currentSchoolConfig.classes.length,
                "majors:", window.currentSchoolConfig.majors.length);
    
    const typeSelect = document.getElementById('schoolTypeSelect');
    if (typeSelect && typeSelect.value !== currentSchoolConfig.type) {
        typeSelect.value = currentSchoolConfig.type;
        console.log(`📋 Set schoolTypeSelect to: ${currentSchoolConfig.type}`);
    }
    
    const majorsDiv = document.getElementById('majorsManager');
    if (majorsDiv) {
        const shouldShow = (currentSchoolConfig.type === 'smk' || currentSchoolConfig.type === 'both');
        majorsDiv.style.display = shouldShow ? 'block' : 'none';
    }
    
    return window.currentSchoolConfig;
}

// Fungsi untuk memaksa reload school config dari Firebase
function forceReloadSchoolConfig() {
    console.log("🔄 Force reloading school config from Firebase...");
    
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya admin atau developer yang dapat me-refresh config!", "error");
        return;
    }
    
    const btn = event?.target;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Memuat...';
    }
    
    db.ref('school_config').once('value').then((snapshot) => {
        const data = snapshot.val();
        console.log("📡 Force reload result:", JSON.stringify(data));
        
        if (data && typeof data === 'object') {
            const configType = data.type || 'smp';
            const configClasses = data.classes || [];
            const configMajors = data.majors || [];
            
            console.log(`🏫 Reloaded config: type=${configType}, classes=${configClasses.length}, majors=${configMajors.length}`);
            
            currentSchoolConfig.type = configType;
            currentSchoolConfig.majors = [...configMajors];
            currentSchoolConfig.classes = [...configClasses];
            
            syncSchoolConfigToWindow();
            updateSchoolTypeUI();
            renderClassesList();
            renderMajorsList();
            
            setTimeout(() => {
                console.log("🔄 Force repopulating all dropdowns after force reload...");
                if (typeof populateKelasOptions === 'function') populateKelasOptions();
                if (typeof populateJurusanOptions === 'function') populateJurusanOptions();
                if (typeof populateStudentFilters === 'function') populateStudentFilters();
                if (typeof populateFilters === 'function') populateFilters();
                if (typeof populateDateFilter === 'function') populateDateFilter();
                if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
            }, 100);
            
            if (typeof loadRekap === 'function' && document.getElementById('tab-rekap')?.classList.contains('active')) {
                setTimeout(() => loadRekap(), 200);
            }
            
            showToast("✅ Konfigurasi sekolah dimuat ulang!", "success");
            
            if (typeof logActivity === 'function') {
                logActivity('force_reload_school_config', `Memuat ulang konfigurasi sekolah: tipe=${configType}, kelas=${configClasses.length}, jurusan=${configMajors.length}`);
            }
        } else {
            console.log("⚠️ No school config found in Firebase");
            showToast("⚠️ Tidak ada konfigurasi di Firebase", "warning");
        }
    }).catch(err => {
        console.error("Force reload error:", err);
        showToast("❌ Gagal memuat ulang config: " + err.message, "error");
    }).finally(() => {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '🔄 Refresh Config';
        }
    });
}

// Inisialisasi awal
syncSchoolConfigToWindow();

// ======================= EVENT LISTENER ========================

function setupSettingDataReadyListener() {
    if (settingDataReadyListenerAdded) return;
    settingDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for settings module");

    window.addEventListener('dataReady', (e) => {
        console.log("⚙️ setting.js: dataReady received, updating settings UI");
        
        if (!isSchoolConfigLoaded && window.currentSchoolConfig) {
            currentSchoolConfig = {
                type: window.currentSchoolConfig.type || 'smp',
                majors: window.currentSchoolConfig.majors || [],
                classes: window.currentSchoolConfig.classes || ['VII', 'VIII', 'IX']
            };
            updateSchoolTypeUI();
            renderClassesList();
            renderMajorsList();
            syncSchoolConfigToWindow();
        }
        
        const delaySpan = document.getElementById('globalDelayDisplay');
        if (delaySpan && window.globalDelayValue !== undefined) {
            delaySpan.textContent = formatDelayText(window.globalDelayValue);
        }
        
        setTimeout(() => {
            if (typeof populateKelasOptions === 'function') populateKelasOptions();
            if (typeof populateJurusanOptions === 'function') populateJurusanOptions();
            if (typeof populateStudentFilters === 'function') populateStudentFilters();
            if (typeof populateFilters === 'function') populateFilters();
            if (typeof populateDateFilter === 'function') populateDateFilter();
        }, 100);
    });
}

function setupSettingUiReadyListener() {
    if (settingUiReadyListenerAdded) return;
    settingUiReadyListenerAdded = true;
    console.log("📡 Setting up uiReady event listener for sensor status");

    window.addEventListener('uiReady', (e) => {
        const user = e.detail.currentUser;
        if (user && (user.role === 'admin' || user.role === 'developer')) {
            console.log("🔍 uiReady: initializing sensor status for admin/developer");
            initSensorStatusListener();
            startEsp32OfflineChecker();
        } else {
            const panel = document.getElementById('sensorStatusPanel');
            if (panel) panel.style.display = 'none';
        }
    });
}

// ======================= FUNGSI FORMAT DELAY =======================

function formatDelayText(delayMinutes) {
    if (!delayMinutes && delayMinutes !== 0) return '-';
    const hours = Math.floor(delayMinutes / 60);
    const minutes = delayMinutes % 60;
    if (hours > 0 && minutes > 0) return `${hours} jam ${minutes} menit`;
    if (hours > 0) return `${hours} jam`;
    return `${minutes} menit`;
}

// ======================= DELAY GLOBAL (UI only, tanpa listener) =======================

function toggleGlobalDelayInput() {
    const unit = document.getElementById('globalDelayUnit');
    if (!unit) return;
    const minutesGroup = document.getElementById('globalDelayMinutesGroup');
    const hoursGroup = document.getElementById('globalDelayHoursGroup');
    const hiddenDelay = document.getElementById('globalDelayHidden');
    if (unit.value === 'minutes') {
        if (minutesGroup) minutesGroup.style.display = 'flex';
        if (hoursGroup) hoursGroup.style.display = 'none';
        const minutesValue = parseInt(document.getElementById('globalDelayMinutesValue')?.value) || 60;
        if (hiddenDelay) hiddenDelay.value = minutesValue;
    } else {
        if (minutesGroup) minutesGroup.style.display = 'none';
        if (hoursGroup) hoursGroup.style.display = 'flex';
        const hoursValue = parseInt(document.getElementById('globalDelayHoursValue')?.value) || 1;
        if (hiddenDelay) hiddenDelay.value = hoursValue * 60;
    }
}

function updateGlobalDelayFromMinutes() {
    const minutesValue = parseInt(document.getElementById('globalDelayMinutesValue')?.value) || 0;
    const hiddenDelay = document.getElementById('globalDelayHidden');
    if (hiddenDelay) hiddenDelay.value = minutesValue;
}

function updateGlobalDelayFromHours() {
    const hoursValue = parseInt(document.getElementById('globalDelayHoursValue')?.value) || 0;
    const hiddenDelay = document.getElementById('globalDelayHidden');
    if (hiddenDelay) hiddenDelay.value = hoursValue * 60;
}

function getGlobalDelayFromForm() {
    const unit = document.getElementById('globalDelayUnit')?.value;
    if (unit === 'minutes') {
        return parseInt(document.getElementById('globalDelayMinutesValue')?.value) || 60;
    } else {
        const hours = parseInt(document.getElementById('globalDelayHoursValue')?.value) || 1;
        return hours * 60;
    }
}

function setGlobalDelayFormValue(delayMinutes) {
    if (!delayMinutes && delayMinutes !== 0) delayMinutes = 60;
    const hours = Math.floor(delayMinutes / 60);
    const minutes = delayMinutes % 60;
    const unit = document.getElementById('globalDelayUnit');
    const minutesInput = document.getElementById('globalDelayMinutesValue');
    const hoursSelect = document.getElementById('globalDelayHoursValue');
    if (hours > 0 && minutes === 0) {
        if (unit) unit.value = 'hours';
        if (hoursSelect) hoursSelect.value = hours;
    } else {
        if (unit) unit.value = 'minutes';
        if (minutesInput) minutesInput.value = delayMinutes;
    }
    toggleGlobalDelayInput();
}

function saveGlobalDelay() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya admin dan developer yang dapat mengubah delay global.", "error");
        return;
    }
    const delayMinutes = getGlobalDelayFromForm();
    if (delayMinutes <= 0) {
        showToast("⚠️ Delay harus lebih dari 0 menit!", "error");
        return;
    }
    const oldDelay = window.globalDelayValue || 60;
    const btn = document.getElementById('btnSaveGlobalDelay');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '💾 Menyimpan...';
    }
    db.ref('settings/delayOut').set(delayMinutes)
        .then(() => {
            showToast(`✅ Delay global berhasil diupdate menjadi ${formatDelayText(delayMinutes)}`);
            const displaySpan = document.getElementById('globalDelayDisplay');
            if (displaySpan) displaySpan.textContent = formatDelayText(delayMinutes);
            
            if (typeof logActivity === 'function') {
                logActivity('update_global_delay', `Mengubah delay pulang global dari ${formatDelayText(oldDelay)} menjadi ${formatDelayText(delayMinutes)}`);
            }
        })
        .catch(err => showToast("❌ Gagal menyimpan: " + err.message, "error"))
        .finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '💾 Simpan Delay Global';
            }
        });
}

function initGlobalDelayListeners() {
    const unitSelect = document.getElementById('globalDelayUnit');
    const minutesInput = document.getElementById('globalDelayMinutesValue');
    const hoursSelect = document.getElementById('globalDelayHoursValue');
    if (unitSelect) {
        unitSelect.removeEventListener('change', toggleGlobalDelayInput);
        unitSelect.addEventListener('change', toggleGlobalDelayInput);
    }
    if (minutesInput) {
        minutesInput.removeEventListener('input', updateGlobalDelayFromMinutes);
        minutesInput.addEventListener('input', updateGlobalDelayFromMinutes);
    }
    if (hoursSelect) {
        hoursSelect.removeEventListener('change', updateGlobalDelayFromHours);
        hoursSelect.addEventListener('change', updateGlobalDelayFromHours);
    }
    toggleGlobalDelayInput();
}

// ======================= MANAJEMEN KELAS =======================

function renderClassesList() {
    const container = document.getElementById('classesList');
    if (!container) return;
    const classes = currentSchoolConfig.classes || [];
    if (classes.length === 0) {
        container.innerHTML = '<p class="text-small" style="margin: 8px; color: #888;">📭 Belum ada kelas. Tambahkan di bawah.</p>';
        return;
    }
    let html = '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';
    classes.forEach((className, index) => {
        html += `
            <div style="background: #2c2c3a; padding: 8px 14px; border-radius: 25px; display: flex; align-items: center; gap: 10px; border-left: 3px solid #4caf50;">
                <span>🏫 ${escapeHtmlStr(className)}</span>
                <span class="btn-icon delete" style="font-size: 14px; cursor: pointer; color: #f44336;" onclick="removeClass(${index})">✖</span>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function addClass() {
    const input = document.getElementById('newClassInput');
    if (!input) return;
    let newClass = input.value.trim().toUpperCase();
    if (!newClass) {
        showToast("⚠️ Masukkan nama kelas!", "error");
        return;
    }
    newClass = formatClassName(newClass);
    if (currentSchoolConfig.classes.includes(newClass)) {
        showToast("❌ Kelas sudah ada!", "error");
        return;
    }
    currentSchoolConfig.classes.push(newClass);
    syncSchoolConfigToWindow();
    input.value = '';
    renderClassesList();
    showToast(`✅ Kelas "${newClass}" ditambahkan. Jangan lupa klik 'Simpan Semua Kelas'.`, "success");
    input.focus();
}

function formatClassName(input) {
    let result = input.toUpperCase();
    const romanMap = {
        '7': 'VII', 'VIII': 'VIII', '7A': 'VII A', '7B': 'VII B', '7C': 'VII C',
        '8': 'VIII', '8A': 'VIII A', '8B': 'VIII B', '8C': 'VIII C',
        '9': 'IX', '9A': 'IX A', '9B': 'IX B', '9C': 'IX C',
        '10': 'X', '10A': 'X A', '10B': 'X B', '10C': 'X C',
        '11': 'XI', '11A': 'XI A', '11B': 'XI B', '11C': 'XI C',
        '12': 'XII', '12A': 'XII A', '12B': 'XII B', '12C': 'XII C'
    };
    if (romanMap[result]) return romanMap[result];
    if (romanMap[result.replace(' ', '')]) return romanMap[result.replace(' ', '')];
    const match = result.match(/^([0-9]+|[IVX]+)\s*([A-Z]+)?$/);
    if (match) {
        let num = match[1];
        let suffix = match[2] || '';
        const numToRoman = { '7': 'VII', '8': 'VIII', '9': 'IX', '10': 'X', '11': 'XI', '12': 'XII' };
        if (numToRoman[num]) {
            result = numToRoman[num];
            if (suffix) result += ' ' + suffix;
        }
    }
    return result;
}

function removeClass(index) {
    if (index >= 0 && index < currentSchoolConfig.classes.length) {
        const removed = currentSchoolConfig.classes[index];
        currentSchoolConfig.classes.splice(index, 1);
        syncSchoolConfigToWindow();
        renderClassesList();
        showToast(`🗑️ Kelas "${removed}" dihapus sementara.`, "warning");
    }
}

function saveClasses() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya admin dan developer yang dapat mengubah daftar kelas.", "error");
        return;
    }
    if (currentSchoolConfig.classes.length === 0) {
        showToast("⚠️ Minimal harus ada 1 kelas!", "error");
        return;
    }
    const oldClasses = [...(window.currentSchoolConfig?.classes || [])];
    const btn = document.getElementById('btnSaveClasses');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '💾 Menyimpan...';
    }
    db.ref('school_config/classes').set(currentSchoolConfig.classes)
        .then(() => {
            showToast(`✅ Daftar kelas berhasil disimpan (${currentSchoolConfig.classes.length} kelas).`);
            syncSchoolConfigToWindow();
            
            if (typeof logActivity === 'function') {
                const added = currentSchoolConfig.classes.filter(c => !oldClasses.includes(c));
                const removed = oldClasses.filter(c => !currentSchoolConfig.classes.includes(c));
                let logDetail = `Jumlah kelas: ${currentSchoolConfig.classes.length}`;
                if (added.length) logDetail += `, ditambah: ${added.join(', ')}`;
                if (removed.length) logDetail += `, dihapus: ${removed.join(', ')}`;
                logActivity('save_classes', logDetail);
            }
            
            setTimeout(() => {
                if (typeof populateKelasOptions === 'function') populateKelasOptions();
                if (typeof populateStudentFilters === 'function') populateStudentFilters();
                if (typeof populateFilters === 'function') populateFilters();
            }, 100);
        })
        .catch(err => showToast("❌ Gagal: " + err.message, "error"))
        .finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '💾 Simpan Semua Kelas';
            }
        });
}

// ======================= PENGATURAN JURUSAN =======================

function updateSchoolTypeUI() {
    const typeSelect = document.getElementById('schoolTypeSelect');
    if (typeSelect && typeSelect.value !== currentSchoolConfig.type) {
        typeSelect.value = currentSchoolConfig.type;
        console.log(`📋 updateSchoolTypeUI set schoolTypeSelect to: ${currentSchoolConfig.type}`);
    }
    const majorsManager = document.getElementById('majorsManager');
    if (majorsManager) {
        const shouldShow = (currentSchoolConfig.type === 'smk' || currentSchoolConfig.type === 'both');
        majorsManager.style.display = shouldShow ? 'block' : 'none';
        console.log(`📋 Majors manager visibility: ${shouldShow ? 'show' : 'hide'}`);
    }
}

function renderMajorsList() {
    const container = document.getElementById('majorsList');
    if (!container) return;
    const majors = currentSchoolConfig.majors || [];
    if (majors.length === 0) {
        container.innerHTML = '<p class="text-small" style="margin: 8px; color: #888;">📭 Belum ada jurusan. Tambahkan di bawah.</p>';
        return;
    }
    let html = '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';
    majors.forEach((major, index) => {
        html += `
            <div style="background: #2c2c3a; padding: 8px 14px; border-radius: 25px; display: flex; align-items: center; gap: 10px; border-left: 3px solid #00bcd4;">
                <span>📚 ${escapeHtmlStr(major)}</span>
                <span class="btn-icon delete" style="font-size: 14px; cursor: pointer; color: #f44336;" onclick="removeMajor(${index})">✖</span>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function escapeHtmlStr(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

function saveSchoolType() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya admin dan developer yang dapat mengubah tipe sekolah.", "error");
        return;
    }
    
    const oldType = currentSchoolConfig.type;
    const newType = document.getElementById('schoolTypeSelect').value;
    console.log("📝 saveSchoolType dipanggil dengan tipe:", newType);
    
    let newClasses;
    if (newType === 'both') {
        newClasses = ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    } else if (newType === 'smp') {
        newClasses = ['VII', 'VIII', 'IX'];
    } else if (newType === 'smk') {
        newClasses = ['X', 'XI', 'XII'];
    } else {
        newClasses = ['VII', 'VIII', 'IX'];
    }
    
    let newMajors = [];
    if (newType === 'smk' || newType === 'both') {
        newMajors = currentSchoolConfig.majors;
    }
    
    const btn = document.querySelector('#tab-config button[onclick="saveSchoolType()"]');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '💾 Menyimpan...';
    }
    
    const updateData = {
        type: newType,
        classes: newClasses,
        majors: newMajors
    };
    
    console.log("📤 Saving to Firebase:", updateData);
    
    db.ref('school_config').update(updateData)
        .then(() => {
            console.log("✅ School config saved to Firebase:", updateData);
            showToast("✅ Tipe sekolah berhasil disimpan ke Firebase!");
            
            currentSchoolConfig.type = newType;
            currentSchoolConfig.classes = newClasses;
            currentSchoolConfig.majors = newMajors;
            
            syncSchoolConfigToWindow();
            updateSchoolTypeUI();
            renderClassesList();
            renderMajorsList();
            
            if (typeof logActivity === 'function') {
                logActivity('update_school_type', `Mengubah tipe sekolah dari ${oldType} menjadi ${newType}`);
            }
            
            setTimeout(() => {
                console.log("🔄 Populating all dropdowns after save...");
                if (typeof populateKelasOptions === 'function') populateKelasOptions();
                if (typeof populateJurusanOptions === 'function') populateJurusanOptions();
                if (typeof populateStudentFilters === 'function') populateStudentFilters();
                if (typeof populateFilters === 'function') populateFilters();
                if (typeof populateDateFilter === 'function') populateDateFilter();
                if (typeof populateStudentSelectForCode === 'function') populateStudentSelectForCode();
            }, 100);
            
            setTimeout(() => {
                if (typeof renderStudentsTable === 'function') renderStudentsTable();
                if (typeof renderTable === 'function') renderTable();
                if (typeof loadRekap === 'function' && document.getElementById('tab-rekap')?.classList.contains('active')) {
                    loadRekap();
                }
            }, 200);
        })
        .catch(err => {
            console.error("❌ Save school type error:", err);
            showToast("❌ Gagal menyimpan: " + err.message, "error");
        })
        .finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Simpan';
            }
        });
}

function addMajor() {
    const input = document.getElementById('newMajorInput');
    if (!input) return;
    const newMajor = input.value.trim().toUpperCase();
    if (!newMajor) {
        showToast("⚠️ Masukkan nama jurusan!", "error");
        return;
    }
    if (currentSchoolConfig.majors.includes(newMajor)) {
        showToast("❌ Jurusan sudah ada!", "error");
        return;
    }
    currentSchoolConfig.majors.push(newMajor);
    syncSchoolConfigToWindow();
    input.value = '';
    renderMajorsList();
    showToast(`✅ Jurusan "${newMajor}" ditambahkan. Jangan lupa klik 'Simpan Semua Jurusan'.`, "success");
    input.focus();
}

function removeMajor(index) {
    if (index >= 0 && index < currentSchoolConfig.majors.length) {
        const removed = currentSchoolConfig.majors[index];
        currentSchoolConfig.majors.splice(index, 1);
        syncSchoolConfigToWindow();
        renderMajorsList();
        showToast(`🗑️ Jurusan "${removed}" dihapus sementara.`, "warning");
    }
}

function saveMajors() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya admin dan developer yang dapat mengubah jurusan.", "error");
        return;
    }
    const oldMajors = [...(window.currentSchoolConfig?.majors || [])];
    const btn = document.getElementById('btnSaveMajors');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '💾 Menyimpan...';
    }
    db.ref('school_config/majors').set(currentSchoolConfig.majors)
        .then(() => {
            showToast(`✅ Daftar jurusan berhasil disimpan (${currentSchoolConfig.majors.length} jurusan).`);
            syncSchoolConfigToWindow();
            
            if (typeof logActivity === 'function') {
                const added = currentSchoolConfig.majors.filter(m => !oldMajors.includes(m));
                const removed = oldMajors.filter(m => !currentSchoolConfig.majors.includes(m));
                let logDetail = `Jumlah jurusan: ${currentSchoolConfig.majors.length}`;
                if (added.length) logDetail += `, ditambah: ${added.join(', ')}`;
                if (removed.length) logDetail += `, dihapus: ${removed.join(', ')}`;
                logActivity('save_majors', logDetail);
            }
            
            setTimeout(() => {
                if (typeof populateJurusanOptions === 'function') populateJurusanOptions();
                if (typeof populateStudentFilters === 'function') populateStudentFilters();
                if (typeof populateFilters === 'function') populateFilters();
            }, 100);
        })
        .catch(err => showToast("❌ Gagal: " + err.message, "error"))
        .finally(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '💾 Simpan Semua Jurusan';
            }
        });
}

function getDefaultClasses(schoolType) {
    if (schoolType === 'smp') return ['VII', 'VIII', 'IX'];
    if (schoolType === 'smk') return ['X', 'XI', 'XII'];
    return ['VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
}

// ======================= RESET, EXPORT, IMPORT =======================

function resetAllSettings() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya admin dan developer yang dapat mereset pengaturan!", "error");
        return;
    }
    if (!confirm("⚠️ Reset semua pengaturan ke default?\n\n- Delay global: 60 menit\n- Tipe sekolah: SMP\n- Kelas: VII, VIII, IX\n- Jurusan: kosong\n\nLanjutkan?")) return;
    const defaultClasses = ['VII', 'VIII', 'IX'];
    const btn = document.getElementById('btnResetSettings');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Mereset...';
    }
    Promise.all([
        db.ref('settings/delayOut').set(60),
        db.ref('school_config/type').set('smp'),
        db.ref('school_config/majors').set([]),
        db.ref('school_config/classes').set(defaultClasses)
    ]).then(() => {
        showToast("✅ Semua pengaturan berhasil direset!", "success");
        currentSchoolConfig.type = 'smp';
        currentSchoolConfig.majors = [];
        currentSchoolConfig.classes = defaultClasses;
        syncSchoolConfigToWindow();
        renderClassesList();
        renderMajorsList();
        updateSchoolTypeUI();
        const typeSelect = document.getElementById('schoolTypeSelect');
        if (typeSelect) typeSelect.value = 'smp';
        
        if (typeof logActivity === 'function') {
            logActivity('reset_all_settings', 'Meriset semua pengaturan ke default (delay global 60 menit, tipe SMP, kelas VII-IX, jurusan kosong)');
        }
        
        setTimeout(() => {
            if (typeof populateKelasOptions === 'function') populateKelasOptions();
            if (typeof populateJurusanOptions === 'function') populateJurusanOptions();
            if (typeof populateStudentFilters === 'function') populateStudentFilters();
            if (typeof populateFilters === 'function') populateFilters();
        }, 100);
    })
    .catch(err => showToast("❌ Gagal mereset: " + err.message, "error"))
    .finally(() => { if (btn) { btn.disabled = false; btn.innerHTML = '🔄 Reset ke Default'; } });
}

function exportSchoolConfig() {
    const config = { 
        schoolType: currentSchoolConfig.type, 
        classes: currentSchoolConfig.classes,
        majors: currentSchoolConfig.majors, 
        exportDate: new Date().toISOString() 
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `school_config_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("📥 Konfigurasi sekolah berhasil diekspor", "success");
    
    if (typeof logActivity === 'function') {
        logActivity('export_school_config', `Ekspor konfigurasi sekolah (tipe: ${currentSchoolConfig.type})`);
    }
}

function importSchoolConfig(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const config = JSON.parse(e.target.result);
            if (config.schoolType && ['smp','smk','both'].includes(config.schoolType)) {
                const updates = {
                    type: config.schoolType,
                    majors: config.majors || [],
                    classes: config.classes || getDefaultClasses(config.schoolType)
                };
                db.ref('school_config').update(updates);
                showToast("✅ Konfigurasi sekolah berhasil diimpor!", "success");
                
                if (typeof logActivity === 'function') {
                    logActivity('import_school_config', `Impor konfigurasi sekolah (tipe: ${config.schoolType}, kelas: ${config.classes?.length || 0}, jurusan: ${config.majors?.length || 0})`);
                }
            } else {
                showToast("❌ Format file tidak valid!", "error");
            }
        } catch(err) {
            showToast("❌ Gagal membaca file: " + err.message, "error");
        }
    };
    reader.readAsText(file);
}

// ======================= PENGATURAN JAM EFEKTIF & HARI LIBUR =======================

function loadAttendanceSettings() {
    db.ref('school_config/attendance_settings').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            attendanceSettings = {
                lateThreshold: data.lateThreshold || '07:30',
                minOutTime: data.minOutTime || '14:00',
                weeklyHolidays: data.weeklyHolidays || [0],
                dateHolidays: data.dateHolidays || []
            };
        } else {
            attendanceSettings = {
                lateThreshold: '07:30',
                minOutTime: '14:00',
                weeklyHolidays: [0],
                dateHolidays: []
            };
        }
        const lateInput = document.getElementById('lateThresholdInput');
        const minOutInput = document.getElementById('minOutTimeInput');
        if (lateInput) lateInput.value = attendanceSettings.lateThreshold;
        if (minOutInput) minOutInput.value = attendanceSettings.minOutTime;
        
        const checkboxes = document.querySelectorAll('#tab-config input[type="checkbox"][value]');
        checkboxes.forEach(cb => {
            const val = parseInt(cb.value);
            cb.checked = attendanceSettings.weeklyHolidays.includes(val);
        });
        renderHolidayDatesList();
        
        window.attendanceSettings = attendanceSettings;
    });
}

function renderHolidayDatesList() {
    const container = document.getElementById('holidayDatesList');
    if (!container) return;
    if (!attendanceSettings.dateHolidays || attendanceSettings.dateHolidays.length === 0) {
        container.innerHTML = '<small class="text-muted">Belum ada tanggal libur khusus</small>';
        return;
    }
    let html = '';
    attendanceSettings.dateHolidays.forEach(date => {
        html += `<div style="background: #2c2c3a; padding: 4px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 8px;">
                    📅 ${formatIndonesianDate(date)}
                    <span class="btn-icon delete" style="font-size: 12px; cursor: pointer;" onclick="removeHolidayDate('${date}')">✖</span>
                </div>`;
    });
    container.innerHTML = html;
}

function formatIndonesianDate(dateStr) {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parts[2]} ${bulan[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

function addHolidayDate() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya admin yang dapat mengubah hari libur!", "error");
        return;
    }
    const dateInput = document.getElementById('holidayDateInput');
    const date = dateInput.value;
    if (!date) {
        showToast("Pilih tanggal terlebih dahulu!", "error");
        return;
    }
    if (attendanceSettings.dateHolidays.includes(date)) {
        showToast("Tanggal sudah ada dalam daftar libur!", "warning");
        return;
    }
    attendanceSettings.dateHolidays.push(date);
    saveAttendanceSettingsToFirebase();
    dateInput.value = '';
    
    if (typeof logActivity === 'function') {
        logActivity('add_holiday_date', `Menambah tanggal libur: ${formatIndonesianDate(date)}`);
    }
}

function removeHolidayDate(date) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya admin yang dapat mengubah hari libur!", "error");
        return;
    }
    attendanceSettings.dateHolidays = attendanceSettings.dateHolidays.filter(d => d !== date);
    saveAttendanceSettingsToFirebase();
    
    if (typeof logActivity === 'function') {
        logActivity('remove_holiday_date', `Menghapus tanggal libur: ${formatIndonesianDate(date)}`);
    }
}

function saveAttendanceSettingsToFirebase() {
    const settings = {
        lateThreshold: attendanceSettings.lateThreshold,
        minOutTime: attendanceSettings.minOutTime,
        weeklyHolidays: attendanceSettings.weeklyHolidays,
        dateHolidays: attendanceSettings.dateHolidays
    };
    db.ref('school_config/attendance_settings').set(settings)
        .then(() => {
            showToast("✅ Pengaturan jam efektif & hari libur disimpan", "success");
        })
        .catch(err => showToast("❌ Gagal menyimpan: " + err.message, "error"));
}

function saveAttendanceSettings() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        showToast("⛔ Hanya admin yang dapat mengubah pengaturan!", "error");
        return;
    }
    const oldLateThreshold = attendanceSettings.lateThreshold;
    const oldMinOutTime = attendanceSettings.minOutTime;
    const oldWeeklyHolidays = [...attendanceSettings.weeklyHolidays];
    
    const lateThreshold = document.getElementById('lateThresholdInput').value;
    const minOutTime = document.getElementById('minOutTimeInput').value;
    const weeklyHolidays = [];
    const checkboxes = document.querySelectorAll('#tab-config input[type="checkbox"][value]');
    checkboxes.forEach(cb => {
        if (cb.checked) weeklyHolidays.push(parseInt(cb.value));
    });
    attendanceSettings.lateThreshold = lateThreshold;
    attendanceSettings.minOutTime = minOutTime;
    attendanceSettings.weeklyHolidays = weeklyHolidays;
    saveAttendanceSettingsToFirebase();
    
    if (typeof logActivity === 'function') {
        const changes = [];
        if (oldLateThreshold !== lateThreshold) changes.push(`batas terlambat: ${oldLateThreshold} → ${lateThreshold}`);
        if (oldMinOutTime !== minOutTime) changes.push(`minimal pulang: ${oldMinOutTime} → ${minOutTime}`);
        const addedHolidays = weeklyHolidays.filter(h => !oldWeeklyHolidays.includes(h));
        const removedHolidays = oldWeeklyHolidays.filter(h => !weeklyHolidays.includes(h));
        if (addedHolidays.length) changes.push(`libur mingguan tambah: ${addedHolidays.join(',')}`);
        if (removedHolidays.length) changes.push(`libur mingguan hapus: ${removedHolidays.join(',')}`);
        if (changes.length) {
            logActivity('save_attendance_settings', `Perubahan pengaturan jam efektif: ${changes.join('; ')}`);
        } else {
            logActivity('save_attendance_settings', 'Menyimpan pengaturan jam efektif (tanpa perubahan)');
        }
    }
}

// Fungsi pengecekan hari libur (digunakan di attendance.js dan rekap.js)
function isHoliday(dateStr) {
    if (!attendanceSettings) return false;
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    if (attendanceSettings.weeklyHolidays && attendanceSettings.weeklyHolidays.includes(dayOfWeek)) return true;
    if (attendanceSettings.dateHolidays && attendanceSettings.dateHolidays.includes(dateStr)) return true;
    return false;
}

function filterAttendanceByHoliday(attendanceArray) {
    if (!attendanceArray || !attendanceArray.length) return attendanceArray || [];
    return attendanceArray.filter(record => !isHoliday(record.date));
}

function getHolidayCountInRange(startDate, endDate) {
    let count = 0;
    let current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        if (isHoliday(dateStr)) count++;
        current.setDate(current.getDate() + 1);
    }
    return count;
}

// ======================= SENSOR STATUS (DENGAN DETEKSI OFFLINE) =======================

let sensorStatusListener = null;

// Fungsi untuk mengecek apakah ESP32 masih online (berdasarkan timestamp)
function checkEsp32OnlineStatus(lastPingTimestamp) {
    if (!lastPingTimestamp) return false;
    
    const now = Date.now();
    const lastPing = typeof lastPingTimestamp === 'number' ? lastPingTimestamp : new Date(lastPingTimestamp).getTime();
    const timeDiff = now - lastPing;
    
    const isOnline = timeDiff < ESP32_TIMEOUT_MS;
    
    // Update global status
    if (isEsp32Online !== isOnline) {
        isEsp32Online = isOnline;
        if (!isOnline) {
            console.log(`⚠️ ESP32 OFFLINE detected! Last ping: ${new Date(lastPing).toLocaleString()}, ${Math.floor(timeDiff/1000)}s ago`);
            if (typeof showToast === 'function') {
                showToast(`⚠️ ESP32 terdeteksi OFFLINE! Data terakhir: ${Math.floor(timeDiff/1000)} detik yang lalu`, 'warning');
            }
        } else {
            console.log(`✅ ESP32 ONLINE detected! Last ping: ${new Date(lastPing).toLocaleString()}`);
        }
    }
    
    return isOnline;
}

// Mulai pengecekan offline ESP32 (setiap 30 detik)
function startEsp32OfflineChecker() {
    if (esp32OfflineCheckInterval) {
        clearInterval(esp32OfflineCheckInterval);
    }
    
    // Cek setiap 30 detik
    esp32OfflineCheckInterval = setInterval(() => {
        db.ref('status/esp32/sensors/timestamp').once('value').then((snapshot) => {
            const timestamp = snapshot.val();
            checkEsp32OnlineStatus(timestamp);
            
            // Update tampilan sensor jika offline
            if (!isEsp32Online) {
                showEsp32OfflineWarning();
            }
        }).catch(err => {
            console.warn("Error checking ESP32 status:", err);
        });
        
        // Juga cek dari node last_ping
        db.ref('status/esp32/last_ping').once('value').then((snapshot) => {
            const lastPing = snapshot.val();
            if (lastPing) {
                checkEsp32OnlineStatus(lastPing);
            }
        }).catch(err => console.warn(err));
    }, 30000); // Setiap 30 detik
}

function showEsp32OfflineWarning() {
    const container = document.getElementById('sensorGrid');
    if (!container) return;
    
    // Cek apakah sudah ada warning
    const existingWarning = container.querySelector('.esp32-offline-warning');
    if (existingWarning) return;
    
    const warningDiv = document.createElement('div');
    warningDiv.className = 'esp32-offline-warning';
    warningDiv.style.cssText = `
        grid-column: 1 / -1;
        background: rgba(244, 67, 54, 0.15);
        border: 1px solid #f44336;
        border-radius: 12px;
        padding: 15px;
        text-align: center;
        margin-bottom: 10px;
    `;
    warningDiv.innerHTML = `
        <span style="color: #f44336; font-size: 20px;">⚠️</span>
        <div style="color: #f44336; font-weight: bold;">ESP32 OFFLINE</div>
        <small style="color: #ff8888;">Data terakhir lebih dari 2 menit yang lalu. ESP32 mungkin mati atau koneksi terputus.</small>
    `;
    
    container.insertBefore(warningDiv, container.firstChild);
}

function removeEsp32OfflineWarning() {
    const container = document.getElementById('sensorGrid');
    if (container) {
        const warning = container.querySelector('.esp32-offline-warning');
        if (warning) warning.remove();
    }
}

function initSensorStatusListener() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'developer')) {
        const panel = document.getElementById('sensorStatusPanel');
        if (panel) panel.style.display = 'none';
        return;
    }
    const panel = document.getElementById('sensorStatusPanel');
    if (panel) panel.style.display = 'block';
    if (sensorStatusListener) {
        db.ref('status/esp32/sensors').off('value', sensorStatusListener);
    }
    
    // Listener untuk data sensor
    sensorStatusListener = db.ref('status/esp32/sensors').on('value', (snapshot) => {
        const data = snapshot.val();
        if (data && data.sensors && data.sensors.length > 0) {
            // Update last timestamp
            lastEsp32DataTimestamp = data.timestamp || Date.now();
            const isOnline = checkEsp32OnlineStatus(lastEsp32DataTimestamp);
            
            if (isOnline) {
                removeEsp32OfflineWarning();
                renderSensorGrid(data);
                updateSensorHeaderInfo(data);
            } else {
                renderSensorGridOffline(data);
            }
        } else {
            renderNoSensorData();
        }
    });
}

function renderSensorGridOffline(data) {
    const container = document.getElementById('sensorGrid');
    if (!container) return;
    if (!data || !data.sensors || !Array.isArray(data.sensors)) {
        renderNoSensorData();
        return;
    }
    
    let html = '';
    data.sensors.forEach(sensor => {
        const isOnline = false; // Semua sensor dianggap offline
        const statusIcon = '❌';
        const statusText = 'OFFLINE';
        const statusClass = 'offline';
        const templates = sensor.templateCount || 0;
        html += `
            <div class="sensor-card ${statusClass}" style="opacity: 0.6;">
                <div class="sensor-number">#${sensor.id}</div>
                <div class="sensor-status-icon">${statusIcon}</div>
                <div class="sensor-status-text ${statusClass}">${statusText}</div>
                <div class="sensor-templates">📁 ${templates} sidik</div>
                <div class="sensor-error" style="font-size:10px;color:#f44336;margin-top:4px;">⏰ Data kadaluarsa</div>
            </div>
        `;
    });
    
    // Tambahkan warning di atas
    const warningHtml = `
        <div class="esp32-offline-warning" style="grid-column: 1 / -1; background: rgba(244, 67, 54, 0.15); border: 1px solid #f44336; border-radius: 12px; padding: 15px; text-align: center; margin-bottom: 10px;">
            <span style="color: #f44336; font-size: 20px;">⚠️</span>
            <div style="color: #f44336; font-weight: bold;">ESP32 OFFLINE / DATA KADALUARSA</div>
            <small style="color: #ff8888;">Data terakhir: ${data.timestamp ? new Date(data.timestamp).toLocaleString() : 'tidak diketahui'}</small><br>
            <small style="color: #ff8888;">ESP32 tidak mengirim data lebih dari 2 menit. Periksa koneksi ESP32.</small>
        </div>
    `;
    
    container.innerHTML = warningHtml + html;
}

function renderSensorGrid(data) {
    const container = document.getElementById('sensorGrid');
    if (!container) return;
    if (!data.sensors || !Array.isArray(data.sensors)) {
        container.innerHTML = '<div class="sensor-loading">📡 Menunggu data dari ESP32...</div>';
        return;
    }
    
    // Hapus warning jika ada
    removeEsp32OfflineWarning();
    
    let html = '';
    data.sensors.forEach(sensor => {
        const isOnline = sensor.status === 'online';
        const statusIcon = isOnline ? '✅' : '❌';
        const statusText = isOnline ? 'ONLINE' : 'OFFLINE';
        const statusClass = isOnline ? 'online' : 'offline';
        const templates = sensor.templateCount || 0;
        
        // Hitung umur data sensor
        const dataAge = data.timestamp ? (Date.now() - data.timestamp) / 1000 : 0;
        const isDataFresh = dataAge < ESP32_TIMEOUT_MS / 1000;
        
        html += `
            <div class="sensor-card ${statusClass} ${!isDataFresh ? 'data-stale' : ''}" style="${!isDataFresh ? 'opacity: 0.7;' : ''}">
                <div class="sensor-number">#${sensor.id}</div>
                <div class="sensor-status-icon">${statusIcon}</div>
                <div class="sensor-status-text ${statusClass}">${statusText}</div>
                <div class="sensor-templates">📁 ${templates} sidik</div>
                ${!isDataFresh ? `<div class="sensor-error" style="font-size:10px;color:#ff9800;margin-top:4px;">⚠️ Data kadaluarsa</div>` : ''}
                ${sensor.error ? `<div class="sensor-error" style="font-size:10px;color:#f44336;margin-top:4px;">${escapeHtmlStr(sensor.error)}</div>` : ''}
            </div>
        `;
    });
    container.innerHTML = html;
}

function updateSensorHeaderInfo(data) {
    const onlineCount = data.onlineCount || 0;
    const totalTemplates = data.totalTemplates || 0;
    const timestamp = data.timestamp;
    const dataAge = timestamp ? (Date.now() - timestamp) / 1000 : 999999;
    const isDataFresh = dataAge < ESP32_TIMEOUT_MS / 1000;
    
    const badge = document.getElementById('sensorOnlineBadge');
    if (badge) {
        if (!isDataFresh) {
            badge.textContent = `⚠️ DATA KADALUARSA`;
            badge.className = 'badge-danger';
        } else if (onlineCount === 16) {
            badge.textContent = `${onlineCount}/16 Online (Data Fresh)`;
            badge.className = 'badge-success';
        } else if (onlineCount >= 12) {
            badge.textContent = `${onlineCount}/16 Online`;
            badge.className = 'badge-warning';
        } else {
            badge.textContent = `${onlineCount}/16 Online`;
            badge.className = 'badge-danger';
        }
    }
    
    const lastUpdateSpan = document.getElementById('sensorLastUpdate');
    if (lastUpdateSpan && timestamp) {
        const date = new Date(timestamp);
        const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
        let ageText = '';
        if (secondsAgo < 60) {
            ageText = `${secondsAgo} detik yang lalu`;
        } else if (secondsAgo < 3600) {
            ageText = `${Math.floor(secondsAgo / 60)} menit yang lalu`;
        } else {
            ageText = `${Math.floor(secondsAgo / 3600)} jam yang lalu`;
        }
        lastUpdateSpan.textContent = `🕐 ${date.toLocaleTimeString('id-ID')} (${ageText})`;
        
        if (!isDataFresh) {
            lastUpdateSpan.style.color = '#ff9800';
            lastUpdateSpan.className = 'badge-warning';
        } else {
            lastUpdateSpan.style.color = '';
            lastUpdateSpan.className = 'badge-info';
        }
    } else if (lastUpdateSpan) {
        lastUpdateSpan.textContent = 'Menunggu data...';
    }
    
    const header = document.querySelector('#sensorStatusPanel .sensor-header h4');
    if (header) header.setAttribute('title', `Total ${totalTemplates} sidik jari tersimpan di semua sensor | ${!isDataFresh ? '⚠️ Data kadaluarsa - ESP32 mungkin offline' : ''}`);
}

function renderNoSensorData() {
    const container = document.getElementById('sensorGrid');
    if (!container) return;
    container.innerHTML = `<div class="sensor-loading">📡 Belum ada data dari ESP32<br><small>Pastikan ESP32 terhubung ke internet dan mengirim data status</small></div>`;
    const badge = document.getElementById('sensorOnlineBadge');
    if (badge) {
        badge.textContent = 'Menunggu data';
        badge.className = 'badge-warning';
    }
    const lastUpdateSpan = document.getElementById('sensorLastUpdate');
    if (lastUpdateSpan) {
        lastUpdateSpan.textContent = 'Menunggu data...';
        lastUpdateSpan.className = 'badge-info';
    }
}

function refreshSensorStatus() {
    if (typeof showToast === 'function') showToast("📡 Meminta refresh data sensor...", "info");
    if (db) {
        db.ref('commands/esp32/check_sensors').set({
            requestedBy: currentUser?.nama || 'Admin',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
            if (typeof showToast === 'function') showToast("✅ Perintah refresh dikirim ke ESP32", "success");
            setTimeout(() => db.ref('commands/esp32/check_sensors').remove(), 5000);
        }).catch(err => {
            console.error("Gagal kirim command:", err);
            if (typeof showToast === 'function') showToast("❌ Gagal mengirim perintah", "error");
        });
    }
    if (sensorStatusListener) {
        db.ref('status/esp32/sensors').once('value').then(snapshot => {
            const data = snapshot.val();
            if (data) { 
                const isOnline = checkEsp32OnlineStatus(data.timestamp);
                if (isOnline) {
                    renderSensorGrid(data);
                    updateSensorHeaderInfo(data);
                } else {
                    renderSensorGridOffline(data);
                }
            }
        }).catch(err => console.warn("Refresh error:", err));
    }
}

function cleanupSensorStatus() {
    if (sensorStatusListener) {
        db.ref('status/esp32/sensors').off('value', sensorStatusListener);
        sensorStatusListener = null;
    }
    if (esp32OfflineCheckInterval) {
        clearInterval(esp32OfflineCheckInterval);
        esp32OfflineCheckInterval = null;
    }
}

// ======================= CLEANUP =======================

function cleanupSettingsSystem() {
    cleanupSensorStatus();
    settingDataReadyListenerAdded = false;
    settingUiReadyListenerAdded = false;
    isSchoolConfigLoaded = false;
    console.log("🧹 Settings system cleaned up");
}

// ======================= INISIALISASI =======================

function initAllSettings() {
    console.log("🚀 initAllSettings - Memulai inisialisasi UI settings...");
    initGlobalDelayListeners();
    const globalHoursSelect = document.getElementById('globalDelayHoursValue');
    if (globalHoursSelect && globalHoursSelect.options.length <= 1) {
        for (let i = 1; i <= 24; i++) {
            globalHoursSelect.innerHTML += `<option value="${i}">${i} jam</option>`;
        }
    }
    const studentHoursSelect = document.getElementById('delayHoursValue');
    if (studentHoursSelect && studentHoursSelect.options.length <= 1) {
        for (let i = 1; i <= 24; i++) {
            studentHoursSelect.innerHTML += `<option value="${i}">${i} jam</option>`;
        }
    }
    db.ref('settings/delayOut').once('value').then(snapshot => {
        const delay = snapshot.val();
        setGlobalDelayFormValue(delay || 60);
        const displaySpan = document.getElementById('globalDelayDisplay');
        if (displaySpan) displaySpan.textContent = formatDelayText(delay || 60);
    });
    loadAttendanceSettings();
    console.log("✅ initAllSettings - Selesai");
}

setupSettingDataReadyListener();
setupSettingUiReadyListener();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initAllSettings, 100));
} else {
    setTimeout(initAllSettings, 100);
}

// ======================= EKSPOR KE GLOBAL =======================
window.formatDelayText = formatDelayText;
window.toggleGlobalDelayInput = toggleGlobalDelayInput;
window.updateGlobalDelayFromMinutes = updateGlobalDelayFromMinutes;
window.updateGlobalDelayFromHours = updateGlobalDelayFromHours;
window.saveGlobalDelay = saveGlobalDelay;
window.initGlobalDelayListeners = initGlobalDelayListeners;
window.renderClassesList = renderClassesList;
window.addClass = addClass;
window.removeClass = removeClass;
window.saveClasses = saveClasses;
window.renderMajorsList = renderMajorsList;
window.saveSchoolType = saveSchoolType;
window.addMajor = addMajor;
window.removeMajor = removeMajor;
window.saveMajors = saveMajors;
window.resetAllSettings = resetAllSettings;
window.exportSchoolConfig = exportSchoolConfig;
window.importSchoolConfig = importSchoolConfig;
window.initAllSettings = initAllSettings;
window.cleanupSettingsSystem = cleanupSettingsSystem;
window.initSensorStatusListener = initSensorStatusListener;
window.refreshSensorStatus = refreshSensorStatus;
window.cleanupSensorStatus = cleanupSensorStatus;
window.syncSchoolConfigToWindow = syncSchoolConfigToWindow;
window.forceReloadSchoolConfig = forceReloadSchoolConfig;
window.checkEsp32OnlineStatus = checkEsp32OnlineStatus;
window.startEsp32OfflineChecker = startEsp32OfflineChecker;

window.loadAttendanceSettings = loadAttendanceSettings;
window.addHolidayDate = addHolidayDate;
window.removeHolidayDate = removeHolidayDate;
window.saveAttendanceSettings = saveAttendanceSettings;
window.isHoliday = isHoliday;
window.filterAttendanceByHoliday = filterAttendanceByHoliday;
window.getHolidayCountInRange = getHolidayCountInRange;
window.renderHolidayDatesList = renderHolidayDatesList;

console.log("✅ setting.js V3.8 loaded - Dengan deteksi offline ESP32 berdasarkan timestamp (2 menit timeout)");
