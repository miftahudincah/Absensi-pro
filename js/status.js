// status.js - VERSION 4.0 (FULL FEATURE: TEXT FIX + REPLY + VIEWERS LIST)
// Fitur Status: upload teks/gambar, auto-delete 24 jam, reply/balas status,
// daftar orang yang melihat (viewers), notifikasi.
// PERBAIKAN: Teks pada status gambar kini tampil sebagai caption.
// ============================================================================

let statusesListener = null;
let currentStatusList = [];
let currentStatusIndex = 0;
let currentStatusOwnerId = null;
let statusViewerInterval = null;
let statusExpiryInterval = null;
let statusUiReadyListenerAdded = false;
let lastStatusCount = 0;

// ======================= EVENT LISTENER ========================
function setupStatusUiReadyListener() {
    if (statusUiReadyListenerAdded) return;
    statusUiReadyListenerAdded = true;
    console.log("📡 Setting up uiReady event listener for status module");
    window.addEventListener('uiReady', (e) => {
        const user = e.detail.currentUser;
        if (user && user.uid) {
            console.log("📸 status.js: uiReady received, initializing status system");
            initStatusSystem();
        }
    });
}

// ======================= INISIALISASI ========================
function initStatusSystem() {
    if (!currentUser) {
        console.log("⏳ Menunggu currentUser untuk initStatusSystem");
        return;
    }
    if (statusesListener) {
        console.log("Status system already initialized, skipping");
        return;
    }
    console.log("📸 Initializing status system...");
    setupStatusListener();
    startStatusExpiryChecker();
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

// ======================= EVENT DELEGATION ========================
function setupStatusEventDelegation(retry = 0) {
    const container = document.getElementById('statusBar');
    if (!container) {
        if (retry < 20) {
            console.log(`⏳ Menunggu #statusBar, retry ${retry+1}/20...`);
            setTimeout(() => setupStatusEventDelegation(retry + 1), 300);
        } else {
            console.error("❌ Gagal menemukan #statusBar setelah 20 retry!");
        }
        return;
    }
    container.removeEventListener('click', handleStatusClick);
    container.addEventListener('click', handleStatusClick);
    console.log("✅ Status event delegation attached to #statusBar");
}

function handleStatusClick(e) {
    let target = e.target;
    while (target && !target.classList?.contains('status-item')) {
        target = target.parentElement;
        if (!target || target === document.body) return;
    }
    if (!target) return;
    const userId = target.getAttribute('data-user-id');
    if (!userId) return;
    e.stopPropagation();
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    openStatusViewer(userId);
}

// ======================= LISTENER STATUS ========================
function setupStatusListener() {
    if (statusesListener) {
        db.ref('statuses').off('value', statusesListener);
    }
    statusesListener = db.ref('statuses').on('value', (snapshot) => {
        if (!currentUser) return;
        const data = snapshot.val();
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        let allStatuses = [];
        if (data) {
            Object.keys(data).forEach(userId => {
                const userStatuses = data[userId];
                if (userStatuses) {
                    Object.keys(userStatuses).forEach(statusId => {
                        const status = userStatuses[statusId];
                        if (status.createdAt && (now - status.createdAt) < twentyFourHours) {
                            allStatuses.push({
                                id: statusId,
                                userId: userId,
                                ...status
                            });
                        } else if (status.createdAt && (now - status.createdAt) >= twentyFourHours) {
                            // Hapus gambar dari Supabase jika ada
                            if (status.mediaUrl && status.mediaUrl.includes(SUPABASE_URL)) {
                                if (typeof deleteFromSupabase === 'function') {
                                    deleteFromSupabase(status.mediaUrl).catch(console.error);
                                }
                            }
                            // Hapus juga replies jika ada
                            db.ref(`status_replies/${statusId}`).remove().catch(console.error);
                            db.ref(`statuses/${userId}/${statusId}`).remove();
                        }
                    });
                }
            });
        }
        allStatuses.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const groupedByUser = {};
        allStatuses.forEach(status => {
            if (!groupedByUser[status.userId]) groupedByUser[status.userId] = [];
            groupedByUser[status.userId].push(status);
        });
        renderStatusBar(groupedByUser);
        currentStatusList = allStatuses;
        checkAndNotifyNewStatus(allStatuses);
    });
}

// ======================= RENDER STATUS BAR ========================
function renderStatusBar(groupedByUser) {
    const container = document.getElementById('statusBar');
    if (!container) {
        console.warn("renderStatusBar: #statusBar tidak ditemukan");
        return;
    }
    if (!groupedByUser || Object.keys(groupedByUser).length === 0) {
        container.innerHTML = '<div class="status-empty text-small" style="text-align:center; padding:10px;">📭 Belum ada status. Buat status pertama!</div>';
        setupStatusEventDelegation();
        return;
    }
    let html = '';
    // Status Saya
    if (groupedByUser[currentUser.uid]) {
        const myStatuses = groupedByUser[currentUser.uid];
        const latest = myStatuses[0];
        html += `
            <div class="status-item" data-user-id="${currentUser.uid}">
                <div class="status-avatar">
                    <img src="${latest.userPhoto || getAvatarUrl(latest.userName)}" alt="${escapeHtml(latest.userName)}">
                    <div class="status-add-icon">+</div>
                </div>
                <div class="status-name">Status Saya</div>
                <div class="status-time">${formatTimeAgo(latest.createdAt)}</div>
            </div>
        `;
    } else {
        html += `
            <div class="status-item" data-user-id="${currentUser.uid}">
                <div class="status-avatar">
                    <img src="${currentUser.photoUrl || getAvatarUrl(currentUser.nama)}" alt="${escapeHtml(currentUser.nama)}">
                    <div class="status-add-icon">+</div>
                </div>
                <div class="status-name">Status Saya</div>
                <div class="status-time">Tambah</div>
            </div>
        `;
    }
    // Status teman
    for (const [userId, statuses] of Object.entries(groupedByUser)) {
        if (userId === currentUser.uid) continue;
        const latest = statuses[0];
        const isViewed = latest.viewedBy && latest.viewedBy[currentUser.uid];
        html += `
            <div class="status-item ${!isViewed ? 'unviewed' : ''}" data-user-id="${userId}">
                <div class="status-avatar">
                    <img src="${latest.userPhoto || getAvatarUrl(latest.userName)}" alt="${escapeHtml(latest.userName)}">
                    ${!isViewed ? '<div class="status-ring"></div>' : ''}
                </div>
                <div class="status-name">${escapeHtml(latest.userName)}</div>
                <div class="status-time">${formatTimeAgo(latest.createdAt)}</div>
            </div>
        `;
    }
    container.innerHTML = html;
    setupStatusEventDelegation();
}

// ======================= NOTIFIKASI ========================
function checkAndNotifyNewStatus(statuses) {
    const currentCount = statuses.length;
    if (currentCount > lastStatusCount && lastStatusCount > 0 && currentUser) {
        const newStatuses = statuses.slice(0, currentCount - lastStatusCount);
        newStatuses.forEach(status => {
            if (status.userId !== currentUser.uid) {
                showToast(`📸 ${status.userName || 'Seseorang'} membagikan status baru`, "info");
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    new Notification('Status Baru', {
                        body: status.userName ? `${status.userName} membagikan status` : 'Status baru dari teman',
                        icon: status.userPhoto || 'https://ui-avatars.com/api/?name=📸&background=00bcd4&color=fff'
                    });
                }
            }
        });
    }
    lastStatusCount = currentCount;
}

function startStatusExpiryChecker() {
    if (statusExpiryInterval) clearInterval(statusExpiryInterval);
    statusExpiryInterval = setInterval(() => {
        if (db) db.ref('statuses').once('value').catch(() => {});
    }, 60 * 60 * 1000);
}

// ======================= CREATE STATUS ========================
function openCreateStatusModal() {
    const modal = document.getElementById('modal-create-status');
    if (!modal) return;
    document.getElementById('statusText').value = '';
    document.getElementById('statusImageInput').value = '';
    document.getElementById('statusImagePreviewContainer').style.display = 'none';
    modal.classList.add('open');
}

function previewStatusImage(input) {
    const previewContainer = document.getElementById('statusImagePreviewContainer');
    const previewImg = document.getElementById('statusImagePreview');
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImg.src = e.target.result;
            previewContainer.style.display = 'block';
        };
        reader.readAsDataURL(input.files[0]);
    } else {
        previewContainer.style.display = 'none';
    }
}

async function createStatus() {
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    const text = document.getElementById('statusText').value.trim();
    const imageFile = document.getElementById('statusImageInput').files[0];
    if (!text && !imageFile) {
        showToast("Masukkan teks atau pilih gambar!", "error");
        return;
    }
    const btn = document.querySelector('#modal-create-status .btn-save');
    const originalText = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Mengupload...'; }
    
    let mediaUrl = null;
    let mediaPath = null;
    let type = 'text';
    
    try {
        if (imageFile) {
            if (imageFile.size > 5 * 1024 * 1024) {
                showToast("Ukuran gambar maksimal 5MB!", "error");
                if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
                return;
            }
            if (typeof uploadStatusImageToSupabase === 'undefined') {
                throw new Error('Fungsi uploadStatusImageToSupabase tidak tersedia');
            }
            const uploadResult = await uploadStatusImageToSupabase(imageFile, currentUser.uid);
            mediaUrl = uploadResult.url;
            mediaPath = uploadResult.path;
            type = 'image';
        }
        
        const statusId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const statusData = {
            text: text || (type === 'image' ? '📸 ' : ''),
            mediaUrl: mediaUrl,
            mediaPath: mediaPath,
            type: type,
            userName: currentUser.nama,
            userPhoto: currentUser.photoUrl || null,
            userId: currentUser.uid,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            viewedBy: {}
        };
        
        await db.ref(`statuses/${currentUser.uid}/${statusId}`).set(statusData);
        showToast("✅ Status berhasil diposting!", "success");
        closeModal('modal-create-status');
        
    } catch (err) {
        console.error("Create status error:", err);
        showToast("❌ Gagal posting status: " + err.message, "error");
        if (mediaPath && typeof deleteFromSupabase === 'function') {
            await deleteFromSupabase(mediaPath);
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalText; }
    }
}

// ======================= STATUS VIEWER (DENGAN REPLY & VIEWERS) ========================
async function openStatusViewer(userId) {
    console.log("📸 openStatusViewer called for userId:", userId);
    if (!currentUser) {
        showToast("Anda harus login!", "error");
        return;
    }
    const modal = document.getElementById('modal-status-viewer');
    if (!modal) {
        console.error("Modal status viewer tidak ditemukan!");
        showToast("Gagal membuka status: elemen tidak ditemukan", "error");
        return;
    }
    try {
        const snapshot = await db.ref(`statuses/${userId}`).once('value');
        const statuses = snapshot.val();
        if (!statuses) {
            showToast("Tidak ada status dari pengguna ini", "info");
            return;
        }
        const now = Date.now();
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const userStatuses = Object.keys(statuses)
            .filter(key => (now - (statuses[key].createdAt || 0)) < twentyFourHours)
            .map(key => ({ id: key, ...statuses[key] }))
            .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        if (userStatuses.length === 0) {
            showToast("Status sudah kadaluarsa", "info");
            return;
        }
        // Tandai sudah dilihat
        if (userId !== currentUser.uid) {
            for (const status of userStatuses) {
                if (!status.viewedBy || !status.viewedBy[currentUser.uid]) {
                    await db.ref(`statuses/${userId}/${status.id}/viewedBy/${currentUser.uid}`).set(true);
                }
            }
        }
        currentStatusList = userStatuses;
        currentStatusIndex = 0;
        currentStatusOwnerId = userId;
        showStatusViewerModal(currentStatusList[currentStatusIndex]);
    } catch (err) {
        console.error("Error opening status viewer:", err);
        showToast("Gagal memuat status: " + err.message, "error");
    }
}

function showStatusViewerModal(status) {
    const modal = document.getElementById('modal-status-viewer');
    if (!modal) return;
    const content = document.getElementById('statusViewerContent');
    if (!content) return;
    if (statusViewerInterval) clearInterval(statusViewerInterval);
    
    const isOwner = (currentStatusOwnerId === currentUser.uid);
    
    const updateContent = () => {
        const s = currentStatusList[currentStatusIndex];
        if (!s) { closeModal('modal-status-viewer'); return; }
        
        let mediaHtml = '';
        if (s.type === 'image' && s.mediaUrl) {
            mediaHtml = `<div class="status-image-wrapper" onclick="nextStatus()">
                            <img src="${s.mediaUrl}" class="status-full-image" alt="Status">
                         </div>`;
        } else {
            mediaHtml = `<div class="status-text-wrapper" onclick="nextStatus()">
                            <div class="status-full-text">${escapeHtml(s.text)}</div>
                         </div>`;
        }
        
        // Tombol untuk owner: hapus, lihat viewers, dan lihat balasan
        let ownerButtons = '';
        if (isOwner) {
            ownerButtons = `
                <div class="status-owner-buttons" style="position: absolute; top: 12px; left: 12px; z-index: 9999; display: flex; gap: 8px;">
                    <button class="status-delete-btn" onclick="deleteCurrentStatus(event)" title="Hapus status ini">🗑️</button>
                    <button class="status-viewers-btn" onclick="showStatusViewers(event, '${s.id}')" title="Dilihat oleh">👁️</button>
                    <button class="status-replies-btn" onclick="showStatusRepliesModal('${s.id}')" title="Balasan">💬</button>
                </div>
            `;
        } else {
            // Tombol untuk pengunjung: reply dan lihat viewers (jika ada)
            ownerButtons = `
                <div class="status-visitor-buttons" style="position: absolute; bottom: 20px; right: 20px; z-index: 9999; display: flex; gap: 8px;">
                    <button class="status-reply-btn" onclick="openReplyToStatus('${s.id}', '${escapeHtml(s.userName)}')" title="Balas status">💬 Balas</button>
                </div>
            `;
        }
        
        // Tampilkan caption untuk status gambar (perbaikan BUG)
        let captionHtml = '';
        if (s.text && s.type === 'image') {
            captionHtml = `<div class="status-image-caption">${escapeHtml(s.text)}</div>`;
        } else if (s.text && s.type === 'text') {
            // Teks sudah di dalam mediaHtml, tidak perlu caption tambahan
        }
        
        content.innerHTML = `
            <div class="status-viewer-content">
                <div class="status-viewer-header">
                    <div class="status-viewer-user">
                        <img src="${s.userPhoto || getAvatarUrl(s.userName)}" alt="${escapeHtml(s.userName)}">
                        <div class="status-user-info">
                            <strong>${escapeHtml(s.userName)}</strong>
                            <span>${formatTimeAgo(s.createdAt)}</span>
                        </div>
                    </div>
                </div>
                ${ownerButtons}
                ${mediaHtml}
                ${captionHtml}
                <div class="status-nav-buttons">
                    <button class="status-nav-prev" ${currentStatusIndex === 0 ? 'disabled' : ''} onclick="prevStatus()">◀</button>
                    <span class="status-counter">${currentStatusIndex+1} / ${currentStatusList.length}</span>
                    <button class="status-nav-next" ${currentStatusIndex === currentStatusList.length-1 ? 'disabled' : ''} onclick="nextStatus()">▶</button>
                </div>
            </div>
        `;
    };
    
    updateContent();
    modal.classList.add('open');
    statusViewerInterval = setInterval(() => {
        if (currentStatusIndex < currentStatusList.length - 1) nextStatus();
        else { clearInterval(statusViewerInterval); closeModal('modal-status-viewer'); }
    }, 5000);
}

// ======================= LIHAT VIEWERS (SIAPA YANG MELIHAT) ========================
async function showStatusViewers(event, statusId) {
    if (event) event.stopPropagation();
    const currentStatus = currentStatusList[currentStatusIndex];
    if (!currentStatus) return;
    
    const viewers = currentStatus.viewedBy || {};
    const viewerUids = Object.keys(viewers);
    
    if (viewerUids.length === 0) {
        showToast("Belum ada yang melihat status ini", "info");
        return;
    }
    
    // Ambil detail user dari users_auth
    const viewersData = [];
    for (const uid of viewerUids) {
        const snap = await db.ref(`users_auth/${uid}`).once('value');
        if (snap.exists()) {
            const user = snap.val();
            viewersData.push({
                uid: uid,
                nama: user.nama,
                photoUrl: user.photoUrl,
                role: user.role
            });
        }
    }
    
    // Buat modal untuk menampilkan daftar viewers
    let modalHtml = `
        <div id="modal-status-viewers" class="modal-overlay open">
            <div class="modal-box" style="max-width: 400px;">
                <div class="modal-title">
                    <span>👁️ Dilihat oleh (${viewersData.length})</span>
                    <span onclick="closeModal('modal-status-viewers')">✖</span>
                </div>
                <div style="max-height: 60vh; overflow-y: auto; padding: 10px;">
    `;
    
    viewersData.forEach(v => {
        modalHtml += `
            <div style="display: flex; align-items: center; gap: 12px; padding: 10px; border-bottom: 1px solid var(--border);">
                <img src="${v.photoUrl || getAvatarUrl(v.nama)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                <div>
                    <div style="font-weight: bold;">${escapeHtml(v.nama)}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${v.role === 'siswa' ? '👨‍🎓 Siswa' : (v.role === 'guru' ? '👨‍🏫 Guru' : '👑 Admin')}</div>
                </div>
            </div>
        `;
    });
    
    modalHtml += `
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeModal('modal-status-viewers')">Tutup</button>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('modal-status-viewers');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ======================= FITUR BALAS STATUS (REPLY) ========================
function openReplyToStatus(statusId, ownerName) {
    // Tampilkan modal untuk menulis balasan
    let modalHtml = `
        <div id="modal-reply-status" class="modal-overlay open">
            <div class="modal-box" style="max-width: 450px;">
                <div class="modal-title">
                    <span>💬 Balas status ${escapeHtml(ownerName)}</span>
                    <span onclick="closeModal('modal-reply-status')">✖</span>
                </div>
                <div class="form-group">
                    <textarea id="replyMessage" rows="3" placeholder="Tulis balasan Anda..." style="width: 100%;"></textarea>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeModal('modal-reply-status')">Batal</button>
                    <button class="btn-save" onclick="sendStatusReply('${statusId}')">Kirim Balasan</button>
                </div>
            </div>
        </div>
    `;
    const existingModal = document.getElementById('modal-reply-status');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function sendStatusReply(statusId) {
    const message = document.getElementById('replyMessage')?.value.trim();
    if (!message) {
        showToast("Balasan tidak boleh kosong!", "error");
        return;
    }
    
    const btn = document.querySelector('#modal-reply-status .btn-save');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Mengirim...';
    }
    
    try {
        const replyId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const replyData = {
            fromUid: currentUser.uid,
            fromName: currentUser.nama,
            fromPhoto: currentUser.photoUrl || null,
            message: message,
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            statusId: statusId
        };
        
        await db.ref(`status_replies/${statusId}/${replyId}`).set(replyData);
        
        // Kirim notifikasi ke pemilik status
        const statusSnapshot = await db.ref(`statuses/${currentStatusOwnerId}`).once('value');
        const statuses = statusSnapshot.val();
        let ownerUid = null;
        for (const [sid, sdata] of Object.entries(statuses)) {
            if (sid === statusId) {
                ownerUid = sdata.userId;
                break;
            }
        }
        if (ownerUid && ownerUid !== currentUser.uid) {
            await db.ref(`notifications/${ownerUid}/${replyId}`).set({
                type: 'status_reply',
                fromUid: currentUser.uid,
                fromName: currentUser.nama,
                statusId: statusId,
                message: message.substring(0, 50),
                timestamp: firebase.database.ServerValue.TIMESTAMP,
                read: false
            });
        }
        
        showToast("✅ Balasan terkirim!", "success");
        closeModal('modal-reply-status');
    } catch (err) {
        console.error("Send reply error:", err);
        showToast("❌ Gagal mengirim balasan: " + err.message, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "Kirim Balasan";
        }
    }
}

// ======================= LIHAT BALASAN STATUS (UNTUK OWNER) ========================
async function showStatusRepliesModal(statusId) {
    const snapshot = await db.ref(`status_replies/${statusId}`).once('value');
    const replies = snapshot.val();
    const repliesList = replies ? Object.values(replies).sort((a,b) => (a.timestamp||0) - (b.timestamp||0)) : [];
    
    let modalHtml = `
        <div id="modal-status-replies" class="modal-overlay open">
            <div class="modal-box" style="max-width: 500px;">
                <div class="modal-title">
                    <span>💬 Balasan Status</span>
                    <span onclick="closeModal('modal-status-replies')">✖</span>
                </div>
                <div style="max-height: 60vh; overflow-y: auto; padding: 10px;">
    `;
    
    if (repliesList.length === 0) {
        modalHtml += `<div class="text-small" style="text-align:center; padding:20px;">📭 Belum ada balasan</div>`;
    } else {
        repliesList.forEach(reply => {
            modalHtml += `
                <div style="display: flex; gap: 12px; margin-bottom: 15px; padding: 10px; background: var(--bg-hover); border-radius: 12px;">
                    <img src="${reply.fromPhoto || getAvatarUrl(reply.fromName)}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    <div style="flex:1;">
                        <div style="font-weight: bold;">${escapeHtml(reply.fromName)}</div>
                        <div style="font-size: 0.85rem;">${escapeHtml(reply.message)}</div>
                        <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 4px;">${formatTimeAgo(reply.timestamp)}</div>
                    </div>
                </div>
            `;
        });
    }
    
    modalHtml += `
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="closeModal('modal-status-replies')">Tutup</button>
                </div>
            </div>
        </div>
    `;
    
    const existingModal = document.getElementById('modal-status-replies');
    if (existingModal) existingModal.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ======================= DELETE STATUS ========================
async function deleteCurrentStatus(event) {
    if (event) event.stopPropagation();
    if (!currentUser) return;
    const currentStatus = currentStatusList[currentStatusIndex];
    if (!currentStatus) return;
    if (currentStatus.userId !== currentUser.uid) {
        showToast("Anda hanya dapat menghapus status Anda sendiri!", "error");
        return;
    }
    if (!confirm("Hapus status ini?")) return;
    
    const deleteBtn = document.querySelector('.status-delete-btn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '⏳';
    }
    
    try {
        if (currentStatus.mediaUrl && currentStatus.mediaUrl.includes(SUPABASE_URL)) {
            if (typeof deleteStatusImage === 'function') {
                await deleteStatusImage(currentStatus.mediaUrl);
            } else if (typeof deleteFromSupabase === 'function') {
                await deleteFromSupabase(currentStatus.mediaUrl);
            }
        }
        // Hapus juga semua balasan
        await db.ref(`status_replies/${currentStatus.id}`).remove();
        await db.ref(`statuses/${currentUser.uid}/${currentStatus.id}`).remove();
        showToast("✅ Status dihapus", "success");
        
        currentStatusList.splice(currentStatusIndex, 1);
        if (currentStatusList.length === 0) {
            closeModal('modal-status-viewer');
            if (statusesListener) {
                db.ref('statuses').once('value');
            }
        } else {
            if (currentStatusIndex >= currentStatusList.length) currentStatusIndex = currentStatusList.length - 1;
            if (currentStatusIndex < 0) currentStatusIndex = 0;
            showStatusViewerModal(currentStatusList[currentStatusIndex]);
        }
    } catch (err) {
        console.error("Delete status error:", err);
        showToast("❌ Gagal menghapus status: " + err.message, "error");
    } finally {
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.innerHTML = '🗑️';
        }
    }
}

function nextStatus() {
    if (currentStatusIndex < currentStatusList.length - 1) {
        currentStatusIndex++;
        showStatusViewerModal(currentStatusList[currentStatusIndex]);
    } else closeModal('modal-status-viewer');
}

function prevStatus() {
    if (currentStatusIndex > 0) {
        currentStatusIndex--;
        showStatusViewerModal(currentStatusList[currentStatusIndex]);
    }
}

// ======================= UTILITY ========================
function getAvatarUrl(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=00bcd4&color=fff&size=100`;
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (days > 0) return `${days} h`;
    if (hours > 0) return `${hours} jam`;
    if (minutes > 0) return `${minutes} m`;
    return 'Baru saja';
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

// ======================= CLEANUP ========================
function cleanupStatusSystem() {
    if (statusesListener) {
        db.ref('statuses').off('value', statusesListener);
        statusesListener = null;
    }
    if (statusExpiryInterval) {
        clearInterval(statusExpiryInterval);
        statusExpiryInterval = null;
    }
    if (statusViewerInterval) {
        clearInterval(statusViewerInterval);
        statusViewerInterval = null;
    }
    const container = document.getElementById('statusBar');
    if (container) container.removeEventListener('click', handleStatusClick);
    lastStatusCount = 0;
    statusUiReadyListenerAdded = false;
    console.log("🧹 Status system cleaned up");
}

// ======================= INISIALISASI ========================
setupStatusUiReadyListener();

if (typeof window !== 'undefined' && window.currentUser && window.currentUser.uid && !statusesListener) {
    console.log("📸 status.js: currentUser already exists, initializing immediately");
    setTimeout(() => initStatusSystem(), 100);
}

// ======================= EKSPOR ========================
window.initStatusSystem = initStatusSystem;
window.openCreateStatusModal = openCreateStatusModal;
window.previewStatusImage = previewStatusImage;
window.createStatus = createStatus;
window.openStatusViewer = openStatusViewer;
window.nextStatus = nextStatus;
window.prevStatus = prevStatus;
window.deleteCurrentStatus = deleteCurrentStatus;
window.showStatusViewers = showStatusViewers;
window.openReplyToStatus = openReplyToStatus;
window.sendStatusReply = sendStatusReply;
window.showStatusRepliesModal = showStatusRepliesModal;
window.cleanupStatusSystem = cleanupStatusSystem;

console.log("✅ status.js V4.0 loaded - Text caption fixed + Reply & Viewers features");