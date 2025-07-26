// Vérification que Firebase est initialisé
if (!window.firebase || !firebase.apps.length) {
  console.error(
    'Firebase SDK non initialisé. ' +
    'Assure-toi d’importer ton initFirebase.js avant ce script.'
  );
}

// Récupération des services
const auth = firebase.auth();
const db   = firebase.firestore();

// Sélecteurs DOM
const loginSection     = document.getElementById('login');
const dashboardSection = document.getElementById('dashboard');
const detailSection    = document.getElementById('memberDetail');
const emailEl          = document.getElementById('email');
const passwordEl       = document.getElementById('password');
const btnLogin         = document.getElementById('btnLogin');
const btnLogout        = document.getElementById('btnLogout');
const membersList      = document.getElementById('membersList');
const backBtn          = document.getElementById('backBtn');
const memberNameEl     = document.getElementById('memberName');
const paymentsList     = document.getElementById('paymentsList');
const addPaymentForm   = document.getElementById('addPaymentForm');
const paymentAmount    = document.getElementById('paymentAmount');
const paymentDate      = document.getElementById('paymentDate');
const addMemberForm    = document.getElementById('addMemberForm');
const deleteMemberBtn  = document.getElementById('deleteMemberBtn');
const messagesDiv      = document.getElementById('messages');

// État courant
let currentMemberId = null;

/**
 * Affiche un message temporaire
 * @param {string} text
 * @param {'error'|'success'} type
 */
function showMessage(text, type = 'error') {
  messagesDiv.innerHTML = `<div class="${type}">${text}</div>`;
  setTimeout(() => { messagesDiv.innerHTML = ''; }, 5000);
}

/**
 * Montre ou cache les sections
 * @param {'login'|'dashboard'|'memberDetail'} name
 */
function showSection(name) {
  loginSection.classList.toggle('hidden', name !== 'login');
  dashboardSection.classList.toggle('hidden', name !== 'dashboard');
  detailSection.classList.toggle('hidden', name !== 'memberDetail');
}

// Gérer la touche Enter sur le champ mot de passe
passwordEl.addEventListener('keypress', e => {
  if (e.key === 'Enter') btnLogin.click();
});

// Initialiser date d’entrée (nouveau membre) et date paiement
document.addEventListener('DOMContentLoaded', () => {
  const dateJoinInput = document.getElementById('newDateJoin');
  if (dateJoinInput) dateJoinInput.valueAsDate = new Date();
  if (paymentDate)    paymentDate.valueAsDate   = new Date();
});

// État d’authentification
auth.onAuthStateChanged(async user => {
  if (!user) {
    showSection('login');
    return;
  }

  try {
    const adminSnap = await db.doc(`administrateurs/${user.uid}`).get();
    if (!adminSnap.exists) {
      showMessage(
        '❌ Accès non autorisé. Seuls les administrateurs peuvent accéder.',
        'error'
      );
      await auth.signOut();
      return;
    }

    await loadMembers();
    showSection('dashboard');
  } catch (err) {
    showMessage('Erreur vérification admin: ' + err.message, 'error');
    await auth.signOut();
  }
});

// Connexion
btnLogin.addEventListener('click', async () => {
  const email    = emailEl.value.trim();
  const password = passwordEl.value;

  if (!email || !password) {
    showMessage('Veuillez saisir email et mot de passe.', 'error');
    return;
  }

  btnLogin.disabled = true;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    let msg = '❌ Erreur connexion: ';
    switch (err.code) {
      case 'auth/user-not-found':
        msg += 'Utilisateur non trouvé.'; break;
      case 'auth/wrong-password':
        msg += 'Mot de passe incorrect.'; break;
      case 'auth/invalid-email':
        msg += 'Email invalide.'; break;
      case 'auth/too-many-requests':
        msg += 'Trop de tentatives. Réessayez plus tard.'; break;
      default:
        msg += err.message;
    }
    showMessage(msg, 'error');
  } finally {
    btnLogin.disabled = false;
  }
});

// Déconnexion
btnLogout.addEventListener('click', async () => {
  if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
    await auth.signOut();
  }
});

// Chargement des membres
async function loadMembers() {
  document.getElementById('dashboardLoading').classList.remove('hidden');
  document.getElementById('membersTable').classList.add('hidden');
  document.getElementById('noMembers').classList.add('hidden');
  membersList.innerHTML = '';

  try {
    const snapshot = await db.collection('membres').orderBy('lastName').get();
    if (snapshot.empty) {
      document.getElementById('noMembers').classList.remove('hidden');
      updateStats(0, 0);
      return;
    }

    let totalAmount = 0;
    const members = await Promise.all(snapshot.docs.map(async doc => {
      const data       = doc.data();
      const memberTotal = await sumPayments(doc.id);
      totalAmount += memberTotal;
      return { id: doc.id, data, total: memberTotal };
    }));

    members.forEach(member => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-50 transition-colors';
      tr.innerHTML = `
        <td class="px-4 md:px-6 py-4 text-sm font-medium text-gray-900">${member.data.firstName || '–'}</td>
        <td class="px-4 md:px-6 py-4 text-sm text-gray-900">${member.data.lastName  || '–'}</td>
        <td class="px-4 md:px-6 py-4 text-sm text-gray-600 hidden md:table-cell">${member.data.phone     || 'Non renseigné'}</td>
        <td class="px-4 md:px-6 py-4 text-sm font-semibold text-green-600">
          ${member.total.toFixed(0)} FCFA
        </td>
        <td class="px-4 md:px-6 py-4 text-sm">
          <button class="detailBtn bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg font-medium transition-colors" data-id="${member.id}">
            Voir détails
          </button>
        </td>
      `;
      membersList.appendChild(tr);
    });

    document.querySelectorAll('.detailBtn').forEach(btn => {
      btn.addEventListener('click', () => showDetail(btn.dataset.id));
    });

    document.getElementById('membersTable').classList.remove('hidden');
    updateStats(members.length, totalAmount);
  } catch (err) {
    showMessage('Erreur chargement membres: ' + err.message, 'error');
  } finally {
    document.getElementById('dashboardLoading').classList.add('hidden');
  }
}

// Mise à jour des stats
function updateStats(count, total) {
  document.getElementById('totalMembers').textContent = count.toLocaleString();
  document.getElementById('totalAmount' ).textContent =
    total.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
  document.getElementById('avgAmount').textContent =
    count > 0 ? (total/count).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA' : '0 FCFA';
}

// Somme des paiements
async function sumPayments(memberId) {
  try {
    const snaps = await db.collection(`membres/${memberId}/paiements`).get();
    return snaps.docs.reduce((sum, d) => sum + (d.data().amount || 0), 0);
  } catch {
    return 0;
  }
}

// Afficher détail d’un membre
async function showDetail(memberId) {
  currentMemberId = memberId;
  try {
    const docSnap = await db.collection('membres').doc(memberId).get();
    if (!docSnap.exists) {
      showMessage('Membre non trouvé.', 'error');
      return;
    }

    const data = docSnap.data();
    memberNameEl.textContent = `${data.firstName || ''} ${data.lastName || ''}`.trim();
    document.getElementById('memberPhone').textContent    = data.phone || 'Non renseigné';
    document.getElementById('memberJoinDate').textContent =
      data.dateJoin && data.dateJoin.toDate
        ? data.dateJoin.toDate().toLocaleDateString('fr-FR')
        : 'Non renseignée';

    const total = await sumPayments(memberId);
    document.getElementById('memberTotal').textContent = total.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';

    // Paiements
    const paysSnap = await db
      .collection(`membres/${memberId}/paiements`)
      .orderBy('date', 'desc')
      .get();

    if (paysSnap.empty) {
      paymentsList.innerHTML =
        '<li class="text-gray-500 text-center py-4">Aucun paiement enregistré</li>';
    } else {
      paymentsList.innerHTML = paysSnap.docs.map(d => {
        const { amount, date } = d.data();
        const dateStr = date && date.toDate
          ? date.toDate().toLocaleDateString('fr-FR')
          : 'Date inconnue';
        const formattedAmount = (amount||0).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
        return `
          <li class="flex justify-between items-center bg-white rounded-lg p-4 shadow-sm">
            <div class="flex flex-col">
              <span class="font-semibold text-gray-800">${dateStr}</span>
              <span class="text-green-600 font-bold">${formattedAmount} FCFA</span>
            </div>
            <button
              class="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-sm transition-colors"
              onclick="deletePayment('${d.id}')"
            >🗑️</button>
          </li>`;
      }).join('');
    }

    paymentDate.valueAsDate = new Date();
    showSection('memberDetail');

  } catch (err) {
    showMessage('Erreur chargement détail: ' + err.message, 'error');
  }
}

// Ajouter un nouveau membre
addMemberForm.addEventListener('submit', async e => {
  e.preventDefault();
  const firstName = document.getElementById('newFirstName').value.trim();
  const lastName  = document.getElementById('newLastName').value.trim();
  const phone     = document.getElementById('newPhone').value.trim();
  const dateJoin  = document.getElementById('newDateJoin').value;

  if (!firstName || !lastName) {
    showMessage('Prénom et nom sont obligatoires.', 'error');
    return;
  }

  try {
    await db.collection('membres').add({
      firstName,
      lastName,
      phone:    phone || null,
      dateJoin: dateJoin
        ? firebase.firestore.Timestamp.fromDate(new Date(dateJoin))
        : null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    addMemberForm.reset();
    showMessage('✅ Membre ajouté !', 'success');
    await loadMembers();
  } catch (err) {
    showMessage('Erreur ajout membre: ' + err.message, 'error');
  }
});

// Ajouter un paiement
addPaymentForm.addEventListener('submit', async e => {
  e.preventDefault();
  const amt  = parseFloat(paymentAmount.value);
  const date = paymentDate.value;

  if (!amt || amt <= 0) {
    showMessage('Montant invalide.', 'error');
    return;
  }

  try {
    await db
      .collection(`membres/${currentMemberId}/paiements`)
      .add({
        amount: amt,
        date: date
          ? firebase.firestore.Timestamp.fromDate(new Date(date))
          : firebase.firestore.FieldValue.serverTimestamp()
      });

    paymentAmount.value = '';
    paymentDate.valueAsDate = new Date();
    showMessage('✅ Paiement ajouté !', 'success');
    await showDetail(currentMemberId);
  } catch (err) {
    showMessage('Erreur ajout paiement: ' + err.message, 'error');
  }
});

// Supprimer un paiement
async function deletePayment(paymentId) {
  if (!confirm('Supprimer ce paiement ?')) return;
  try {
    await db
      .doc(`membres/${currentMemberId}/paiements/${paymentId}`)
      .delete();
    showMessage('✅ Paiement supprimé !', 'success');
    await showDetail(currentMemberId);
  } catch (err) {
    showMessage('Erreur suppression paiement: ' + err.message, 'error');
  }
}

// Supprimer un membre (et ses paiements)
deleteMemberBtn.addEventListener('click', async () => {
  const name = memberNameEl.textContent;
  if (!confirm(
    `⚠️ Supprimer ${name} et tous ses paiements ? Action irréversible.`
  )) return;

  try {
    const paymentsSnap = await db
      .collection(`membres/${currentMemberId}/paiements`)
      .get();
    const batch = db.batch();

    paymentsSnap.docs.forEach(doc => batch.delete(doc.ref));
    batch.delete(db.doc(`membres/${currentMemberId}`));

    await batch.commit();
    showMessage(`✅ ${name} supprimé !`, 'success');
    showSection('dashboard');
    await loadMembers();
  } catch (err) {
    showMessage('Erreur suppression membre: ' + err.message, 'error');
  }
});

// Retour au dashboard depuis le détail
backBtn.addEventListener('click', () => {
  currentMemberId = null;
  showSection('dashboard');
});