import { auth, db, googleProvider } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const STORAGE_KEY = 'LinkMeir_Final_Data'; // מפתח ייחודי חדש
const state = { items: [], trash: [], user: null, unsubscribe: null };

document.addEventListener('DOMContentLoaded', () => {
    loadLocalData();
    setupEventListeners();
    setupFirebaseListeners();
    renderList();

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log(err));
    }
});

function setupFirebaseListeners() {
    onAuthStateChanged(auth, async (user) => {
        const loggedInView = document.getElementById('loggedInView');
        const loggedOutView = document.getElementById('loggedOutView');
        
        if (user) {
            state.user = user;
            loggedOutView.style.display = 'none';
            loggedInView.style.display = 'flex';
            document.getElementById('userName').textContent = user.displayName;
            document.getElementById('userAvatar').src = user.photoURL;

            updateSyncStatus('syncing');
            if (state.unsubscribe) state.unsubscribe();

            const docRef = doc(db, "users", user.uid);
            state.unsubscribe = onSnapshot(docRef, (docSnap) => {
                document.getElementById('mainLoader').style.display = 'none';
                
                if (docSnap.exists()) {
                    const d = docSnap.data();
                    state.items = d.items || [];
                    state.trash = d.trash || [];
                    
                    localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, trash: state.trash }));
                    renderList();
                    updateSyncStatus('online');
                } else {
                    saveToFirestore(true).catch(console.error);
                }
            }, (error) => {
                console.error("Sync error:", error);
                updateSyncStatus('error');
                if(error.code === 'permission-denied') {
                    showToast("שגיאת הרשאות! בדוק את חוקי Firebase");
                }
            });
        } else {
            state.user = null;
            if(state.unsubscribe) state.unsubscribe();
            loggedInView.style.display = 'none';
            loggedOutView.style.display = 'flex';
            loadLocalData();
            renderList();
        }
    });
}

async function saveToFirestore(isInit = false) {
    if (!state.user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, trash: state.trash }));
        return;
    }

    if(!isInit) updateSyncStatus('syncing');
    try {
        await setDoc(doc(db, "users", state.user.uid), {
            items: state.items,
            trash: state.trash,
            lastUpdated: new Date().toISOString()
        }, { merge: true });
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ items: state.items, trash: state.trash }));
        if(!isInit) updateSyncStatus('online');
    } catch (e) { 
        console.error("Save failed:", e);
        updateSyncStatus('error');
    }
}

function loadLocalData() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const parsed = JSON.parse(stored);
        state.items = parsed.items || [];
        state.trash = parsed.trash || [];
    }
}

function renderList() {
    const container = document.getElementById('listContainer');
    const query = document.getElementById('searchInput').value.toLowerCase();
    const catFilter = document.getElementById('categoryFilter').value;
    const sortMode = document.getElementById('sortOrder').value;

    container.innerHTML = '';
    
    const categories = [...new Set(state.items.map(i => i.category))];
    const catSelect = document.getElementById('categoryFilter');
    const currentCat = catSelect.value;
    
    let optionsHTML = '<option value="">📂 כל הקטגוריות</option>';
    categories.filter(c => c).sort().forEach(c => {
        optionsHTML += `<option value="${c}">${c}</option>`;
    });
    catSelect.innerHTML = optionsHTML;
    if (categories.includes(currentCat)) catSelect.value = currentCat;

    let filtered = state.items.filter(i => 
        (i.content.toLowerCase().includes(query) || 
        i.description.toLowerCase().includes(query) ||
        i.category.toLowerCase().includes(query)) &&
        (catFilter === "" || i.category === catFilter)
    );

    filtered.sort((a, b) => {
        if (sortMode === 'name') return (a.description || a.content).localeCompare(b.description || b.content);
        return new Date(b.date) - new Date(a.date);
    });

    document.getElementById('itemCount').textContent = `${filtered.length} פריטים`;

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = `card glass-panel ${item.isPinned ? 'pinned' : ''}`;
        card.style.marginBottom = '15px';
        
        const isUrl = item.content.trim().match(/^(http|https):\/\/[^ "]+$/);
        
        const contentDisplay = isUrl ? 
            `<a href="${item.content}" target="_blank" class="card-link" style="color:var(--primary-color)">${item.description || item.content}</a>` :
            `<div class="card-link" style="color:var(--text-primary); cursor:pointer" onclick="window.copyItem('${item.content}')">${item.content}</div>`;

        card.innerHTML = `
            <div class="card-body" style="padding:15px">
                ${contentDisplay}
                ${isUrl && item.description ? `<div style="font-size:0.85rem; opacity:0.7; margin-top:5px; word-break:break-all" dir="ltr">${item.content}</div>` : ''}
                ${!isUrl && item.description ? `<div style="font-size:0.85rem; opacity:0.7; margin-top:5px">${item.description}</div>` : ''}
                
                <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:flex-end">
                    <span style="font-size:0.75rem; background:rgba(127,127,127,0.15); padding:3px 8px; border-radius:6px; color:var(--text-secondary)">
                        ${item.category}
                    </span>
                    <span style="font-size:0.7rem; opacity:0.5">${new Date(item.date).toLocaleDateString()}</span>
                </div>
            </div>
            <div style="padding:8px 15px; border-top:1px solid var(--glass-border); display:flex; justify-content:flex-end; gap:12px; background:rgba(0,0,0,0.02)">
                <button onclick="window.copyItem('${item.content}')" style="background:none; border:none; cursor:pointer; opacity:0.7" title="העתק">📋</button>
                <button onclick="window.deleteItem(${item.id})" style="background:none; border:none; cursor:pointer; opacity:0.7; color:#ef4444" title="מחק">🗑️</button>
            </div>
        `;
        container.appendChild(card);
    });
    
    if(filtered.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:40px; opacity:0.5">לא נמצאו פריטים</div>`;
    }
}

function setupEventListeners() {
    document.getElementById('googleLoginBtn').onclick = () => signInWithPopup(auth, googleProvider);
    
    document.getElementById('logoutBtn').onclick = () => {
        signOut(auth);
    };
    
    document.getElementById('switchAccountBtn').onclick = async () => {
        await signOut(auth);
        googleProvider.setCustomParameters({ prompt: 'select_account' });
        signInWithPopup(auth, googleProvider);
    };

    document.getElementById('addItemForm').onsubmit = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        btn.disabled = true;
        btn.textContent = 'שומר...';

        const content = document.getElementById('itemContent').value;
        const newItem = {
            id: Date.now(),
            content,
            description: document.getElementById('itemDescription').value || '',
            category: document.getElementById('itemCategory').value || 'כללי',
            date: new Date().toISOString(),
            isPinned: false
        };
        
        state.items.unshift(newItem);
        renderList();
        e.target.reset();
        document.querySelector('details').removeAttribute('open');
        await saveToFirestore();
        
        btn.disabled = false;
        btn.textContent = 'הוסף למאגר';
        showToast("הפריט נוסף בהצלחה");
    };

    document.getElementById('searchInput').oninput = renderList;
    document.getElementById('categoryFilter').onchange = renderList;
    document.getElementById('sortOrder').onchange = renderList;
    
    document.getElementById('toggleDarkModeBtn').onclick = () => {
        document.body.classList.toggle('dark-mode');
    };

    document.querySelectorAll('.drop-trigger').forEach(btn => {
        btn.onclick = (e) => {
            e.stopPropagation();
            const menu = document.getElementById(btn.dataset.target);
            menu.classList.toggle('show');
        };
    });
    
    window.onclick = () => document.querySelectorAll('.dropdown-content').forEach(m => m.classList.remove('show'));
    
    document.getElementById('exportJsonBtn').onclick = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.items));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "link_manager_backup.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    document.getElementById('importJsonInput').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const imported = JSON.parse(event.target.result);
                if (Array.isArray(imported)) {
                    const currentIds = new Set(state.items.map(i => i.id));
                    const newItems = imported.filter(i => !currentIds.has(i.id));
                    state.items = [...newItems, ...state.items];
                    await saveToFirestore();
                    renderList();
                    showToast(`יובאו ${newItems.length} פריטים`);
                }
            } catch (err) {
                alert("קובץ לא תקין");
            }
        };
        reader.readAsText(file);
    };
}

// פונקציות גלובליות לשימוש ב-HTML
window.deleteItem = async (id) => {
    if(!confirm("להעביר לסל המחזור?")) return;
    
    const idx = state.items.findIndex(i => i.id === id);
    if (idx > -1) {
        const item = state.items.splice(idx, 1)[0];
        state.trash.push(item);
        renderList();
        showToast("הועבר לסל המחזור");
        await saveToFirestore();
    }
};

window.copyItem = (text) => {
    navigator.clipboard.writeText(text);
    showToast("הועתק ללוח!");
};

function updateSyncStatus(status) {
    const el = document.getElementById('syncStatus');
    if (!el) return;
    const dot = el.querySelector('.status-dot');
    dot.className = `status-dot ${status}`;
    
    let text = 'מנותק';
    if(status === 'online') text = 'מגובה בענן';
    if(status === 'syncing') text = 'מסנכרן...';
    if(status === 'error') text = 'שגיאת סנכרון';
    
    el.innerHTML = `<span class="status-dot ${status}"></span> ${text}`;
}

function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toastMsg').textContent = msg;
    t.classList.add('visible');
    setTimeout(() => t.classList.remove('visible'), 3000);
}
