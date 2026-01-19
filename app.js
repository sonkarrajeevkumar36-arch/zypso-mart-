import { auth, db } from './firebase.js';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { collection, onSnapshot, query, where, orderBy, addDoc, doc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let currentUser = null;
let cart = [];
let allProducts = [];
let currentCategory = 'all';
let deliveryCharge = 0;
let searchTerm = '';

// Authentication Listener
onAuthStateChanged(auth, (user) => {
  currentUser = user;

  const authBtn = document.getElementById('auth-btn');
  const myOrdersBtn = document.getElementById('my-orders-btn');

  if (user) {
    // 🔓 USER LOGGED IN
    authBtn.innerHTML = "⎋"; // Logout icon
    myOrdersBtn.style.display = "flex";

    authBtn.onclick = () => {
      if (confirm("Are you sure logout?")) {
        signOut(auth);
      }
    };

  } else {
    // 🔐 USER LOGGED OUT
    authBtn.innerHTML = "👤"; // Login icon
    myOrdersBtn.style.display = "none";

    authBtn.onclick = () => {
      document.getElementById('auth-modal').classList.add('active');
    };
  }

  loadData();
  initGlobalListeners();
});

function initGlobalListeners() {
    // Shop Control & Support Number Listener
    onSnapshot(doc(db, "shopControl", "status"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            deliveryCharge = data.deliveryCharge || 0;
            if(data.supportNumber) {
                document.getElementById('support-link').href = `tel:${data.supportNumber}`;
            }
            const overlay = document.getElementById('shop-closed-overlay');
            if (data.isClosed) {
                overlay.style.display = 'flex';
                document.getElementById('opening-time-text').innerText = data.nextOpenTime ? `Opening at: ${data.nextOpenTime.toDate().toLocaleString()}` : 'Closed';
            } else {
                overlay.style.display = 'none';
            }
        }
    });
}

function loadData() {
    // Products Listener
    onSnapshot(collection(db, "products"), (snap) => {
        allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderProducts();
    });
    // Categories Listener
    onSnapshot(collection(db, "categories"), (snap) => {
        const list = document.getElementById('category-list');
        list.innerHTML = `<div class="category-chip ${currentCategory === 'all' ? 'active' : ''}" onclick="filterCat('all')">All</div>`;
        snap.docs.forEach(d => {
            const name = d.data().name;
            list.innerHTML += `<div class="category-chip ${currentCategory === name ? 'active' : ''}" onclick="filterCat('${name}')">${name}</div>`;
        });
    });
}

// Search & Filter Logic
window.filterCat = (cat) => { currentCategory = cat; renderProducts(); };
document.getElementById('product-search').oninput = (e) => { searchTerm = e.target.value; renderProducts(); };

function renderProducts() {
    const grid = document.getElementById('product-grid');
    const filtered = allProducts.filter(p => 
        (currentCategory === 'all' || p.category === currentCategory) &&
        (p.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    grid.innerHTML = filtered.map(p => {
        const isUnavailable = p.status === "Unavailable" || p.status === "Out of Stock";
        return `
        <div class="product-card ${isUnavailable ? 'out-of-stock' : ''}">
            ${isUnavailable ? '<span class="status-badge">Unavailable</span>' : ''}
            <img src="${p.imageUrl || 'placeholder.png'}" class="product-img">
            <h4>${p.name}</h4>
            <p>₹${p.price} / ${p.unit || 'piece'}</p>
            <button onclick="addToCart('${p.id}')" class="btn-primary" style="width:100%" ${isUnavailable ? 'disabled' : ''}>
                ${isUnavailable ? 'Unavailable' : 'Add to Cart'}
            </button>
        </div>`}).join('');
}

// Cart Management
window.addToCart = (id) => {
    const p = allProducts.find(x => x.id === id);
    if(p.status === "Unavailable" || p.status === "Out of Stock") return;
    const existing = cart.find(item => item.id === id);
    if (existing) existing.qty++;
    else cart.push({ ...p, qty: 1 });
    updateCartUI();
};

window.updateQty = (id, delta) => {
    const item = cart.find(i => i.id === id);
    if (item) {
        item.qty += delta;
        if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
        updateCartUI();
    }
};

function updateCartUI() {
    const container = document.getElementById('cart-items');
    let totalVal = 0;
    container.innerHTML = cart.map(item => {
        totalVal += item.price * item.qty;
        return `
            <div class="cart-item">
                <div><b>${item.name}</b><br><small>₹${item.price} x ${item.qty}</small></div>
                <div class="qty-control">
                    <button onclick="updateQty('${item.id}', -1)">-</button>
                    <span class="qty-val">${item.qty}</span>
                    <button onclick="updateQty('${item.id}', 1)">+</button>
                </div>
            </div>`;
    }).join('');
    document.getElementById('cart-count').innerText = cart.reduce((a, b) => a + b.qty, 0);
    document.getElementById('cart-total').innerText = `₹${totalVal + (cart.length > 0 ? deliveryCharge : 0)}`;
}

// Order Management (User)
window.cancelOrder = async (id) => { 
    if(confirm("Are you sure you want to cancel this order?")) {
        await updateDoc(doc(db, "orders", id), { status: "cancelled" }); 
    }
};

window.returnOrder = async (id) => { 
    if(confirm("Request a return for this order?")) {
        await updateDoc(doc(db, "orders", id), { status: "return_pending" }); 
    }
};

function loadUserOrders() {
    if(!currentUser) return;
    const q = query(collection(db, "orders"), where("userId", "==", currentUser.uid), orderBy("createdAt", "desc"));
    onSnapshot(q, (snap) => {
        document.getElementById('user-orders-list').innerHTML = snap.docs.map(d => {
            const o = d.data();
            const dateStr = o.createdAt ? o.createdAt.toDate().toLocaleDateString() : "...";
            const timeStr = o.createdAt ? o.createdAt.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "";
            return `
                <div class="order-card" style="border:1px solid #eee; padding:12px; border-radius:12px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                        <small>${dateStr} ${timeStr}</small>
                        <span class="status-tag status-${o.status}">${o.status.replace('_',' ')}</span>
                    </div>
                    <p style="margin:5px 0; font-size:14px;">${o.items.map(i => `${i.name} (x${i.qty})`).join(', ')}</p>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                        <b>₹${o.total}</b>
                        <div>
                            ${o.status === 'pending' ? `<button onclick="cancelOrder('${d.id}')" class="btn-cancel" style="background:var(--danger); color:white; border:none; padding:5px 10px; border-radius:5px; font-size:12px;">Cancel</button>` : ''}
                            ${o.status === 'delivered' ? `<button onclick="returnOrder('${d.id}')" class="btn-secondary" style="font-size:12px;">Return</button>` : ''}
                        </div>
                    </div>
                </div>`;
        }).join('');
    });
}

// Checkout Flow
document.getElementById('checkout-btn').onclick = async () => {
    if (!currentUser) return alert("Please login to place an order");
    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;
    const address = document.getElementById('cust-address').value;
    if (!name || !phone || !address || cart.length === 0) return alert("Please fill all delivery details");
    
    try {
        await addDoc(collection(db, "orders"), {
            userId: currentUser.uid,
            customerName: name,
            customerPhone: phone,
            customerAddress: address,
            items: cart,
            total: parseInt(document.getElementById('cart-total').innerText.replace('₹','')),
            status: 'pending',
            createdAt: serverTimestamp()
        });
        alert("Order Placed Successfully!");
        cart = [];
        updateCartUI();
        document.getElementById('sidebar-overlay').classList.remove('active');
    } catch (e) { alert("Error: " + e.message); }
};

// UI Handlers
document.getElementById('cart-btn').onclick = () => document.getElementById('sidebar-overlay').classList.add('active');
document.getElementById('close-cart').onclick = () => document.getElementById('sidebar-overlay').classList.remove('active');
document.getElementById('my-orders-btn').onclick = () => { document.getElementById('orders-modal').classList.add('active'); loadUserOrders(); };
document.getElementById('close-orders').onclick = () => document.getElementById('orders-modal').classList.remove('active');
document.getElementById('close-modal').onclick = () => document.getElementById('auth-modal').classList.remove('active');

// Auth Form Submit
document.getElementById('auth-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;
    const isLogin = document.getElementById('modal-title').innerText === "Login";
    try {
        if (isLogin) await signInWithEmailAndPassword(auth, email, pass);
        else await createUserWithEmailAndPassword(auth, email, pass);
        document.getElementById('auth-modal').classList.remove('active');
    } catch (err) { alert(err.message); }
};

document.getElementById('switch-mode').onclick = () => {
    const title = document.getElementById('modal-title');
    const submitBtn = document.getElementById('auth-submit');
    const modeBtn = document.getElementById('switch-mode');
    if (title.innerText === "Login") {
        title.innerText = "Register"; submitBtn.innerText = "Register"; modeBtn.innerText = "Already have an account? Login";
    } else {
        title.innerText = "Login"; submitBtn.innerText = "Login"; modeBtn.innerText = "New here? Register";
    }
};