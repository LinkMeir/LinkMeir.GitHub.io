import { auth, db, googleProvider } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const STORAGE_KEY = 'LinkMeir_Secure_Data'; // שם חדש וייחודי
const state = { items: [], trash: [], user: null, unsubscribe: null };

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.error);
}

document.addEventListener('DOMContentLoaded', () => {
    loadLocalData();
    setupDOMListeners();
    setupAuthListeners();
    renderList();
});

// --- Auth & Cloud ---
function setupAuthListeners() {
    onAuthStateChanged(auth, (user) => {
        const loggedInView = document.getElementById('loggedInView');
        const loggedOutView = document.getElementById('loggedOutView');
        const mainLoader = document.getElementById('mainLoader');

        if (user) {
            state.user = user;
            loggedOutView.classList.add('hidden');
            loggedInView.classList.remove('hidden');
            loggedInView.style.display = 'flex';
            
            document.getElementById('userName').textContent = user.displayName;
            document.getElementById('userAvatar').src = user.photoURL;
            updateSyncStatus('syncing');
            mainLoader.classList.remove('hidden');

            const docRef = doc(db, "users", user.uid);
            state.unsubscribe = onSnapshot(docRef, (docSnap) => {
                mainLoader.classList.add('hidden');
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    state.items = data.items || [];
                    state.trash = data.trash || [];
                    saveLocalData();
                    renderList();
                    updateSyncStatus('online');
                } else {
                    saveToCloud(true);
                }
            }, (error) => {
                console.error("Cloud Error:", error);
                if (error.code === 'permission-denied') alert("שגיאת הרשאות! נא לעדכן את ה-Rules במסוף Firebase.");
                updateSyncStatus('error');
            });
        } else {
            state.user = null;
            if (state.unsubscribe) state.unsubscribe();
            loggedInView.classList.add('hidden');
            loggedOutView.classList.remove('hidden');
            loggedOutView.style.display = 'flex';
            mainLoader.classList.add('hidden');
            loadLocalData();
            renderList();
        }
    });
}

async function saveToCloud(isInit = false) {
    saveLocalData();
    if (!state.user) return;
    if (!isInit) updateSyncStatus('syncing');
    try {
        await setDoc(doc(db, "users", state.user.uid), {
            items: state.items,
            trash: state.trash,
            lastUpdated: new Date().toISOString()
        }, { merge: true });
        if (!isInit) updateSyncStatus('online');
    } catch (e) {
        console.error("Save failed:", e);
        updateSyncStatus('error');
    }
}

// --- Helpers ---
function loadLocalData() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const parsed = JSON.parse(stored);
        state.items = parsed.items || [];
        state.trash = parsed.trash || [];
    }
}
function saveLocalData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, trash: state.trash }));
}

// --- Rendering ---
function renderList() {
    const container = document.getElementById('listContainer');
    const query = document.getElementById('searchInput').value.toLowerCase();
    const catFilter = document.getElementById('categoryFilter').value;
    const sortMode = document.getElementById('sortOrder').value;

    // Filter Categories
    const categories = [...new Set(state.items.map(i => i.category))].filter(c => c).sort();
    const catSelect = document.getElementById('categoryFilter');
    const currentCat = catSelect.value;
    catSelect.innerHTML = '<option value="">📂 הכל</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
    if (categories.includes(currentCat)) catSelect.value = currentCat;

    let filtered = state.items.filter(i => 
        (i.content.toLowerCase().includes(query) || i.description.toLowerCase().includes(query) || i.category.toLowerCase().includes(query)) &&
        (catFilter === "" || i.category === catFilter)
    );

    filtered.sort((a, b) => {
        if (sortMode === 'name') return (a.description || a.content).localeCompare(b.description || b.content);
        return new Date(b.date) - new Date(a.date);
    });

    document.getElementById('itemCount').textContent = `${filtered.length} פריטים`;
    container.innerHTML = '';
    
    if (filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; opacity:0.5">ריק</div>`;
        return;
    }

    filtered.forEach(item => {
        const isUrl = /^(http|https):\/\/[^ "]+$/.test(item.content.trim());
        const card = document.createElement('div');
        card.className = `card glass-panel ${item.isPinned ? 'pinned' : ''}`;
        card.dataset.id = item.id;

        const contentHtml = isUrl 
            ? `<a href="${item.content}" target="_blank" class="card-link">${item.description || item.content}</a>`
            : `<div class="card-link js-copy">${item.content}</div>`;
        
        const descHtml = (isUrl && item.description) ? `<div style="font-size:0.85rem; opacity:0.7">${item.content}</div>` : 
                         (!isUrl && item.description) ? `<div style="font-size:0.85rem; opacity:0.7">${item.description}</div>` : '';

        card.innerHTML = `
            <div class="card-body">
                ${contentHtml}
                ${descHtml}
                <div style="margin-top:10px; display:flex; justify-content:space-between; opacity:0.6; font-size:0.75rem">
                    <span>${item.category}</span>
                    <span>${new Date(item.date).toLocaleDateString()}</span>
                </div>
            </div>
            <div class="card-actions">
                <button class="action-icon js-copy">📋</button>
                <button class="action-icon js-delete" style="color:#ef4444">🗑️</button>
            </div>
        `;
        container.appendChild(card);
    });
}

// --- Events ---
function setupDOMListeners() {
    document.getElementById('googleLoginBtn').addEventListener('click', () => signInWithPopup(auth, googleProvider));
    document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth));
    document.getElementById('switchAccountBtn').addEventListener('click', async () => {
        await signOut(auth);
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        signInWithPopup(auth, googleProvider);
    });
    document.getElementById('toggleDarkModeBtn').addEventListener('click', () => document.body.classList.toggle('dark-mode'));

    document.getElementById('addItemForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = document.getElementById('itemContent').value.trim();
        if (!content) return;
        state.items.unshift({
            id: Date.now(),
            content,
            description: document.getElementById('itemDescription').value.trim(),
            category: document.getElementById('itemCategory').value.trim() || 'כללי',
            date: new Date().toISOString(),
            isPinned: false
        });
        renderList();
        e.target.reset();
        document.querySelector('details').removeAttribute('open');
        showToast("נשמר!");
        await saveToCloud();
    });

    document.getElementById('searchInput').addEventListener('input', renderList);
    document.getElementById('categoryFilter').addEventListener('change', renderList);
    document.getElementById('sortOrder').addEventListener('change', renderList);

    document.getElementById('listContainer').addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = Number(btn.closest('.card').dataset.id);
        if (btn.classList.contains('js-delete')) deleteItem(id);
        if (btn.classList.contains('js-copy')) {
            const item = state.items.find(i => i.id === id);
            if (item) copyToClipboard(item.content);
        }
    });

    document.getElementById('exportJsonBtn').addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.items));
        a.download = "link_backup.json";
        a.click();
    });
    
    document.getElementById('importJsonBtn').addEventListener('click', () => document.getElementById('importJsonInput').click());
    document.getElementById('importJsonInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                if (Array.isArray(imported)) {
                    const ids = new Set(state.items.map(i => i.id));
                    state.items = [...imported.filter(i => !ids.has(i.id)), ...state.items];
                    await saveToCloud();
                    renderList();
                    showToast("יובא בהצלחה!");
                }
            } catch { alert("קובץ שגוי"); }
        };
        reader.readAsText(file);
    });
}

async function deleteItem(id) {
    if (!confirm("למחוק?")) return;
    const idx = state.items.findIndex(i => i.id === id);
    if (idx > -1) {
        state.trash.push(state.items.splice(idx, 1)[0]);
        renderList();
        showToast("נמחק");
        await saveToCloud();
    }
}
function copyToClipboard(text) { navigator.clipboard.writeText(text).then(() => showToast("הועתק!")); }
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), 3000);
}
function updateSyncStatus(status) {
    const el = document.getElementById('syncStatus');
    const textMap = { 'online': 'מגובה', 'syncing': 'מסנכרן...', 'error': 'שגיאה' };
    el.innerHTML = `<span class="status-dot ${status}"></span> ${textMap[status] || 'מנותק'}`;
}