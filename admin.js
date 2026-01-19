import { db } from './firebase.js';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";

let allOrders = [];
let allProducts = [];

window.initAdmin = () => {
    // 1. Shop Settings Listener
    onSnapshot(doc(db, "shopControl", "status"), (docSnap) => {
        if(docSnap.exists()) {
            const d = docSnap.data();
            document.getElementById('shop-toggle').checked = d.isClosed;
            document.getElementById('status-label').innerText = d.isClosed ? "CLOSED" : "OPEN";
            document.getElementById('delivery-charge-input').value = d.deliveryCharge || 0;
            document.getElementById('support-number-input').value = d.supportNumber || "8090315246";
        }
    });

    // 2. Orders Real-time Listener
    onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
        allOrders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderOrders();
    });

    // 3. Products Real-time Listener
    onSnapshot(collection(db, "products"), (snap) => {
        allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        document.getElementById('admin-inventory').innerHTML = allProducts.map(p => `
            <tr>
                <td>${p.name}</td>
                <td>
                    <select onchange="updateStock('${p.id}', this.value)">
                        <option value="Available" ${p.status==='Available'?'selected':''}>Available</option>
                        <option value="Unavailable" ${p.status==='Unavailable'?'selected':''}>Unavailable</option>
                    </select>
                </td>
                <td>₹${p.price}/${p.unit}</td>
                <td><button onclick="editProduct('${p.id}')">Edit</button> <button onclick="deleteProduct('${p.id}')" style="color:red">Del</button></td>
            </tr>`).join('');
    });

    // 4. Categories Real-time Listener
    onSnapshot(collection(db, "categories"), (snap) => {
        const cats = snap.docs.map(d => ({id: d.id, ...d.data()}));
        document.getElementById('p-category').innerHTML = cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        document.getElementById('admin-cat-list').innerHTML = cats.map(c => `
            <span class="category-chip" style="background:#e2e8f0; border:none; display:flex; align-items:center; gap:8px;">
                ${c.name} <b onclick="deleteCategory('${c.id}')" style="cursor:pointer; color:red">×</b>
            </span>`).join('');
    });
};

function renderOrders() {
    const start = document.getElementById('filter-start').value;
    const end = document.getElementById('filter-end').value;
    let rev = 0, sold = 0;
    
    document.getElementById('admin-orders').innerHTML = allOrders.filter(o => {
        if(!o.createdAt) return true;
        const d = o.createdAt.toDate();
        if(start && d < new Date(start)) return false;
        if(end && d > new Date(end + 'T23:59:59')) return false;
        return true;
    }).map(o => {
        // Revenue Rules: Only delivered. Exclude Cancelled/Returns.
        if(o.status === 'delivered') {
            rev += o.total;
            o.items.forEach(i => sold += i.qty);
        }
        const timeStr = o.createdAt ? o.createdAt.toDate().toLocaleDateString() : "...";
        return `
            <tr>
                <td>${timeStr}</td>
                <td>${o.customerName}</td>
                <td>₹${o.total}</td>
                <td><span class="status-tag status-${o.status}">${o.status}</span></td>
                <td>
                    <select onchange="upStatus('${o.id}', this.value)" style="width:100px; font-size:10px;">
                        <option value="pending" ${o.status==='pending'?'selected':''}>Pending</option>
                        <option value="delivered" ${o.status==='delivered'?'selected':''}>Delivered</option>
                        <option value="cancelled" ${o.status==='cancelled'?'selected':''}>Cancelled</option>
                        <option value="return_pending" ${o.status==='return_pending'?'selected':''}>Return Req</option>
                        <option value="returned" ${o.status==='returned'?'selected':''}>Accepted/Returned</option>
                    </select>
                </td>
            </tr>`;
    }).join('');
    document.getElementById('total-rev-val').innerText = '₹' + rev;
    document.getElementById('total-sold-val').innerText = sold;
}

window.applyFilters = () => renderOrders();
window.upStatus = async (id, s) => await updateDoc(doc(db, "orders", id), { status: s });
window.updateStock = async (id, s) => await updateDoc(doc(db, "products", id), { status: s });

window.editProduct = (id) => {
    const p = allProducts.find(x => x.id === id);
    document.getElementById('edit-id').value = id;
    document.getElementById('edit-name').value = p.name;
    document.getElementById('edit-price').value = p.price;
    document.getElementById('edit-unit').value = p.unit || 'piece';
    document.getElementById('edit-img').value = p.imageUrl || '';
    document.getElementById('edit-modal').classList.add('active');
};

window.saveEdit = async () => {
    await updateDoc(doc(db, "products", document.getElementById('edit-id').value), {
        name: document.getElementById('edit-name').value, 
        price: parseInt(document.getElementById('edit-price').value),
        unit: document.getElementById('edit-unit').value, 
        imageUrl: document.getElementById('edit-img').value
    });
    document.getElementById('edit-modal').classList.remove('active');
};

window.updateShopSettings = async () => {
    await setDoc(doc(db, "shopControl", "status"), {
        isClosed: document.getElementById('shop-toggle').checked,
        deliveryCharge: parseInt(document.getElementById('delivery-charge-input').value) || 0,
        supportNumber: document.getElementById('support-number-input').value
    }, { merge: true });
    alert("Settings Saved Successfully");
};

window.addProduct = async () => {
    const name = document.getElementById('p-name').value;
    const price = parseInt(document.getElementById('p-price').value);
    if(name && price) {
        await addDoc(collection(db, "products"), { 
            name, price, unit: document.getElementById('p-unit').value, 
            imageUrl: document.getElementById('p-img').value, 
            category: document.getElementById('p-category').value, 
            status: 'Available', createdAt: serverTimestamp() 
        });
        alert("Product Added");
    }
};

window.addCategory = async () => {
    const n = document.getElementById('new-cat-name').value;
    if(n) await addDoc(collection(db, "categories"), { name: n });
};

window.deleteProduct = async (id) => { if(confirm("Delete Product?")) await deleteDoc(doc(db, "products", id)); };
window.deleteCategory = async (id) => { if(confirm("Delete Category?")) await deleteDoc(doc(db, "categories", id)); };