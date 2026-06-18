// announcement.js - VERSION 4.0 (DENGAN UPLOAD GAMBAR & LOG AKTIVITAS)
// Fitur Pengumuman dengan Timer Otomatis, Real-time Updates, Notifikasi, dan Upload Gambar
// Sekarang role 'developer' memiliki akses penuh seperti admin & guru
// PERUBAHAN V4.0: Menambahkan fitur upload gambar ke Supabase/ImgBB
// ============================================================================

let announcementCheckInterval = null;
let announcementListenerAttached = false;
let announcementCountdownInterval = null;
let lastAnnouncementCount = 0;
let announcementDataReadyListenerAdded = false;
let announcementUiReadyListenerAdded = false;
let currentAnnouncementImageFile = null;

// ======================= EVENT LISTENER ========================

function setupAnnouncementDataReadyListener() {
    if (announcementDataReadyListenerAdded) return;
    announcementDataReadyListenerAdded = true;
    console.log("📡 Setting up dataReady event listener for announcement module");

    window.addEventListener('dataReady', (e) => {
        console.log("📢 announcement.js: dataReady received, initializing announcement system");
        if (!announcementListenerAttached) {
            initAnnouncementListener();
        }
        if (!announcementCheckInterval) {
            startAnnouncementChecker();
        }
        renderAnnouncement();
    });
}

function setupAnnouncementUiReadyListener() {
    if (announcementUiReadyListenerAdded) return;
    announcementUiReadyListenerAdded = true;
    console.log("📡 Setting up uiReady event listener for announcement module");

    window.addEventListener('uiReady', (e) => {
        const user = e.detail.currentUser;
        if (user && (user.role === 'admin' || user.role === 'guru' || user.role === 'developer')) {
            console.log("📢 announcement.js: uiReady received, checking permissions for floating button");
            const floatingBtn = document.getElementById('floatingAnnouncementBtn');
            if (floatingBtn) floatingBtn.classList.add('show');
        }
    });
}

// ======================= FUNGSI UPLOAD GAMBAR =======================

function previewAnnouncementImage(input) {
    const previewContainer = document.getElementById('annImagePreviewContainer');
    const previewImg = document.getElementById('annImagePreview');
    
    if (input.files && input.files[0]) {
        currentAnnouncementImageFile = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            if (previewImg) {
                previewImg.src = e.target.result;
                previewImg.style.display = 'block';
            }
            if (previewContainer) {
                previewContainer.style.display = 'block';
            }
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        currentAnnouncementImageFile = null;
        if (previewImg) {
            previewImg.src = '';
            previewImg.style.display = 'none';
        }
        if (previewContainer) {
            previewContainer.style.display = 'none';
        }
    }
}

function removeAnnouncementImage() {
    currentAnnouncementImageFile = null;
    const previewImg = document.getElementById('annImagePreview');
    const previewContainer = document.getElementById('annImagePreviewContainer');
    const fileInput = document.getElementById('annImageInput');
    
    if (previewImg) {
        previewImg.src = '';
        previewImg.style.display = 'none';
    }
    if (previewContainer) {
        previewContainer.style.display = 'none';
    }
    if (fileInput) {
        fileInput.value = '';
    }
    showToast("🗑️ Gambar dihapus", "info");
}

async function uploadAnnouncementImage(file) {
    if (!file) return null;
    
    if (!file.type.match('image.*')) {
        showToast("❌ Hanya file gambar yang diperbolehkan!", "error");
        return null;
    }
    
    if (file.size > 2 * 1024 * 1024) {
        showToast("❌ Ukuran gambar maksimal 2MB!", "error");
        return null;
    }
    
    showToast("📤 Mengunggah gambar pengumuman...", "info");
    
    try {
        if (typeof uploadWithFallback !== 'undefined') {
            const result = await uploadWithFallback(file, 'announcements');
            return result.url;
        } else {
            console.warn("uploadWithFallback not available, using ImgBB fallback");
            const formData = new FormData();
            formData.append('image', file);
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (!data.success) throw new Error("ImgBB upload failed");
            return data.data.image.url;
        }
    } catch (error) {
        console.error("Upload image error:", error);
        showToast("❌ Gagal upload gambar: " + error.message, "error");
        return null;
    }
}

function viewAnnouncementImage(imageUrl) {
    if (!imageUrl) return;
    
    let modalHtml = `
        <div id="modal-announcement-image" class="modal-overlay open">
            <div class="modal-box" style="max-width: 600px; text-align: center; background: #000;">
                <div class="modal-title">
                    <span>🖼️ Gambar Pengumuman</span>
                    <span onclick="closeModal('modal-announcement-image')">✖</span>
                </div>
                <div style="padding: 20px;">
                    <img src="${imageUrl}" 
                         style="max-width: 100%; max-height: 70vh; border-radius: 12px; object-fit: contain;"
                         onerror="this.src='https://placehold.co/400x300?text=Gambar+Gagal+Dimuat'">
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeModal('modal-announcement-image')">Tutup</button>
                    <a href="${imageUrl}" target="_blank" class="btn-primary" style="padding: 8px 16px; background: #00bcd4; color: white; text-decoration: none; border-radius: 8px;">🔗 Buka di Tab Baru</a>
                </div>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('modal-announcement-image');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ======================= RENDER PENGUMUMAN =======================

function renderAnnouncement() {
    console.log("📢 renderAnnouncement dipanggil");
    
    const container = document.getElementById('announcementContainer');
    const listContainer = document.getElementById('announcementList');
    
    if (!container || !listContainer) {
        console.log("Element tidak ditemukan");
        return;
    }
    
    db.ref('announcements/active').once('value', (snapshot) => {
        const data = snapshot.val();
        listContainer.innerHTML = '';
        
        if (!data) {
            container.style.display = 'none';
            updateAnnouncementBadge(0);
            return;
        }
        
        const now = new Date();
        const currentTime = formatTimeToString(now);
        const currentDate = formatDateToString(now);
        
        const announcements = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        
        const activeAnnouncements = announcements.filter(ann => {
            if (!ann.isActive) return false;
            if (ann.expiryDate && ann.expiryTime) {
                if (ann.expiryDate < currentDate) return false;
                if (ann.expiryDate === currentDate && ann.expiryTime <= currentTime) return false;
            } else if (ann.expiryDate) {
                if (ann.expiryDate < currentDate) return false;
            } else if (ann.expiryTime) {
                if (currentTime >= ann.expiryTime) return false;
            }
            return true;
        });
        
        updateAnnouncementBadge(activeAnnouncements.length);
        
        if (activeAnnouncements.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        container.style.animation = 'none';
        setTimeout(() => {
            container.style.animation = 'fadeIn 0.3s ease';
        }, 10);
        
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        activeAnnouncements.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));
        
        activeAnnouncements.forEach(ann => {
            const priorityClass = ann.priority === 'high' ? 'announcement-high' : 
                                 ann.priority === 'low' ? 'announcement-low' : 'announcement-normal';
            const timeLeft = getTimeLeft(ann);
            const createdInfo = ann.createdBy ? `👤 Dibuat oleh: ${escapeHtmlAnn(ann.createdBy)}` : '';
            const createdAtDate = ann.createdAt ? new Date(ann.createdAt).toLocaleString('id-ID') : '';
            
            // Tampilkan gambar jika ada
            let imageHtml = '';
            if (ann.imageUrl && ann.imageUrl !== 'null' && ann.imageUrl !== 'undefined') {
                imageHtml = `
                    <div class="announcement-image" style="margin-top: 10px;">
                        <img src="${ann.imageUrl}" 
                             style="max-width: 100%; max-height: 200px; border-radius: 12px; cursor: pointer; object-fit: cover;"
                             onclick="viewAnnouncementImage('${ann.imageUrl}')"
                             onerror="this.style.display='none'">
                    </div>
                `;
            }
            
            let actionButtons = '';
            if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'guru' || currentUser.role === 'developer')) {
                actionButtons = `
                    <span class="announcement-edit" onclick="editAnnouncement('${ann.id}')" title="Edit Pengumuman" style="cursor:pointer; margin-left:8px;">✏️</span>
                    <span class="announcement-delete" onclick="deleteAnnouncement('${ann.id}')" title="Hapus Pengumuman" style="cursor:pointer;">🗑️</span>
                `;
            }
            
            const isNew = ann.createdAt && (Date.now() - ann.createdAt < 5 * 60 * 1000);
            
            listContainer.innerHTML += `
                <div class="announcement-item ${priorityClass}" data-id="${ann.id}" data-expiry="${ann.expiryDate || ''} ${ann.expiryTime || ''}">
                    <div class="announcement-header">
                        <span class="announcement-title">
                            ${isNew ? '🆕 ' : '📢'} ${escapeHtmlAnn(ann.title)}
                            ${isNew ? '<span class="badge-new">BARU</span>' : ''}
                        </span>
                        <div class="announcement-badges">
                            ${ann.priority === 'high' ? '<span class="badge badge-high">⚠️ Penting</span>' : ''}
                            ${ann.priority === 'low' ? '<span class="badge badge-low">ℹ️ Informasi</span>' : ''}
                            ${timeLeft ? `<span class="badge badge-time">⏰ ${timeLeft}</span>` : ''}
                            ${actionButtons}
                        </div>
                    </div>
                    <div class="announcement-message">${escapeHtmlAnn(ann.message)}</div>
                    ${imageHtml}
                    <div class="announcement-footer">
                        <small>${createdInfo}</small>
                        <small>📅 ${createdAtDate || ''}</small>
                        <small>⏱️ Berakhir: ${formatExpiryDisplay(ann)}</small>
                    </div>
                </div>
            `;
        });
        
        startAnnouncementCountdownUpdater();
    });
}

function updateAnnouncementBadge(count) {
    const floatingBtn = document.getElementById('floatingAnnouncementBtn');
    if (floatingBtn) {
        const existingBadge = floatingBtn.querySelector('.announcement-badge-count');
        if (count > 0) {
            if (!existingBadge) {
                const badge = document.createElement('span');
                badge.className = 'announcement-badge-count';
                badge.textContent = count;
                badge.style.cssText = `
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    background: #f44336;
                    color: white;
                    border-radius: 50%;
                    width: 18px;
                    height: 18px;
                    font-size: 10px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                `;
                floatingBtn.style.position = 'relative';
                floatingBtn.appendChild(badge);
            } else {
                existingBadge.textContent = count;
            }
        } else if (existingBadge) {
            existingBadge.remove();
        }
    }
    
    if (count > 0 && lastAnnouncementCount !== count) {
        const originalTitle = document.title;
        if (!document.title.includes('📢')) {
            document.title = `📢 (${count}) ${originalTitle}`;
            setTimeout(() => {
                document.title = originalTitle;
            }, 5000);
        }
    }
    lastAnnouncementCount = count;
}

function startAnnouncementCountdownUpdater() {
    if (announcementCountdownInterval) clearInterval(announcementCountdownInterval);
    announcementCountdownInterval = setInterval(() => {
        const items = document.querySelectorAll('.announcement-item');
        items.forEach(item => {
            const timeBadge = item.querySelector('.badge-time');
            if (timeBadge && item.dataset.id) {
                db.ref(`announcements/active/${item.dataset.id}`).once('value', (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        const timeLeft = getTimeLeft(data);
                        if (timeLeft) {
                            timeBadge.innerHTML = `⏰ ${timeLeft}`;
                        } else if (timeBadge) {
                            timeBadge.remove();
                        }
                    }
                });
            }
        });
    }, 60000);
}

function formatTimeToString(date) {
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function formatDateToString(date) {
    return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
}

function getTimeLeft(announcement) {
    const now = new Date();
    let expiryDateTime = null;
    
    if (announcement.expiryDate && announcement.expiryTime) {
        expiryDateTime = new Date(`${announcement.expiryDate}T${announcement.expiryTime}:00`);
    } else if (announcement.expiryDate && !announcement.expiryTime) {
        expiryDateTime = new Date(`${announcement.expiryDate}T23:59:59`);
    } else if (announcement.expiryTime && !announcement.expiryDate) {
        const [hours, minutes] = announcement.expiryTime.split(':');
        expiryDateTime = new Date();
        expiryDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
        if (expiryDateTime < now) return null;
    } else {
        return null;
    }
    
    if (!expiryDateTime) return null;
    const diffMs = expiryDateTime - now;
    if (diffMs <= 0) return null;
    
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const diffSeconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (diffHours > 0) return `${diffHours} jam ${diffMinutes} menit`;
    else if (diffMinutes > 0) return `${diffMinutes} menit ${diffSeconds} detik`;
    else return `${diffSeconds} detik`;
}

function formatExpiryDisplay(announcement) {
    if (announcement.expiryDate && announcement.expiryTime) return `${formatIndonesianDate(announcement.expiryDate)} pukul ${announcement.expiryTime}`;
    if (announcement.expiryDate) return `${formatIndonesianDate(announcement.expiryDate)} (akhir hari)`;
    if (announcement.expiryTime) return `Hari ini pukul ${announcement.expiryTime}`;
    return 'Tidak terbatas';
}

function formatIndonesianDate(dateStr) {
    if (!dateStr) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${parts[2]} ${bulan[parseInt(parts[1]) - 1]} ${parts[0]}`;
}

function escapeHtmlAnn(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= CRUD =======================

function openAnnouncementModal() {
    const modal = document.getElementById('modal-announcement');
    if (!modal) return;
    
    document.getElementById('announcementId').value = '';
    document.getElementById('annTitle').value = '';
    document.getElementById('annMessage').value = '';
    document.getElementById('annPriority').value = 'normal';
    document.getElementById('annExpiryType').value = 'none';
    document.getElementById('annExpiryDate').value = '';
    document.getElementById('annExpiryTime').value = '';
    
    // Reset gambar
    currentAnnouncementImageFile = null;
    const previewImg = document.getElementById('annImagePreview');
    const previewContainer = document.getElementById('annImagePreviewContainer');
    const fileInput = document.getElementById('annImageInput');
    if (previewImg) previewImg.src = '';
    if (previewContainer) previewContainer.style.display = 'none';
    if (fileInput) fileInput.value = '';
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('annExpiryDate').value = formatDateToString(tomorrow);
    
    toggleExpiryInput();
    modal.classList.add('open');
    setTimeout(() => document.getElementById('annTitle')?.focus(), 100);
}

function editAnnouncement(announcementId) {
    const modal = document.getElementById('modal-announcement');
    if (!modal) return;
    showToast("📝 Memuat data pengumuman...", "info");
    db.ref(`announcements/active/${announcementId}`).once('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            document.getElementById('announcementId').value = announcementId;
            document.getElementById('annTitle').value = data.title || '';
            document.getElementById('annMessage').value = data.message || '';
            document.getElementById('annPriority').value = data.priority || 'normal';
            
            // Tampilkan preview gambar jika ada
            if (data.imageUrl && data.imageUrl !== 'null' && data.imageUrl !== 'undefined') {
                const previewImg = document.getElementById('annImagePreview');
                const previewContainer = document.getElementById('annImagePreviewContainer');
                if (previewImg) {
                    previewImg.src = data.imageUrl;
                    previewImg.style.display = 'block';
                }
                if (previewContainer) {
                    previewContainer.style.display = 'block';
                }
                currentAnnouncementImageFile = null;
            } else {
                const previewContainer = document.getElementById('annImagePreviewContainer');
                if (previewContainer) previewContainer.style.display = 'none';
                currentAnnouncementImageFile = null;
            }
            
            if (data.expiryDate && data.expiryTime) {
                document.getElementById('annExpiryType').value = 'both';
                document.getElementById('annExpiryDate').value = data.expiryDate;
                document.getElementById('annExpiryTime').value = data.expiryTime;
            } else if (data.expiryDate) {
                document.getElementById('annExpiryType').value = 'date';
                document.getElementById('annExpiryDate').value = data.expiryDate;
            } else if (data.expiryTime) {
                document.getElementById('annExpiryType').value = 'time';
                document.getElementById('annExpiryTime').value = data.expiryTime;
            } else {
                document.getElementById('annExpiryType').value = 'none';
            }
            toggleExpiryInput();
            modal.classList.add('open');
        } else {
            showToast("❌ Pengumuman tidak ditemukan!", "error");
        }
    });
}

function toggleExpiryInput() {
    const type = document.getElementById('annExpiryType').value;
    const dateGroup = document.getElementById('annExpiryDateGroup');
    const timeGroup = document.getElementById('annExpiryTimeGroup');
    
    if (type === 'date') {
        if (dateGroup) dateGroup.style.display = 'block';
        if (timeGroup) timeGroup.style.display = 'none';
    } else if (type === 'time') {
        if (dateGroup) dateGroup.style.display = 'none';
        if (timeGroup) timeGroup.style.display = 'block';
    } else if (type === 'both') {
        if (dateGroup) dateGroup.style.display = 'block';
        if (timeGroup) timeGroup.style.display = 'block';
    } else {
        if (dateGroup) dateGroup.style.display = 'none';
        if (timeGroup) timeGroup.style.display = 'none';
    }
}

// ======================= SAVE ANNOUNCEMENT (DENGAN GAMBAR & LOG) =======================
async function saveAnnouncement() {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    if (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer') {
        showToast("⛔ Hanya Admin, Guru, dan Developer yang dapat membuat pengumuman!", "error");
        return;
    }
    
    const announcementId = document.getElementById('announcementId').value;
    const title = document.getElementById('annTitle').value.trim();
    const message = document.getElementById('annMessage').value.trim();
    const priority = document.getElementById('annPriority').value;
    const expiryType = document.getElementById('annExpiryType').value;
    
    if (!title || !message) {
        showToast("⚠️ Judul dan isi pengumuman wajib diisi!", "error");
        document.getElementById('annTitle').focus();
        return;
    }
    
    let expiryDate = null, expiryTime = null;
    if (expiryType === 'date') {
        expiryDate = document.getElementById('annExpiryDate').value;
        if (!expiryDate) { showToast("📅 Pilih tanggal berakhir!", "error"); return; }
    } else if (expiryType === 'time') {
        expiryTime = document.getElementById('annExpiryTime').value;
        if (!expiryTime) { showToast("⏰ Pilih waktu berakhir!", "error"); return; }
    } else if (expiryType === 'both') {
        expiryDate = document.getElementById('annExpiryDate').value;
        expiryTime = document.getElementById('annExpiryTime').value;
        if (!expiryDate || !expiryTime) { showToast("📅⏰ Pilih tanggal dan waktu berakhir!", "error"); return; }
    }
    
    // Upload image if exists
    let imageUrl = null;
    if (currentAnnouncementImageFile) {
        imageUrl = await uploadAnnouncementImage(currentAnnouncementImageFile);
        if (!imageUrl && currentAnnouncementImageFile) {
            if (!confirm("⚠️ Gagal upload gambar. Lanjutkan tanpa gambar?")) {
                return;
            }
        }
    } else {
        const existingImageUrl = document.getElementById('annImagePreview')?.src;
        if (existingImageUrl && existingImageUrl !== '' && !existingImageUrl.includes('blob:') && !existingImageUrl.includes('null')) {
            imageUrl = existingImageUrl;
        }
    }
    
    const announcementData = {
        title, message, priority,
        createdBy: currentUser.nama || currentUser.email,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        isActive: true,
        updatedAt: firebase.database.ServerValue.TIMESTAMP
    };
    if (expiryDate) announcementData.expiryDate = expiryDate;
    if (expiryTime) announcementData.expiryTime = expiryTime;
    if (imageUrl) announcementData.imageUrl = imageUrl;
    
    const btn = document.querySelector('#modal-announcement .btn-save');
    if (btn) { btn.disabled = true; btn.innerHTML = '💾 Menyimpan...'; }
    
    let promise = announcementId ? 
        db.ref(`announcements/active/${announcementId}`).update(announcementData) :
        db.ref('announcements/active').push(announcementData);
    
    promise.then(() => {
        const action = announcementId ? 'update' : 'create';
        showToast(announcementId ? "✅ Pengumuman berhasil diupdate!" : "✅ Pengumuman berhasil dibuat!");
        closeModal('modal-announcement');
        showAnnouncementNotification(title, message);
        
        // Reset form
        currentAnnouncementImageFile = null;
        const fileInput = document.getElementById('annImageInput');
        if (fileInput) fileInput.value = '';
        const previewContainer = document.getElementById('annImagePreviewContainer');
        if (previewContainer) previewContainer.style.display = 'none';
        
        // LOG: Simpan pengumuman
        if (typeof logActivity === 'function') {
            const expiryInfo = expiryDate ? ` (Berakhir: ${expiryDate}${expiryTime ? ' ' + expiryTime : ''})` : '';
            const imageInfo = imageUrl ? ' dengan gambar' : '';
            logActivity(action === 'create' ? 'create_announcement' : 'update_announcement', 
                       `"${title}" - Prioritas: ${priority}${expiryInfo}${imageInfo}`);
        }
        
        setTimeout(() => {
            renderAnnouncement();
            if (typeof renderFullAnnouncementList === 'function') {
                renderFullAnnouncementList();
            }
        }, 100);
    }).catch(err => {
        console.error("Save announcement error:", err);
        showToast("❌ Gagal menyimpan: " + err.message, "error");
    }).finally(() => { 
        if (btn) { 
            btn.disabled = false; 
            btn.innerHTML = announcementId ? '💾 Update Pengumuman' : '📢 Simpan Pengumuman'; 
        } 
    });
}

function showAnnouncementNotification(title, message) {
    showToast(`📢 Pengumuman baru: ${title}`, "success");
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification('📢 Pengumuman Baru', {
            body: title,
            icon: 'https://ui-avatars.com/api/?name=📢&background=4a90e2&color=fff'
        });
    } else if (typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// ======================= DELETE ANNOUNCEMENT (DENGAN LOG & HAPUS GAMBAR) =======================
async function deleteAnnouncement(announcementId) {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer')) {
        showToast("⛔ Anda tidak memiliki akses!", "error");
        return;
    }
    
    db.ref(`announcements/active/${announcementId}`).once('value', async (snapshot) => {
        const ann = snapshot.val();
        const title = ann?.title || 'pengumuman ini';
        
        if (!confirm(`⚠️ Yakin ingin menghapus "${title}"?\n\nTindakan ini tidak dapat dibatalkan!`)) return;
        
        const btn = document.querySelector(`.announcement-item[data-id="${announcementId}"] .announcement-delete`);
        if (btn) btn.style.opacity = '0.5';
        
        // Hapus gambar dari Supabase jika ada
        if (ann && ann.imageUrl && typeof deleteFromSupabase === 'function') {
            try {
                await deleteFromSupabase(ann.imageUrl);
                console.log("🗑️ Gambar pengumuman dihapus dari storage");
            } catch (err) {
                console.warn("Gagal hapus gambar:", err);
            }
        }
        
        db.ref(`announcements/active/${announcementId}`).remove()
            .then(() => { 
                showToast(`✅ Pengumuman "${title}" berhasil dihapus`);
                
                // LOG: Hapus pengumuman
                if (typeof logActivity === 'function') {
                    logActivity('delete_announcement', `Menghapus pengumuman: "${title}"${ann?.imageUrl ? ' (dengan gambar)' : ''}`);
                }
                
                setTimeout(() => {
                    renderAnnouncement();
                    if (typeof renderFullAnnouncementList === 'function') {
                        renderFullAnnouncementList();
                    }
                }, 100);
            })
            .catch(err => {
                console.error("Delete error:", err);
                showToast("❌ Gagal menghapus: " + err.message, "error");
                if (btn) btn.style.opacity = '1';
            });
    });
}

// ======================= FULL ANNOUNCEMENT LIST (UNTUK TAB) =======================

function renderFullAnnouncementList() {
    const container = document.getElementById('fullAnnouncementList');
    if (!container) return;
    
    db.ref('announcements/active').once('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            container.innerHTML = '<div style="text-align:center; padding:40px;">📭 Belum ada pengumuman</div>';
            return;
        }
        
        const announcements = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        announcements.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        
        let html = '<div style="display:flex; flex-direction:column; gap:15px;">';
        announcements.forEach(ann => {
            const priorityClass = ann.priority === 'high' ? 'announcement-high' : (ann.priority === 'low' ? 'announcement-low' : 'announcement-normal');
            const createdDate = ann.createdAt ? new Date(ann.createdAt).toLocaleString('id-ID') : '-';
            let expiryInfo = '';
            if (ann.expiryDate) expiryInfo += `📅 Berakhir: ${formatIndonesianDate(ann.expiryDate)}`;
            if (ann.expiryTime) expiryInfo += ` ${ann.expiryTime}`;
            if (!expiryInfo) expiryInfo = '⏰ Tidak terbatas';
            
            let imageHtml = '';
            if (ann.imageUrl && ann.imageUrl !== 'null' && ann.imageUrl !== 'undefined') {
                imageHtml = `
                    <div style="margin-top: 10px;">
                        <img src="${ann.imageUrl}" 
                             style="max-width: 100%; max-height: 150px; border-radius: 12px; cursor: pointer; object-fit: cover;"
                             onclick="viewAnnouncementImage('${ann.imageUrl}')"
                             onerror="this.style.display='none'">
                    </div>
                `;
            }
            
            html += `
                <div class="announcement-item ${priorityClass}" style="padding:15px; border-radius:12px; background:var(--bg-hover);">
                    <div class="announcement-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:10px;">
                        <span class="announcement-title" style="font-weight:bold; font-size:1.1rem;">📢 ${escapeHtmlAnn(ann.title)}</span>
                        <div style="display:flex; gap:8px;">
                            <button class="btn-icon" onclick="editAnnouncement('${ann.id}')" title="Edit">✏️</button>
                            <button class="btn-icon delete" onclick="deleteAnnouncement('${ann.id}')" title="Hapus">🗑️</button>
                        </div>
                    </div>
                    <div class="announcement-message" style="margin-bottom:10px;">${escapeHtmlAnn(ann.message)}</div>
                    ${imageHtml}
                    <div class="announcement-footer" style="font-size:0.7rem; color:var(--text-muted); display:flex; gap:15px; flex-wrap:wrap; margin-top:10px;">
                        <span>👤 ${escapeHtmlAnn(ann.createdBy || 'Admin')}</span>
                        <span>📅 ${createdDate}</span>
                        <span>${expiryInfo}</span>
                        <span>${ann.priority === 'high' ? '🔴 Penting' : (ann.priority === 'low' ? '🔵 Rendah' : '🟢 Normal')}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    });
}

// ======================= EXPIRY CHECKER =======================

function checkExpiredAnnouncements() {
    console.log("⏰ Checking for expired announcements...");
    db.ref('announcements/active').once('value', async (snapshot) => {
        const data = snapshot.val();
        if (!data) return;
        const now = new Date();
        const currentTime = formatTimeToString(now);
        const currentDate = formatDateToString(now);
        let hasExpired = false;
        let expiredTitles = [];
        
        for (const [key, ann] of Object.entries(data)) {
            let isExpired = false;
            if (!ann.isActive) isExpired = true;
            else if (ann.expiryDate && ann.expiryTime) {
                if (ann.expiryDate < currentDate) isExpired = true;
                else if (ann.expiryDate === currentDate && ann.expiryTime <= currentTime) isExpired = true;
            } else if (ann.expiryDate) {
                if (ann.expiryDate < currentDate) isExpired = true;
            } else if (ann.expiryTime) {
                if (currentTime >= ann.expiryTime) isExpired = true;
            }
            
            if (isExpired) {
                expiredTitles.push(ann.title);
                // Hapus gambar dari storage
                if (ann.imageUrl && typeof deleteFromSupabase === 'function') {
                    try {
                        await deleteFromSupabase(ann.imageUrl);
                    } catch (err) {
                        console.warn("Gagal hapus gambar expired:", err);
                    }
                }
                await db.ref(`announcements/active/${key}`).remove();
                hasExpired = true;
            }
        }
        
        if (hasExpired) {
            console.log(`🗑️ Removed expired announcements: ${expiredTitles.join(', ')}`);
            setTimeout(() => renderAnnouncement(), 100);
            if (expiredTitles.length > 0) {
                showToast(`⏰ ${expiredTitles.length} pengumuman telah kadaluarsa dan dihapus`, "info");
            }
        }
    });
}

function startAnnouncementChecker() {
    if (announcementCheckInterval) clearInterval(announcementCheckInterval);
    announcementCheckInterval = setInterval(() => checkExpiredAnnouncements(), 30000);
    setTimeout(() => checkExpiredAnnouncements(), 1000);
}

// ======================= REAL-TIME LISTENER =======================

function initAnnouncementListener() {
    if (announcementListenerAttached) return;
    announcementListenerAttached = true;
    console.log("🔔 Setting up real-time announcement listener...");
    
    db.ref('announcements/active').on('value', (snapshot) => {
        const data = snapshot.val();
        const count = data ? Object.keys(data).length : 0;
        console.log(`📢 Announcements updated: ${count} active announcements`);
        renderAnnouncement();
        const container = document.getElementById('announcementContainer');
        if (container && container.style.display !== 'none') {
            container.style.transition = 'background-color 0.3s';
            container.style.backgroundColor = 'rgba(74, 144, 226, 0.1)';
            setTimeout(() => { container.style.backgroundColor = ''; }, 500);
        }
    });
    
    db.ref('announcements/active').on('child_added', (snapshot) => {
        const data = snapshot.val();
        console.log(`🆕 New announcement added: ${data.title}`);
        if (data.title && data.message) showAnnouncementNotification(data.title, data.message);
        setTimeout(() => {
            const container = document.getElementById('announcementContainer');
            if (container) container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 500);
    });
    
    db.ref('announcements/active').on('child_removed', (snapshot) => {
        const data = snapshot.val();
        console.log(`🗑️ Announcement removed: ${data?.title || 'unknown'}`);
        showToast(`📢 Pengumuman "${data?.title || ''}" telah dihapus`, "info");
    });
}

// ======================= FUNGSI TEST & DEBUG =======================

function createTestAnnouncement() {
    if (!currentUser) {
        showToast("Anda harus login terlebih dahulu!", "error");
        return;
    }
    if (currentUser.role !== 'admin' && currentUser.role !== 'guru' && currentUser.role !== 'developer') {
        showToast("⛔ Hanya admin, guru, dan developer yang bisa membuat test!", "error");
        return;
    }
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + 1);
    const expiryTimeStr = `${expiryDate.getHours().toString().padStart(2,'0')}:${expiryDate.getMinutes().toString().padStart(2,'0')}`;
    const testData = {
        title: "🧪 TEST PENGUMUMAN",
        message: "✅ Ini adalah pengumuman test. Jika Anda melihat ini, sistem pengumuman berfungsi dengan baik!",
        priority: "high",
        createdBy: currentUser.nama || currentUser.email,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        isActive: true,
        expiryTime: expiryTimeStr
    };
    console.log("Membuat test announcement:", testData);
    const btn = document.querySelector('[onclick="createTestAnnouncement()"]');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Membuat...'; }
    db.ref('announcements/active').push(testData)
        .then((result) => {
            console.log("Test announcement berhasil dibuat, key:", result.key);
            showToast("✅ Test pengumuman berhasil dibuat!");
            
            // LOG: Test announcement
            if (typeof logActivity === 'function') {
                logActivity('create_test_announcement', `Membuat test pengumuman: "🧪 TEST PENGUMUMAN"`);
            }
            
            setTimeout(() => renderAnnouncement(), 100);
        })
        .catch(err => {
            console.error("Gagal membuat test:", err);
            showToast("❌ Gagal: " + err.message, "error");
        })
        .finally(() => { if (btn) { btn.disabled = false; btn.textContent = '🧪 Test Pengumuman'; } });
}

function debugCheckAnnouncements() {
    console.log("=== 🔍 DEBUG PENGUMUMAN ===");
    console.log("Current user:", currentUser ? currentUser.nama : "Tidak ada user");
    console.log("Current time:", new Date().toLocaleString());
    db.ref('announcements/active').once('value', (snapshot) => {
        const data = snapshot.val();
        console.log("Data dari Firebase (announcements/active):", JSON.stringify(data, null, 2));
        if (!data) {
            console.log("❌ TIDAK ADA DATA! Node 'announcements/active' kosong.");
            showToast("❌ Tidak ada pengumuman di database", "error");
        } else {
            const count = Object.keys(data).length;
            console.log(`✅ Ada ${count} pengumuman di database.`);
            showToast(`📊 ${count} pengumuman aktif ditemukan`, "success");
        }
    });
}

// ======================= CLEANUP =======================

function cleanupAnnouncementSystem() {
    if (announcementCheckInterval) clearInterval(announcementCheckInterval);
    announcementCheckInterval = null;
    if (announcementCountdownInterval) clearInterval(announcementCountdownInterval);
    announcementCountdownInterval = null;
    if (announcementListenerAttached) {
        db.ref('announcements/active').off();
        announcementListenerAttached = false;
    }
    announcementDataReadyListenerAdded = false;
    announcementUiReadyListenerAdded = false;
    currentAnnouncementImageFile = null;
    console.log("🧹 Announcement system cleaned up");
}

// ======================= INISIALISASI =======================

setupAnnouncementDataReadyListener();
setupAnnouncementUiReadyListener();

if (typeof window !== 'undefined' && window.dbData && !announcementListenerAttached) {
    console.log("📢 announcement.js: Data already available, initializing immediately");
    setTimeout(() => {
        if (!announcementListenerAttached) {
            initAnnouncementListener();
            startAnnouncementChecker();
            renderAnnouncement();
        }
    }, 100);
}

// ======================= EKSPOR KE GLOBAL =======================
window.renderAnnouncement = renderAnnouncement;
window.openAnnouncementModal = openAnnouncementModal;
window.editAnnouncement = editAnnouncement;
window.saveAnnouncement = saveAnnouncement;
window.deleteAnnouncement = deleteAnnouncement;
window.createTestAnnouncement = createTestAnnouncement;
window.debugCheckAnnouncements = debugCheckAnnouncements;
window.cleanupAnnouncementSystem = cleanupAnnouncementSystem;
window.initAnnouncementSystem = initAnnouncementListener;
window.renderFullAnnouncementList = renderFullAnnouncementList;
window.viewAnnouncementImage = viewAnnouncementImage;
window.previewAnnouncementImage = previewAnnouncementImage;
window.removeAnnouncementImage = removeAnnouncementImage;

console.log("✅ announcement.js V4.0 loaded - Dengan upload gambar pengumuman & log aktivitas");