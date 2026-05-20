// chat.js - VERSION 4.4 (DENGAN LOG AKTIVITAS)
// Fitur Chat Pribadi antar teman
// Mendukung: kirim pesan, gambar (upload ke Supabase), hapus pesan, real-time, notifikasi
// PERUBAHAN V4.4: Menambahkan logActivity untuk deleteChatMessage dan clearChat
// ============================================================================

let chatListeners = {};
let currentChatWith = null;
let chatMessagesListener = null;
let unreadCounts = {};
let chatInitialized = false;
let chatUiReadyListenerAdded = false;

// ======================= EVENT LISTENER ========================

function setupChatUiReadyListener() {
    if (chatUiReadyListenerAdded) return;
    chatUiReadyListenerAdded = true;
    console.log("📡 Setting up uiReady event listener for chat module");

    window.addEventListener('uiReady', (e) => {
        const user = e.detail.currentUser;
        if (user && user.uid && !chatInitialized) {
            console.log("💬 chat.js: uiReady received, initializing chat system");
            initChatSystem();
        } else if (user && user.uid && chatInitialized) {
            console.log("💬 chat.js: uiReady received but chat already initialized");
        }
    });
}

// ======================= INISIALISASI =======================

function initChatSystem() {
    console.log("💬 Initializing chat system...", "currentUser:", currentUser?.uid);
    
    if (!currentUser || !currentUser.uid) {
        console.log("No user logged in, skipping chat init");
        return;
    }
    
    if (chatInitialized) {
        console.log("Chat already initialized");
        return;
    }
    
    cleanupChatSystem();
    setupIncomingMessagesListener();
    setupChatNotifications();
    
    chatInitialized = true;
    console.log("✅ Chat system initialized");
}

function setupIncomingMessagesListener() {
    if (chatListeners.incoming) {
        db.ref(`chats/${currentUser.uid}/inbox`).off('value', chatListeners.incoming);
    }
    
    chatListeners.incoming = db.ref(`chats/${currentUser.uid}/inbox`).on('value', (snapshot) => {
        if (!currentUser) return;
        const data = snapshot.val();
        if (data) {
            updateUnreadBadge(data);
            renderChatListIfContainerReady();
            if (currentChatWith) {
                loadChatMessages(currentChatWith);
            }
            playChatNotification();
        }
    });
}

function renderChatListIfContainerReady() {
    let container = document.getElementById('chatList');
    if (container && container.parentElement && container.parentElement.closest('#tab-chat')?.classList.contains('active')) {
        loadChatList();
    }
    let modalContainer = document.querySelector('#chatModalPanel #chatList');
    if (modalContainer && document.getElementById('modal-chat')?.classList.contains('open')) {
        loadChatList();
    }
}

function setupChatNotifications() {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function updateUnreadBadge(inboxData) {
    let totalUnread = 0;
    const unreadByUser = {};
    
    if (inboxData) {
        for (const [fromUid, data] of Object.entries(inboxData)) {
            if (data.unreadCount && data.unreadCount > 0) {
                totalUnread += data.unreadCount;
                unreadByUser[fromUid] = data.unreadCount;
            }
        }
    }
    
    unreadCounts = unreadByUser;
    
    const chatTabBtn = document.querySelector('.tab-btn[onclick*="chat"]');
    if (chatTabBtn) {
        let badge = chatTabBtn.querySelector('.chat-badge');
        if (totalUnread > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-badge';
                badge.style.cssText = 'background:#f44336; color:white; border-radius:50%; padding:2px 6px; font-size:10px; margin-left:5px;';
                chatTabBtn.appendChild(badge);
            }
            badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        } else if (badge) {
            badge.remove();
        }
    }
    
    const floatingChatBtn = document.getElementById('floatingChatBtn');
    if (floatingChatBtn) {
        let badge = floatingChatBtn.querySelector('.chat-badge-count');
        if (totalUnread > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'chat-badge-count';
                badge.style.cssText = 'position:absolute; top:-5px; right:-5px; background:#f44336; color:white; border-radius:50%; width:18px; height:18px; font-size:10px; display:flex; align-items:center; justify-content:center;';
                floatingChatBtn.style.position = 'relative';
                floatingChatBtn.appendChild(badge);
            }
            badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
        } else if (badge) {
            badge.remove();
        }
    }
}

function playChatNotification() {
    if (document.hidden) {
        try {
            const beep = new Audio('data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==');
            beep.volume = 0.3;
            beep.play().catch(() => {});
        } catch(e) {}
    }
}

// ======================= RENDER CHAT INTERFACE =======================

function renderChatInterface(containerId = 'chatPanel') {
    console.log("🎨 renderChatInterface called for:", containerId);
    
    let container = document.getElementById(containerId);
    if (!container) {
        if (containerId === 'chatPanel') {
            container = document.getElementById('chatModalPanel');
            if (container) console.log("Found chatModalPanel as alternative");
        }
    }
    if (!container) {
        console.error("No chat container found!");
        return false;
    }
    
    if (container.querySelector('.chat-container')) {
        console.log("Chat already rendered, skipping");
        return true;
    }
    
    container.innerHTML = `
        <div class="chat-container" style="display: flex; height: 100%; background: var(--bg-card); border-radius: 20px; overflow: hidden;">
            <div class="chat-sidebar" style="width: 300px; border-right: 1px solid var(--border); background: var(--bg-sidebar); display: flex; flex-direction: column;">
                <div class="chat-search" style="padding: 12px; border-bottom: 1px solid var(--border);">
                    <input type="text" id="chatSearchInput" placeholder="🔍 Cari chat..." style="width: 100%; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 30px; color: var(--text-primary);">
                </div>
                <div id="chatList" class="chat-list" style="flex: 1; overflow-y: auto;">
                    <p class="text-small" style="color: var(--text-muted); text-align:center; padding:20px;">Memuat chat...</p>
                </div>
            </div>
            <div class="chat-main" style="flex: 1; display: flex; flex-direction: column;">
                <div class="chat-header" id="chatHeader" style="padding: 12px 16px; border-bottom: 1px solid var(--border); background: var(--bg-sidebar);">
                    <p class="text-small" style="color: var(--text-muted); text-align:center; padding:20px;">Pilih chat untuk memulai percakapan</p>
                </div>
                <div class="chat-messages" id="chatMessages" style="flex: 1; overflow-y: auto; padding: 16px;">
                    <div class="chat-messages-empty" style="text-align:center; color:var(--text-muted); padding:40px;">👈 Pilih chat di sebelah kiri</div>
                </div>
                <div class="chat-input-area" id="chatInputArea" style="display: none; gap: 10px; padding: 12px; border-top: 1px solid var(--border); background: var(--bg-sidebar);">
                    <div class="chat-input-tools">
                        <label class="btn-icon" style="cursor:pointer; background:transparent; padding:8px;" title="Kirim Gambar">
                            📷 <input type="file" id="chatImageInput" accept="image/*" style="display:none;" onchange="sendChatMedia(this)">
                        </label>
                    </div>
                    <textarea id="chatMessageInput" placeholder="Tulis pesan... (Enter untuk kirim)" rows="1" style="flex: 1; resize: none; padding: 10px 14px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 28px; color: var(--text-primary); font-family: inherit;"></textarea>
                    <button class="btn-action btn-primary" onclick="sendChatMessage()" style="padding: 10px 18px;">📤 Kirim</button>
                </div>
            </div>
        </div>
    `;
    
    const searchInput = document.getElementById('chatSearchInput');
    if (searchInput) searchInput.oninput = () => filterChatList();
    
    const messageInput = document.getElementById('chatMessageInput');
    if (messageInput) {
        messageInput.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        };
    }
    
    loadChatList();
    console.log("✅ Chat interface rendered");
    return true;
}

async function loadChatList() {
    let container = document.getElementById('chatList');
    if (!container) container = document.querySelector('#chatModalPanel #chatList');
    if (!container || !currentUser) return;
    
    try {
        const snapshot = await db.ref(`chats/${currentUser.uid}/inbox`).once('value');
        const inbox = snapshot.val();
        
        if (!inbox || Object.keys(inbox).length === 0) {
            container.innerHTML = '<p class="text-small" style="color: var(--text-muted); text-align:center; padding:20px;">📭 Belum ada chat. Cari teman untuk memulai chat!</p>';
            return;
        }
        
        const friendUids = Object.keys(inbox);
        
        let userDataMap = {};
        let missingUids = [];
        
        if (dbData && dbData.users_auth && dbData.users_auth.length > 0) {
            for (const user of dbData.users_auth) {
                userDataMap[user.uid] = user;
            }
            missingUids = friendUids.filter(uid => !userDataMap[uid]);
            console.log(`⚡ chat.js: ${friendUids.length - missingUids.length} teman dari cache, ${missingUids.length} perlu query`);
        } else {
            missingUids = [...friendUids];
        }
        
        if (missingUids.length > 0) {
            const promises = missingUids.map(uid => db.ref(`users_auth/${uid}`).once('value'));
            const snapshots = await Promise.all(promises);
            snapshots.forEach(snap => {
                if (snap.exists()) {
                    userDataMap[snap.key] = snap.val();
                }
            });
        }
        
        const chatList = [];
        for (const [friendUid, chatInfo] of Object.entries(inbox)) {
            const friendData = userDataMap[friendUid];
            if (friendData) {
                chatList.push({
                    uid: friendUid,
                    nama: friendData.nama,
                    email: friendData.email,
                    photoUrl: friendData.photoUrl,
                    lastMessage: chatInfo.lastMessage || '',
                    lastMessageType: chatInfo.lastMessageType || 'text',
                    lastMessageTime: chatInfo.lastMessageTime || 0,
                    unreadCount: chatInfo.unreadCount || 0
                });
            } else {
                chatList.push({
                    uid: friendUid,
                    nama: 'Pengguna tidak dikenal',
                    email: '',
                    photoUrl: null,
                    lastMessage: chatInfo.lastMessage || '',
                    lastMessageType: chatInfo.lastMessageType || 'text',
                    lastMessageTime: chatInfo.lastMessageTime || 0,
                    unreadCount: chatInfo.unreadCount || 0
                });
            }
        }
        
        chatList.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0));
        
        container.innerHTML = chatList.map(chat => `
            <div class="chat-item ${currentChatWith === chat.uid ? 'active' : ''}" data-uid="${chat.uid}" onclick="selectChat('${chat.uid}')" style="display: flex; align-items: center; gap: 12px; padding: 12px; cursor: pointer; transition: background 0.2s; border-bottom: 1px solid var(--border);">
                <div class="chat-avatar" style="position: relative; flex-shrink: 0;">
                    <img src="${chat.photoUrl || getAvatarUrl(chat.nama)}" alt="${escapeHtml(chat.nama)}" style="width: 48px; height: 48px; border-radius: 50%; object-fit: cover;">
                    ${chat.unreadCount > 0 ? `<span class="chat-unread-badge" style="position: absolute; bottom: -2px; right: -2px; background: #f44336; color: white; border-radius: 50%; width: 20px; height: 20px; font-size: 10px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--bg-sidebar);">${chat.unreadCount}</span>` : ''}
                </div>
                <div class="chat-info" style="flex: 1; min-width: 0;">
                    <div class="chat-name" style="font-weight: bold; font-size: 0.9rem;">${escapeHtml(chat.nama)}</div>
                    <div class="chat-last-message" style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${chat.lastMessageType === 'image' ? '📷 Gambar' : escapeHtml(chat.lastMessage?.substring(0, 30) || '')}
                    </div>
                </div>
                <div class="chat-time" style="font-size: 0.7rem; color: var(--text-muted); flex-shrink: 0;">${formatChatTime(chat.lastMessageTime)}</div>
            </div>
        `).join('');
        
        const searchValue = document.getElementById('chatSearchInput')?.value.toLowerCase() || '';
        if (searchValue) filterChatList();
    } catch (error) {
        console.error("Load chat list error:", error);
        container.innerHTML = '<p class="text-small" style="color: var(--text-muted); text-align:center; padding:20px;">❌ Gagal memuat chat</p>';
    }
}

function filterChatList() {
    const searchValue = document.getElementById('chatSearchInput')?.value.toLowerCase() || '';
    document.querySelectorAll('.chat-item').forEach(item => {
        const name = item.querySelector('.chat-name')?.textContent.toLowerCase() || '';
        item.style.display = (searchValue === '' || name.includes(searchValue)) ? 'flex' : 'none';
    });
}

function formatChatTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    const hours = Math.floor(diff / 3600000);
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return minutes === 0 ? 'Baru saja' : `${minutes} m`;
    } else if (diff < 86400000) {
        return `${hours} jam`;
    } else if (diff < 604800000) {
        return `${Math.floor(diff / 86400000)} h`;
    } else {
        return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    }
}

// ======================= FUNGSI CHAT =======================

async function selectChat(friendUid) {
    console.log("💬 Selecting chat with:", friendUid);
    currentChatWith = friendUid;
    await markMessagesAsRead(friendUid);
    
    const friendSnapshot = await db.ref(`users_auth/${friendUid}`).once('value');
    const friendData = friendSnapshot.val();
    
    const header = document.getElementById('chatHeader');
    const messagesContainer = document.getElementById('chatMessages');
    const inputArea = document.getElementById('chatInputArea');
    
    if (header && friendData) {
        header.innerHTML = `
            <div class="chat-header-info" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <img src="${friendData.photoUrl || getAvatarUrl(friendData.nama)}" alt="${escapeHtml(friendData.nama)}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">
                <div>
                    <div class="chat-header-name" style="font-weight: bold;">${escapeHtml(friendData.nama)}</div>
                    <div class="chat-header-email" style="font-size: 0.7rem; color: var(--text-muted);">${escapeHtml(friendData.email)}</div>
                </div>
                <div class="chat-header-actions" style="margin-left: auto;">
                    <button class="btn-icon" onclick="clearChat('${friendUid}')" title="Hapus semua pesan (hanya untuk Anda)" style="background:transparent; border:none; cursor:pointer; padding:8px;">🗑️</button>
                </div>
            </div>
        `;
    }
    if (inputArea) inputArea.style.display = 'flex';
    loadChatMessages(friendUid);
}

async function markMessagesAsRead(friendUid) {
    await db.ref(`chats/${currentUser.uid}/inbox/${friendUid}/unreadCount`).set(0);
    loadChatList();
}

async function loadChatMessages(friendUid) {
    if (chatMessagesListener) {
        db.ref(`chats/${currentUser.uid}/messages/${friendUid}`).off('value', chatMessagesListener);
    }
    
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;
    messagesContainer.innerHTML = '<div class="chat-messages-loading" style="text-align:center; color:var(--text-muted); padding:20px;">Memuat pesan...</div>';
    
    chatMessagesListener = db.ref(`chats/${currentUser.uid}/messages/${friendUid}`).on('value', (snapshot) => {
        const data = snapshot.val();
        const messages = [];
        if (data) {
            Object.entries(data).forEach(([msgId, msg]) => messages.push({ id: msgId, ...msg }));
            messages.sort((a, b) => a.timestamp - b.timestamp);
        }
        renderChatMessages(messages, friendUid);
        setTimeout(() => {
            if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 100);
    });
}

function renderChatMessages(messages, friendUid) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div class="chat-messages-empty" style="text-align:center; color:var(--text-muted); padding:40px;">💬 Belum ada pesan. Kirim pesan pertama!</div>';
        return;
    }
    
    container.innerHTML = messages.map(msg => {
        const isMe = msg.from === currentUser.uid;
        const time = new Date(msg.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const date = new Date(msg.timestamp).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
        let contentHtml = msg.type === 'image' 
            ? `<a href="${msg.mediaUrl}" target="_blank"><img src="${msg.mediaUrl}" style="max-width:200px; max-height:150px; border-radius:8px; cursor:pointer;"></a>`
            : `<div class="chat-message-text" style="word-wrap: break-word;">${escapeHtml(msg.message)}</div>`;
        return `
            <div class="chat-message ${isMe ? 'me' : 'friend'}" data-msg-id="${msg.id}" style="display: flex; ${isMe ? 'justify-content: flex-end;' : 'justify-content: flex-start;'} margin-bottom: 12px;">
                <div class="chat-message-bubble" style="max-width: 80%; padding: 10px 14px; border-radius: 22px; position: relative; ${isMe ? 'background: var(--primary); color: white; border-bottom-right-radius: 6px;' : 'background: var(--bg-hover); color: var(--text-primary); border-bottom-left-radius: 6px;'}">
                    ${contentHtml}
                    <div class="chat-message-time" style="font-size: 0.65rem; opacity: 0.7; margin-top: 4px; text-align: right;">${date} ${time}</div>
                    ${isMe ? `<span class="chat-message-delete" onclick="deleteChatMessage('${friendUid}', '${msg.id}')" title="Hapus pesan (hanya untuk Anda)" style="position: absolute; top: -10px; right: -10px; font-size: 14px; cursor: pointer; opacity: 0; transition: opacity 0.2s; background: var(--bg-card); border-radius: 50%; padding: 4px; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">🗑️</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    container.querySelectorAll('.chat-message-bubble').forEach(bubble => {
        bubble.addEventListener('mouseenter', () => {
            const del = bubble.querySelector('.chat-message-delete');
            if (del) del.style.opacity = '1';
        });
        bubble.addEventListener('mouseleave', () => {
            const del = bubble.querySelector('.chat-message-delete');
            if (del) del.style.opacity = '0';
        });
    });
}

async function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    const message = input?.value.trim();
    if (!message) return;
    if (!currentChatWith) { showToast("Pilih chat terlebih dahulu!", "error"); return; }
    if (!await checkIsFriend(currentChatWith)) { showToast("Anda tidak bisa chat dengan orang yang bukan teman!", "error"); return; }
    if (input) input.disabled = true;
    
    const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const timestamp = firebase.database.ServerValue.TIMESTAMP;
    const messageData = {
        id: messageId, from: currentUser.uid, to: currentChatWith,
        message, type: 'text', timestamp, read: false
    };
    
    try {
        await Promise.all([
            db.ref(`chats/${currentUser.uid}/messages/${currentChatWith}/${messageId}`).set(messageData),
            db.ref(`chats/${currentChatWith}/messages/${currentUser.uid}/${messageId}`).set(messageData),
            db.ref(`chats/${currentChatWith}/inbox/${currentUser.uid}`).update({
                lastMessage: message, lastMessageType: 'text', lastMessageTime: timestamp,
                unreadCount: firebase.database.ServerValue.increment(1)
            }),
            db.ref(`chats/${currentUser.uid}/inbox/${currentChatWith}`).update({
                lastMessage: message, lastMessageType: 'text', lastMessageTime: timestamp, unreadCount: 0
            })
        ]);
        if (input) { input.value = ''; input.disabled = false; input.focus(); }
        const msgContainer = document.getElementById('chatMessages');
        if (msgContainer) setTimeout(() => msgContainer.scrollTop = msgContainer.scrollHeight, 100);
    } catch (error) {
        console.error("Send message error:", error);
        showToast("❌ Gagal mengirim pesan", "error");
        if (input) input.disabled = false;
    }
}

// ======================= SEND CHAT MEDIA (SUPABASE INTEGRATION) =======================

async function sendChatMedia(input) {
    const file = input.files[0];
    if (!file) return;
    
    if (!currentChatWith) {
        showToast("Pilih chat terlebih dahulu!", "error");
        input.value = '';
        return;
    }
    
    if (!await checkIsFriend(currentChatWith)) {
        showToast("Anda tidak bisa chat dengan orang yang bukan teman!", "error");
        input.value = '';
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showToast("❌ Ukuran gambar maksimal 5MB!", "error");
        input.value = '';
        return;
    }
    
    showToast("📤 Mengunggah gambar ke Supabase...", "info");
    
    try {
        let mediaUrl;
        let isFallback = false;
        
        if (typeof uploadWithFallback !== 'undefined') {
            const result = await uploadWithFallback(file, 'chat');
            mediaUrl = result.url;
            isFallback = result.isFallback || false;
        } else {
            console.warn("uploadWithFallback not available, using ImgBB fallback");
            const formData = new FormData();
            formData.append('image', file);
            const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, { method: 'POST', body: formData });
            const data = await res.json();
            if (!data.success) throw new Error("ImgBB upload failed");
            mediaUrl = data.data.image.url;
            isFallback = true;
        }
        
        const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const timestamp = firebase.database.ServerValue.TIMESTAMP;
        const messageData = {
            id: messageId,
            from: currentUser.uid,
            to: currentChatWith,
            message: '📷 Mengirim gambar',
            type: 'image',
            mediaUrl: mediaUrl,
            timestamp: timestamp,
            read: false
        };
        
        await Promise.all([
            db.ref(`chats/${currentUser.uid}/messages/${currentChatWith}/${messageId}`).set(messageData),
            db.ref(`chats/${currentChatWith}/messages/${currentUser.uid}/${messageId}`).set(messageData),
            db.ref(`chats/${currentChatWith}/inbox/${currentUser.uid}`).update({
                lastMessage: '📷 Gambar',
                lastMessageType: 'image',
                lastMessageTime: timestamp,
                unreadCount: firebase.database.ServerValue.increment(1)
            }),
            db.ref(`chats/${currentUser.uid}/inbox/${currentChatWith}`).update({
                lastMessage: '📷 Gambar',
                lastMessageType: 'image',
                lastMessageTime: timestamp,
                unreadCount: 0
            })
        ]);
        
        const successMsg = isFallback ? "✅ Gambar berhasil dikirim (via ImgBB fallback)!" : "✅ Gambar berhasil dikirim ke Supabase!";
        showToast(successMsg, "success");
        
        if (isFallback) {
            setTimeout(() => {
                showToast("ℹ️ Catatan: Gambar disimpan via ImgBB (fallback)", "info");
            }, 2000);
        }
        
    } catch (err) {
        console.error("Upload error:", err);
        showToast("❌ Gagal mengirim gambar: " + err.message, "error");
    } finally {
        input.value = '';
    }
}

// ======================= HAPUS PESAN (DENGAN LOG) =======================

async function deleteChatMessage(friendUid, messageId) {
    if (!confirm("Hapus pesan ini? Pesan hanya akan hilang dari sisi Anda.")) return;
    
    let wasLastMessage = false;
    let lastMessageInfo = null;
    
    try {
        // Ambil data pesan untuk log (isi pesan)
        let messageText = '';
        const msgSnapshot = await db.ref(`chats/${currentUser.uid}/messages/${friendUid}/${messageId}`).once('value');
        const msgData = msgSnapshot.val();
        if (msgData) {
            messageText = msgData.type === 'image' ? '[Gambar]' : (msgData.message || '');
        }
        
        const inboxSnapshot = await db.ref(`chats/${currentUser.uid}/inbox/${friendUid}`).once('value');
        const inboxData = inboxSnapshot.val();
        if (inboxData && inboxData.lastMessageTime && msgData && msgData.timestamp === inboxData.lastMessageTime) {
            wasLastMessage = true;
            lastMessageInfo = { timestamp: msgData.timestamp };
        }
        
        await db.ref(`chats/${currentUser.uid}/messages/${friendUid}/${messageId}`).remove();
        
        if (wasLastMessage) {
            const remainingMessages = await db.ref(`chats/${currentUser.uid}/messages/${friendUid}`).once('value');
            const msgs = remainingMessages.val();
            if (msgs) {
                const messagesList = Object.entries(msgs).map(([id, msg]) => ({ id, ...msg }));
                const lastMsg = messagesList.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0];
                if (lastMsg) {
                    await db.ref(`chats/${currentUser.uid}/inbox/${friendUid}`).update({
                        lastMessage: lastMsg.type === 'image' ? '📷 Gambar' : lastMsg.message,
                        lastMessageType: lastMsg.type || 'text',
                        lastMessageTime: lastMsg.timestamp
                    });
                } else {
                    await db.ref(`chats/${currentUser.uid}/inbox/${friendUid}`).remove();
                }
            } else {
                await db.ref(`chats/${currentUser.uid}/inbox/${friendUid}`).remove();
            }
        }
        
        showToast("✅ Pesan dihapus (hanya dari sisi Anda)", "success");
        
        // LOG: Hapus pesan
        if (typeof logActivity === 'function') {
            logActivity('delete_chat_message', `Menghapus pesan ${messageText ? `"${messageText.substring(0, 50)}"` : ''} dari chat dengan ${friendUid}`);
        }
        
        if (currentChatWith === friendUid) {
            loadChatMessages(friendUid);
        }
        loadChatList();
    } catch (error) {
        console.error("Delete message error:", error);
        showToast("❌ Gagal menghapus pesan", "error");
    }
}

// ======================= HAPUS SEMUA PESAN (DENGAN LOG) =======================

async function clearChat(friendUid) {
    if (!confirm(`Hapus SEMUA pesan dengan teman ini?\n\nPesan hanya akan hilang dari sisi Anda. Teman Anda masih akan melihat riwayat chat.`)) return;
    
    // Ambil nama teman untuk log
    let friendName = friendUid;
    const friendSnapshot = await db.ref(`users_auth/${friendUid}`).once('value');
    if (friendSnapshot.exists()) {
        friendName = friendSnapshot.val().nama || friendUid;
    }
    
    try {
        await Promise.all([
            db.ref(`chats/${currentUser.uid}/messages/${friendUid}`).remove(),
            db.ref(`chats/${currentUser.uid}/inbox/${friendUid}`).remove()
        ]);
        
        showToast("✅ Chat berhasil dibersihkan (hanya dari sisi Anda)", "success");
        
        // LOG: Bersihkan chat
        if (typeof logActivity === 'function') {
            logActivity('clear_chat', `Membersihkan seluruh chat dengan ${friendName}`);
        }
        
        if (currentChatWith === friendUid) {
            currentChatWith = null;
            const header = document.getElementById('chatHeader');
            const messagesContainer = document.getElementById('chatMessages');
            const inputArea = document.getElementById('chatInputArea');
            if (header) header.innerHTML = '<p class="text-small" style="color: var(--text-muted); text-align:center; padding:20px;">Pilih chat untuk memulai percakapan</p>';
            if (messagesContainer) messagesContainer.innerHTML = '<div class="chat-messages-empty" style="text-align:center; color:var(--text-muted); padding:40px;">👈 Pilih chat di sebelah kiri</div>';
            if (inputArea) inputArea.style.display = 'none';
        }
        loadChatList();
    } catch (error) {
        console.error("Clear chat error:", error);
        showToast("❌ Gagal membersihkan chat", "error");
    }
}

async function startChatWithFriend(friendUid, friendName, friendEmail) {
    if (!await checkIsFriend(friendUid)) {
        showToast("Anda tidak bisa chat dengan orang yang bukan teman!", "error");
        return;
    }
    if (typeof switchTab === 'function') switchTab('chat');
    setTimeout(() => {
        const chatPanel = document.getElementById('chatPanel');
        if (chatPanel && (!chatPanel.querySelector('.chat-container') || chatPanel.innerHTML.includes('Memuat fitur chat'))) {
            renderChatInterface('chatPanel');
        }
        setTimeout(() => selectChat(friendUid), 300);
    }, 500);
}

function openChatModal() {
    const modal = document.getElementById('modal-chat');
    if (modal) {
        modal.classList.add('open');
        renderChatInterface('chatModalPanel');
    }
}

// ======================= UTILITY =======================

function getAvatarUrl(name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=00bcd4&color=fff&size=100`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : m === '<' ? '&lt;' : '&gt;');
}

async function checkIsFriend(friendUid) {
    if (!currentUser) return false;
    const snapshot = await db.ref(`friendships/list/${currentUser.uid}/${friendUid}`).once('value');
    return snapshot.exists();
}

// ======================= CLEANUP =======================

function cleanupChatSystem() {
    if (chatMessagesListener) {
        if (currentChatWith && currentUser) {
            db.ref(`chats/${currentUser.uid}/messages/${currentChatWith}`).off('value', chatMessagesListener);
        }
        chatMessagesListener = null;
    }
    if (chatListeners.incoming && currentUser) {
        db.ref(`chats/${currentUser.uid}/inbox`).off('value', chatListeners.incoming);
        chatListeners.incoming = null;
    }
    chatInitialized = false;
    console.log("🧹 Chat system cleaned up");
}

// ======================= INISIALISASI EVENT LISTENER ========================
setupChatUiReadyListener();

if (typeof window !== 'undefined' && window.currentUser && window.currentUser.uid && !chatInitialized) {
    console.log("💬 chat.js: currentUser already exists, initializing immediately");
    setTimeout(() => initChatSystem(), 100);
}

// ======================= EXPORT KE GLOBAL =======================
window.initChatSystem = initChatSystem;
window.selectChat = selectChat;
window.sendChatMessage = sendChatMessage;
window.sendChatMedia = sendChatMedia;
window.deleteChatMessage = deleteChatMessage;
window.clearChat = clearChat;
window.startChatWithFriend = startChatWithFriend;
window.openChatModal = openChatModal;
window.filterChatList = filterChatList;
window.cleanupChatSystem = cleanupChatSystem;
window.renderChatInterface = renderChatInterface;
window.loadChatList = loadChatList;

console.log("✅ chat.js V4.4 loaded - Dengan log aktivitas untuk hapus pesan dan clear chat");