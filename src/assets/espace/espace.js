// Espace client B2B (page espace-client.html). Réglages dans assets/espace-config.js.
// Inscription des professionnels (SIRET vérifié + Kbis), puis suivi de projet, documents et messages.
// Données et fichiers chez Supabase : voir supabase/schema.sql pour les règles d'accès.
(function () {
  var root = document.querySelector('[data-ec]');
  var adminRoot = document.querySelector('[data-ec-admin]');
  if (!root && !adminRoot) return;
  var cfg = window.ESPACE_CONFIG || {};
  var MARQUE = cfg.nom || 'Notre équipe', COURT = cfg.nomCourt || MARQUE, CONTACT = cfg.contact || '', DELAI = cfg.delaiValidation || 'sous 48 heures ouvrées';
  if (!cfg.url || !cfg.anonKey || !window.supabase) {
    (root || adminRoot).innerHTML = '<div class="ec-card ec-narrow"><p class="label">Espace client</p><h1 class="ec-title">Bientôt disponible</h1>' +
      '<p class="ec-muted">Votre espace client ouvre très prochainement. ' + (CONTACT ? 'En attendant, <a href="mailto:' + CONTACT + '">écrivez-nous</a>.' : '') + '</p></div>';
    return;
  }
  var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
  // outils partagés avec la page de gestion (espace-admin.js)
  var E = window.AchaEspace = { sb: sb };

  // ---------- petits outils ----------
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    [].concat(kids || []).forEach(function (c) { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c)); });
    return el;
  }
  function show(view) { root.replaceChildren(view); window.scrollTo(0, 0); }
  function req(label) { return h('span', {}, [label, h('span', { class: 'ec-req', 'aria-hidden': 'true', text: ' *' })]); }
  function field(label, attrs, hint) {
    return h('label', { class: 'f' }, [label, h('input', attrs), hint ? h('span', { class: 'ec-hint', text: hint }) : null]);
  }
  function alertBox(msg, kind) { return h('p', { class: 'ec-alert' + (kind ? ' ' + kind : ''), role: 'alert', text: msg }); }
  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = on ? 'Un instant…' : label; }
  var eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  function date(d) { return d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : ''; }
  function dateTime(d) { return new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function notify(form, data) {
    // prévient l'équipe par e-mail via Netlify Forms (si le site est sur Netlify) ; un échec n'empêche rien
    var body = new URLSearchParams(Object.assign({ 'form-name': form }, data)).toString();
    fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body }).catch(function () {});
  }
  function frError(err) {
    var m = (err && err.message) || '';
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Confirmez d\'abord votre adresse : cliquez sur le lien reçu par e-mail.';
    if (/already registered|already exists/i.test(m)) return 'Un compte existe déjà avec cet e-mail. Connectez-vous ou réinitialisez votre mot de passe.';
    if (/Password should be/i.test(m)) return 'Le mot de passe doit contenir au moins 8 caractères.';
    if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Réessayez dans quelques minutes.';
    return 'Une erreur est survenue. Réessayez' + (CONTACT ? ', ou écrivez-nous à ' + CONTACT : '') + '.';
  }

  // SIRET : 14 chiffres et clé de contrôle (algorithme de Luhn ; La Poste fait exception).
  function siretOk(s) {
    if (!/^\d{14}$/.test(s)) return false;
    if (s.slice(0, 9) === '356000000') return s.split('').reduce(function (a, c) { return a + +c; }, 0) % 5 === 0;
    var sum = 0;
    for (var i = 0; i < 14; i++) { var d = +s[13 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; }
    return sum % 10 === 0;
  }
  // Registre officiel des entreprises (API publique et gratuite de l'État).
  function lookupSiret(siret) {
    return fetch('https://recherche-entreprises.api.gouv.fr/search?q=' + siret + '&per_page=1')
      .then(function (r) { if (!r.ok) throw new Error('api'); return r.json(); })
      .then(function (j) {
        var e = j.results && j.results[0];
        if (!e || e.siren !== siret.slice(0, 9)) return { found: false };
        var etab = (e.matching_etablissements || []).find(function (x) { return x.siret === siret; }) || (e.siege && e.siege.siret === siret ? e.siege : null);
        return { found: !!etab, nom: e.nom_complet, actif: e.etat_administratif === 'A' && (!etab || etab.etat_administratif !== 'F'), adresse: etab && etab.adresse };
      });
  }
  E.siretOk = siretOk; E.lookupSiret = lookupSiret; E.h = h; E.alertBox = alertBox; E.busy = busy;
  E.date = date; E.eur = eur; E.frError = frError;

  // ---------- connexion ----------
  function viewLogin(msg) {
    var err = h('div');
    var email = h('input', { type: 'email', name: 'email', autocomplete: 'email', required: true });
    var pass = h('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
    var btn = h('button', { class: 'btn primary', type: 'submit', text: 'Se connecter' });
    var form = h('form', { class: 'ec-form', onsubmit: function (e) {
      e.preventDefault(); err.replaceChildren(); busy(btn, true, 'Se connecter');
      sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value }).then(function (r) {
        busy(btn, false, 'Se connecter');
        if (r.error) err.append(alertBox(frError(r.error))); else route();
      });
    } }, [h('label', { class: 'f' }, ['E-mail', email]), h('label', { class: 'f' }, ['Mot de passe', pass]), err, btn,
      h('button', { class: 'ec-textbtn', type: 'button', text: 'Mot de passe oublié ?', onclick: function () { show(viewForgot(email.value)); } })]);
    show(h('div', { class: 'ec-split' }, [
      h('div', { class: 'ec-side' }, [h('p', { class: 'label', text: 'Espace client' }), h('h1', { class: 'ec-title', text: 'Votre projet, au même endroit.' }),
        h('p', { class: 'ec-muted', text: 'Suivez l\'avancement de votre projet marketing, retrouvez vos devis et factures, et échangez directement avec moi. Espace réservé aux professionnels.' }),
        h('ul', { class: 'ec-ticks' }, [h('li', { text: 'Avancement de votre projet, étape par étape' }), h('li', { text: 'Devis, factures et documents à télécharger' }), h('li', { text: 'Messages directs avec Anissa' })])]),
      h('div', { class: 'ec-card' }, [h('h2', { class: 'ec-h2', text: 'Connexion' }), msg ? alertBox(msg, 'ok') : null, form,
        h('p', { class: 'ec-switch' }, ['Pas encore de compte ? ', h('button', { class: 'ec-textbtn', type: 'button', text: 'Créer un compte professionnel', onclick: function () { show(viewSignup()); } })])])
    ]));
  }

  function viewForgot(prefill) {
    var err = h('div');
    var email = h('input', { type: 'email', autocomplete: 'email', required: true, value: prefill || '' });
    var btn = h('button', { class: 'btn primary', type: 'submit', text: 'Recevoir le lien' });
    return h('div', { class: 'ec-card ec-narrow' }, [h('h2', { class: 'ec-h2', text: 'Mot de passe oublié' }),
      h('p', { class: 'ec-muted', text: 'Nous vous envoyons un lien pour choisir un nouveau mot de passe.' }),
      h('form', { class: 'ec-form', onsubmit: function (e) {
        e.preventDefault(); busy(btn, true, 'Recevoir le lien');
        sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname }).then(function (r) {
          busy(btn, false, 'Recevoir le lien');
          if (r.error) err.replaceChildren(alertBox(frError(r.error))); else viewLogin('Si un compte existe pour cette adresse, un e-mail vient de vous être envoyé.');
        });
      } }, [h('label', { class: 'f' }, ['E-mail', email]), err, btn]),
      h('button', { class: 'ec-textbtn', type: 'button', text: '← Retour à la connexion', onclick: function () { viewLogin(); } })]);
  }

  function viewNewPassword() {
    var err = h('div');
    var pass = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
    var btn = h('button', { class: 'btn primary', type: 'submit', text: 'Enregistrer' });
    show(h('div', { class: 'ec-card ec-narrow' }, [h('h2', { class: 'ec-h2', text: 'Nouveau mot de passe' }),
      h('form', { class: 'ec-form', onsubmit: function (e) {
        e.preventDefault(); busy(btn, true, 'Enregistrer');
        sb.auth.updateUser({ password: pass.value }).then(function (r) {
          busy(btn, false, 'Enregistrer');
          if (r.error) err.replaceChildren(alertBox(frError(r.error))); else route();
        });
      } }, [h('label', { class: 'f' }, ['Mot de passe (8 caractères minimum)', pass]), err, btn])]));
  }

  // ---------- inscription ----------
  function viewSignup() {
    var err = h('div');
    var check = h('p', { class: 'ec-hint', 'aria-live': 'polite' });
    var verified = null;
    var f = {
      prenom: h('input', { name: 'prenom', autocomplete: 'given-name', required: true }),
      nom: h('input', { name: 'nom', autocomplete: 'family-name', required: true }),
      societe: h('input', { name: 'societe', autocomplete: 'organization', required: true }),
      siret: h('input', { name: 'siret', inputmode: 'numeric', autocomplete: 'off', required: true, placeholder: '14 chiffres' }),
      telephone: h('input', { name: 'telephone', type: 'tel', autocomplete: 'tel', required: true, pattern: '[0-9 +\\(\\)\\.\\-]{10,20}', title: 'Numéro de téléphone (10 chiffres minimum)' }),
      email: h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true }),
      password: h('input', { name: 'password', type: 'password', autocomplete: 'new-password', minlength: 8, required: true })
    };
    var consent = h('input', { type: 'checkbox', required: true });
    function clean() { return f.siret.value.replace(/\D/g, ''); }
    function runCheck() {
      var s = clean(); verified = null; check.className = 'ec-hint';
      if (!s) { check.textContent = ''; return; }
      if (!siretOk(s)) { check.textContent = s.length === 14 ? 'Ce numéro de SIRET n\'est pas valide.' : 'Le SIRET compte 14 chiffres.'; check.className = 'ec-hint bad'; return; }
      check.textContent = 'Vérification dans le registre des entreprises…';
      lookupSiret(s).then(function (r) {
        if (clean() !== s) return;
        if (!r.found) { verified = false; check.textContent = 'SIRET introuvable dans le registre. Vérifiez le numéro.'; check.className = 'ec-hint bad'; return; }
        if (!r.actif) { verified = false; check.textContent = r.nom + ' : établissement fermé selon le registre.'; check.className = 'ec-hint bad'; return; }
        verified = true; check.textContent = '✓ ' + r.nom + (r.adresse ? ' · ' + r.adresse : ''); check.className = 'ec-hint ok';
        if (!f.societe.value) f.societe.value = r.nom;
      }).catch(function () { verified = null; check.textContent = 'Registre indisponible pour le moment : nous vérifierons à la main.'; });
    }
    f.siret.addEventListener('change', runCheck);
    f.siret.addEventListener('blur', runCheck);
    var btn = h('button', { class: 'btn primary', type: 'submit', text: 'Créer mon compte' });
    var form = h('form', { class: 'ec-form', onsubmit: function (e) {
      e.preventDefault(); err.replaceChildren();
      var s = clean();
      if (!siretOk(s)) { err.append(alertBox('Indiquez un numéro de SIRET valide (14 chiffres).')); f.siret.focus(); return; }
      if (verified === false) { err.append(alertBox('Ce SIRET ne correspond pas à un établissement actif. Vérifiez le numéro ou écrivez-nous.')); return; }
      busy(btn, true, 'Créer mon compte');
      var meta = { prenom: f.prenom.value.trim(), nom: f.nom.value.trim(), societe: f.societe.value.trim(), siret: s, telephone: f.telephone.value.trim(), siret_verifie: verified === true };
      sb.auth.signUp({ email: f.email.value.trim(), password: f.password.value, options: { data: meta, emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
        busy(btn, false, 'Créer mon compte');
        if (r.error) { err.append(alertBox(frError(r.error))); return; }
        if (r.data && r.data.user && r.data.user.identities && r.data.user.identities.length === 0) { err.append(alertBox(frError({ message: 'already registered' }))); return; }
        notify('inscription-pro', { societe: meta.societe, siret: s, email: f.email.value.trim(), nom: meta.prenom + ' ' + meta.nom, telephone: meta.telephone, 'siret-verifie': meta.siret_verifie ? 'oui' : 'non' });
        if (r.data.session) route();
        else show(viewCheckEmail(f.email.value.trim()));
      });
    } }, [
      h('div', { class: 'ec-row2' }, [h('label', { class: 'f' }, [req('Prénom'), f.prenom]), h('label', { class: 'f' }, [req('Nom'), f.nom])]),
      h('label', { class: 'f' }, [req('SIRET de l\'entreprise'), f.siret, check]),
      h('label', { class: 'f' }, [req('Raison sociale'), f.societe]),
      h('div', { class: 'ec-row2' }, [h('label', { class: 'f' }, [req('E-mail professionnel'), f.email]), h('label', { class: 'f' }, [req('Téléphone'), f.telephone])]),
      h('label', { class: 'f' }, [req('Mot de passe (8 caractères minimum)'), f.password]),
      h('label', { class: 'ec-consent' }, [consent, h('span', {}, ['Je certifie agir pour le compte de cette entreprise et j\'accepte que ' + MARQUE + ' utilise ces informations pour gérer mon compte. Voir la ', h('a', { href: cfg.confidentialite || '#', text: 'politique de confidentialité' }), '.'])]),
      h('p', { class: 'ec-hint' }, [h('span', { class: 'ec-req', 'aria-hidden': 'true', text: '*' }), ' Champs obligatoires']),
      err, btn
    ]);
    return h('div', { class: 'ec-split' }, [
      h('div', { class: 'ec-side' }, [h('p', { class: 'label', text: 'Compte professionnel' }), h('h1', { class: 'ec-title', text: 'Créer votre espace client' }),
        h('ol', { class: 'ec-steps' }, [
          h('li', {}, [h('b', { text: 'Vos informations' }), ' Le SIRET est vérifié automatiquement dans le registre des entreprises.']),
          h('li', {}, [h('b', { text: 'Votre Kbis' }), ' Un extrait de moins de 3 mois, en PDF ou en photo.']),
          h('li', {}, [h('b', { text: 'Validation' }), ' Nous vérifions votre dossier ' + DELAI + ', puis votre espace s\'ouvre.'])])]),
      h('div', { class: 'ec-card' }, [h('h2', { class: 'ec-h2', text: 'Inscription' }), form,
        h('p', { class: 'ec-switch' }, ['Déjà un compte ? ', h('button', { class: 'ec-textbtn', type: 'button', text: 'Se connecter', onclick: function () { viewLogin(); } })])])
    ]);
  }

  function viewCheckEmail(email) {
    return h('div', { class: 'ec-card ec-narrow' }, [h('p', { class: 'label', text: 'Étape 1 sur 3' }), h('h2', { class: 'ec-h2', text: 'Confirmez votre adresse e-mail' }),
      h('p', { class: 'ec-muted' }, ['Un lien de confirmation vient d\'être envoyé à ', h('b', { text: email }), '. Cliquez dessus pour revenir ici et déposer votre Kbis.']),
      h('button', { class: 'ec-textbtn', type: 'button', text: '← Retour à la connexion', onclick: function () { viewLogin(); } })]);
  }

  // ---------- Kbis et attente ----------
  function viewKbis(p) {
    var err = h('div');
    var file = h('input', { type: 'file', accept: 'application/pdf,image/jpeg,image/png', required: true });
    var btn = h('button', { class: 'btn primary', type: 'submit', text: 'Envoyer mon Kbis' });
    var refus = p.statut === 'refuse';
    return page(p, h('div', { class: 'ec-card ec-narrow' }, [
      h('p', { class: 'label', text: refus ? 'Dossier à corriger' : 'Étape 2 sur 3' }),
      h('h2', { class: 'ec-h2', text: refus ? 'Votre dossier n\'a pas pu être validé' : 'Déposez votre extrait Kbis' }),
      refus && p.motif_refus ? alertBox('Motif : ' + p.motif_refus) : null,
      h('p', { class: 'ec-muted', text: 'Extrait Kbis de ' + (p.societe || 'votre entreprise') + ', de moins de 3 mois. PDF, JPG ou PNG, 5 Mo maximum.' }),
      h('form', { class: 'ec-form', onsubmit: function (e) {
        e.preventDefault(); err.replaceChildren();
        var fl = file.files[0];
        if (!fl) return;
        if (fl.size > 5 * 1024 * 1024) { err.append(alertBox('Le fichier dépasse 5 Mo.')); return; }
        if (!/^(application\/pdf|image\/(jpeg|png))$/.test(fl.type)) { err.append(alertBox('Format accepté : PDF, JPG ou PNG.')); return; }
        busy(btn, true, 'Envoyer mon Kbis');
        var ext = (fl.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
        var path = p.id + '/kbis-' + Date.now() + '.' + ext;
        sb.storage.from('kbis').upload(path, fl, { contentType: fl.type }).then(function (r) {
          if (r.error) throw r.error;
          return sb.rpc('soumettre_kbis', { chemin: path });
        }).then(function (r) {
          if (r && r.error) throw r.error;
          route();
        }).catch(function (e2) { busy(btn, false, 'Envoyer mon Kbis'); err.append(alertBox(frError(e2))); });
      } }, [h('label', { class: 'f' }, ['Votre Kbis', file]), err, btn])]));
  }

  function viewPending(p) {
    return page(p, h('div', { class: 'ec-card ec-narrow' }, [h('p', { class: 'label', text: 'Étape 3 sur 3' }),
      h('h2', { class: 'ec-h2', text: 'Dossier en cours de vérification' }),
      h('p', { class: 'ec-muted', text: 'Merci ! Nous vérifions votre Kbis et votre SIRET ' + DELAI + '. Vous pourrez ensuite accéder à votre espace avec vos identifiants.' }),
      h('button', { class: 'btn ghost', type: 'button', text: 'Remplacer mon Kbis', onclick: function () { show(viewKbis(p)); } })]));
  }

  // ---------- éléments communs des tableaux de bord (repris par espace-admin.js) ----------
  var ETAPES = cfg.etapes && cfg.etapes.length === 4 ? cfg.etapes : ['Diagnostic', 'Maquette', 'Construction', 'Lancement'];
  var STATUTS = { en_cours: 'En cours', en_pause: 'En pause', termine: 'Terminé' };
  var TYPES = { devis: 'Devis', facture: 'Facture', document: 'Document' };
  var DOC_STATUTS = { devis: ['à signer', 'signé', 'refusé'], facture: ['à payer', 'payée'], document: [] };
  E.MARQUE = MARQUE; E.COURT = COURT; E.ETAPES = ETAPES; E.STATUTS = STATUTS; E.TYPES = TYPES; E.DOC_STATUTS = DOC_STATUTS; E.dateTime = dateTime;

  var NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    projet: '<path d="M12 3.5l8.5 4.5-8.5 4.5-8.5-4.5z"/><path d="M3.5 12.5l8.5 4.5 8.5-4.5"/><path d="M3.5 16.5l8.5 4.5 8.5-4.5"/>',
    devis: '<path d="M14 3.5H6.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8z"/><path d="M14 3.5V8h4.5"/><path d="M9 12.5h6M9 16h4"/>',
    facture: '<path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 11.5h6M9 15h3"/>',
    doc: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
    msg: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    entreprise: '<path d="M4.5 20.5V5l7.5-2v17.5"/><path d="M12 9h7.5v11.5"/><path d="M3 20.5h18"/><path d="M8 8.5v.01M8 12v.01M8 15.5v.01M15.5 12.5v.01M15.5 16v.01"/>',
    reglages: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
    sortie: '<path d="M14.5 4h4.5v16h-4.5"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    valider: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 11l2 2 4-4"/>',
    clients: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M15.5 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .7 3.5 2.6 3.5 5.5"/>',
    crayon: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    site: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  function icon(n) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ec-ico'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[n] || '';
    return s;
  }

  // Mise en page commune : menu latéral (repliable sur mobile) et contenu.
  function shell(o) {
    var aside;
    var current = '';
    var secs = o.nav.map(function (sec) {
      return h('div', { class: 'ec-nav-sec' }, [h('p', { class: 'ec-nav-title', text: sec.title }),
        h('ul', {}, sec.items.map(function (it) {
          var on = it.id === o.active;
          if (on) current = it.label;
          return h('li', {}, [h('a', { href: it.href || '#' + it.id, class: on ? 'on' : null, 'aria-current': on ? 'page' : null,
            target: it.href ? '_blank' : null, rel: it.href ? 'noopener' : null, onclick: function () { aside.classList.remove('open'); } },
            [icon(it.icon), h('span', { text: it.label }), it.badge ? h('b', { class: 'ec-nav-badge', text: String(it.badge) }) : null])]);
        }))]);
    });
    var toggle = h('button', { class: 'ec-menu-btn', type: 'button', 'aria-expanded': 'false', onclick: function () {
      toggle.setAttribute('aria-expanded', String(aside.classList.toggle('open')));
    } }, [icon('menu'), h('span', { text: o.label }), h('small', { text: current })]);
    var initials = (o.who || '?').split(/\s+/).map(function (w) { return w[0] || ''; }).join('').slice(0, 2).toUpperCase();
    aside = h('aside', { class: 'ec-aside' }, [
      h('div', { class: 'ec-who' }, [h('span', { class: 'ec-avatar', 'aria-hidden': 'true', text: initials }), h('span', {}, [h('b', { text: o.who }), h('small', { text: o.whoSub || '' })])]),
      h('nav', { 'aria-label': o.label }, secs),
      h('button', { class: 'ec-nav-out', type: 'button', onclick: o.logout }, [icon('sortie'), h('span', { text: 'Déconnexion' })])]);
    return h('div', { class: 'ec-shell' }, [toggle, aside, h('div', { class: 'ec-main' }, [
      h('header', { class: 'ec-head' }, [h('div', {}, [h('p', { class: 'label', text: o.kicker }), h('h1', { class: 'ec-title sm', text: o.title })]),
        o.actions ? h('div', { class: 'ec-head-act' }, o.actions) : null]),
      o.body])]);
  }
  function kpi(label, value, sub, href, tone) {
    return h('a', { class: 'ec-kpi' + (tone ? ' ' + tone : ''), href: href }, [h('span', { class: 'ec-kpi-label', text: label }), h('b', { text: String(value) }), sub ? h('small', { text: sub }) : null]);
  }
  function secHead(title, href, more) {
    return h('div', { class: 'ec-sec-head' }, [h('h2', { class: 'ec-h2', text: title }), href ? h('a', { class: 'ec-more', href: href, text: (more || 'Tout voir') + ' →' }) : null]);
  }
  function empty(text) { return h('p', { class: 'ec-muted', text: text }); }
  function total(list) { return list.reduce(function (a, d) { return a + (+d.montant || 0); }, 0); }
  function bar(v) {
    return h('div', { class: 'ec-bar', role: 'progressbar', 'aria-valuenow': v, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Avancement' }, [h('i', { style: 'width:' + v + '%' })]);
  }
  E.icon = icon; E.shell = shell; E.kpi = kpi; E.secHead = secHead; E.empty = empty; E.total = total; E.bar = bar;

  function projetCard(pr) {
    return h('article', { class: 'ec-projet' }, [
      h('div', { class: 'ec-projet-top' }, [h('h3', { text: pr.titre }), h('span', { class: 'ec-badge s-' + pr.statut, text: STATUTS[pr.statut] || pr.statut })]),
      pr.description ? h('p', { class: 'ec-muted', text: pr.description }) : null,
      h('ol', { class: 'ec-stepper' }, ETAPES.map(function (n, i) {
        return h('li', { class: i + 1 < pr.etape ? 'done' : i + 1 === pr.etape ? 'now' : '' }, [h('span', { text: '0' + (i + 1) }), n]);
      })),
      bar(pr.progression),
      h('p', { class: 'ec-meta', text: pr.progression + ' % · mis à jour le ' + date(pr.updated_at) + (pr.echeance ? ' · mise en ligne prévue le ' + date(pr.echeance) : '') })
    ]);
  }
  E.projetCard = projetCard;

  function download(d) {
    return h('button', { class: 'ec-textbtn', type: 'button', text: 'Télécharger', onclick: function () {
      sb.storage.from('documents').createSignedUrl(d.chemin, 120, { download: d.nom }).then(function (r) { if (r.data) location.href = r.data.signedUrl; });
    } });
  }
  function docRow(d, extra) {
    return h('li', { class: 'ec-doc' }, [h('span', { class: 'ec-badge t-' + d.type, text: TYPES[d.type] || d.type }),
      h('span', { class: 'ec-doc-name' }, [h('b', { text: d.nom }), h('small', { text: date(d.created_at) + (d.statut ? ' · ' + d.statut : '') })]),
      h('span', { class: 'ec-doc-amount', text: d.montant != null ? eur.format(d.montant) : '' }), h('span', { class: 'ec-doc-act' }, [download(d), extra])]);
  }
  E.download = download; E.docRow = docRow;

  function bubble(m, mine) {
    return h('div', { class: 'ec-msg ' + (m.auteur === mine ? 'me' : 'them') }, [h('p', { text: m.contenu }), h('small', { text: (m.auteur === 'acha' ? COURT + ' · ' : '') + dateTime(m.created_at) })]);
  }
  function thread(list, mine) {
    var box = h('div', { class: 'ec-thread' }, list.length ? list.map(function (m) { return bubble(m, mine); }) : [empty('Aucun message pour le moment.')]);
    setTimeout(function () { box.scrollTop = box.scrollHeight; }, 0);
    return box;
  }
  E.bubble = bubble; E.thread = thread;

  // ---------- espace du client validé ----------
  var S = null; // données du client connecté
  function seenKey() { return 'ec-vu-' + S.p.id; }
  function lastSeen() { try { return localStorage.getItem(seenKey()) || ''; } catch (e) { return ''; } }
  function markSeen() { try { localStorage.setItem(seenKey(), new Date().toISOString()); } catch (e) {} }
  function unread() { var s = lastSeen(); return S.msgs.filter(function (m) { return m.auteur === 'acha' && m.created_at > s; }).length; }
  function docsOf(type) { return S.docs.filter(function (d) { return d.type === type; }); }
  function docList(list) { return h('ul', { class: 'ec-docs' }, list.map(function (d) { return docRow(d); })); }

  function load(p) {
    return Promise.all([
      sb.from('projets').select('*').order('created_at', { ascending: false }),
      sb.from('documents').select('*').order('created_at', { ascending: false }),
      sb.from('messages').select('*').order('created_at')
    ]).then(function (res) { S = { p: p, projets: res[0].data || [], docs: res[1].data || [], msgs: res[2].data || [] }; });
  }
  function app(p) { root.replaceChildren(h('p', { class: 'ec-loading', text: 'Chargement…' })); load(p).then(function () { render(true); }); }
  function logout() { sb.auth.signOut().then(function () { S = null; history.replaceState(null, '', location.pathname); viewLogin(); }); }

  var CLIENT = {
    'tableau-de-bord': function () {
      var actifs = S.projets.filter(function (pr) { return pr.statut !== 'termine'; });
      var main = actifs[0] || S.projets[0];
      var devis = docsOf('devis').filter(function (d) { return d.statut === 'à signer'; });
      var fact = docsOf('facture').filter(function (d) { return d.statut === 'à payer'; });
      var n = unread();
      var last = S.msgs[S.msgs.length - 1];
      return { title: 'Bonjour ' + (S.p.prenom || ''), body: h('div', { class: 'ec-stack' }, [
        h('div', { class: 'ec-kpis' }, [
          kpi('Votre projet', main ? main.progression + ' %' : '—', main ? 'Étape ' + main.etape + ' · ' + ETAPES[main.etape - 1] : 'Bientôt lancé', '#projets', 'acc'),
          kpi('Devis à signer', devis.length, devis.length ? eur.format(total(devis)) : 'Rien en attente', '#devis', devis.length ? 'warn' : ''),
          kpi('Factures à régler', eur.format(total(fact)), fact.length ? fact.length + ' facture' + (fact.length > 1 ? 's' : '') : 'Tout est réglé', '#factures', fact.length ? 'warn' : ''),
          kpi('Messages', n, n ? (n > 1 ? 'nouveaux messages' : 'nouveau message') : (last ? 'À jour · dernier échange le ' + date(last.created_at) : 'Écrivez-nous'), '#messages', n ? 'acc' : '')]),
        h('section', { class: 'ec-block' }, [secHead('Votre projet', S.projets.length > 1 ? '#projets' : null, 'Tous mes projets'),
          main ? projetCard(main) : empty('Votre projet apparaîtra ici dès son lancement.')]),
        h('div', { class: 'ec-dash' }, [
          h('section', { class: 'ec-block' }, [secHead('Derniers documents'), S.docs.length ? docList(S.docs.slice(0, 4)) : empty('Vos devis, factures et documents apparaîtront ici.')]),
          h('section', { class: 'ec-block' }, [secHead('Dernier message', '#messages', 'Ouvrir la messagerie'), last ? h('div', { class: 'ec-thread' }, [bubble(last, 'client')]) : empty('Une question ? Écrivez-moi depuis la messagerie.')])])])};
    },
    projets: function () {
      return { title: 'Mes projets', body: h('section', { class: 'ec-block' }, [S.projets.length ? h('div', { class: 'ec-projets' }, S.projets.map(projetCard)) : empty('Votre projet apparaîtra ici dès son lancement.')]) };
    },
    messages: function () {
      var text = h('textarea', { rows: 3, required: true, maxlength: 5000, placeholder: 'Votre message à Anissa…' });
      var err = h('div');
      var send = h('button', { class: 'btn primary', type: 'submit', text: 'Envoyer' });
      return { title: 'Messages', body: h('section', { class: 'ec-block' }, [thread(S.msgs, 'client'),
        h('form', { class: 'ec-form ec-send', onsubmit: function (e) {
          e.preventDefault(); err.replaceChildren();
          var v = text.value.trim(); if (!v) return;
          busy(send, true, 'Envoyer');
          sb.from('messages').insert({ client_id: S.p.id, auteur: 'client', contenu: v }).then(function (r) {
            busy(send, false, 'Envoyer');
            if (r.error) { err.append(alertBox(frError(r.error))); return; }
            notify('message-client', { societe: S.p.societe, email: S.p.email, message: v });
            load(S.p).then(function () { render(false); });
          });
        } }, [h('label', { class: 'f' }, ['Nouveau message', text]), err, send])]) };
    },
    devis: function () { return docsView('devis', 'Mes devis', 'Vos devis apparaîtront ici.', 'à signer', 'À signer'); },
    factures: function () { return docsView('facture', 'Mes factures', 'Vos factures apparaîtront ici.', 'à payer', 'Reste à régler'); },
    documents: function () { return docsView('document', 'Mes documents', 'Plans d\'action, rapports, guides : vos documents apparaîtront ici.'); },
    entreprise: function () {
      var p = S.p;
      return { title: 'Mon entreprise', body: h('section', { class: 'ec-block' }, [
        h('dl', { class: 'ec-dl' }, [
          h('dt', { text: 'Raison sociale' }), h('dd', { text: p.societe }),
          h('dt', { text: 'SIRET' }), h('dd', { text: p.siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4') }),
          h('dt', { text: 'Contact' }), h('dd', { text: p.prenom + ' ' + p.nom }),
          h('dt', { text: 'E-mail' }), h('dd', { text: p.email }),
          h('dt', { text: 'Téléphone' }), h('dd', { text: p.telephone || '—' }),
          h('dt', { text: 'Compte' }), h('dd', {}, [h('span', { class: 'ec-badge p-valide', text: 'Validé' }), p.validated_at ? ' depuis le ' + date(p.validated_at) : '']),
          h('dt', { text: 'Kbis' }), h('dd', {}, [p.kbis_path ? h('button', { class: 'ec-textbtn', type: 'button', text: 'Voir mon Kbis', onclick: function () {
            sb.storage.from('kbis').createSignedUrl(p.kbis_path, 120).then(function (r) { if (r.data) window.open(r.data.signedUrl, '_blank', 'noopener'); });
          } }) : '—'])]),
        h('p', { class: 'ec-hint' }, ['Une information a changé ? ', h('a', { href: '#messages', text: 'Écrivez-nous' }), ' et nous la mettons à jour.'])]) };
    },
    parametres: function () {
      var err = h('div');
      var pass = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
      var btn = h('button', { class: 'btn primary', type: 'submit', text: 'Changer le mot de passe' });
      return { title: 'Paramètres', body: h('div', { class: 'ec-dash' }, [
        h('section', { class: 'ec-block' }, [h('h2', { class: 'ec-h2', text: 'Mot de passe' }),
          h('form', { class: 'ec-form', onsubmit: function (e) {
            e.preventDefault(); busy(btn, true, 'Changer le mot de passe');
            sb.auth.updateUser({ password: pass.value }).then(function (r) {
              busy(btn, false, 'Changer le mot de passe');
              err.replaceChildren(r.error ? alertBox(frError(r.error)) : alertBox('Mot de passe modifié.', 'ok'));
              if (!r.error) pass.value = '';
            });
          } }, [h('label', { class: 'f' }, ['Nouveau mot de passe (8 caractères minimum)', pass]), err, btn])]),
        h('section', { class: 'ec-block' }, [h('h2', { class: 'ec-h2', text: 'Connexion' }),
          h('p', { class: 'ec-muted' }, ['Vous êtes connecté avec ', h('b', { text: S.p.email }), '.']),
          h('div', { class: 'ec-actions' }, [h('button', { class: 'btn ghost', type: 'button', text: 'Se déconnecter', onclick: logout })])])]) };
    }
  };

  function docsView(type, title, emptyText, pending, pendingLabel) {
    var list = docsOf(type);
    var wait = pending ? list.filter(function (d) { return d.statut === pending; }) : [];
    return { title: title, body: h('section', { class: 'ec-block' }, [
      wait.length ? h('div', { class: 'ec-sums' }, [h('span', { class: 'ec-sum' }, [pendingLabel + ' : ', h('b', { text: eur.format(total(wait)) }), ' · ' + wait.length + ' document' + (wait.length > 1 ? 's' : '')])]) : null,
      list.length ? docList(list) : empty(emptyText)]) };
  }

  function clientNav() {
    var devis = docsOf('devis').filter(function (d) { return d.statut === 'à signer'; }).length;
    var fact = docsOf('facture').filter(function (d) { return d.statut === 'à payer'; }).length;
    return [
      { title: 'Mon espace', items: [{ id: 'tableau-de-bord', label: 'Tableau de bord', icon: 'grid' }, { id: 'projets', label: 'Mes projets', icon: 'projet' },
        { id: 'messages', label: 'Messages', icon: 'msg', badge: unread() }] },
      { title: 'Documents', items: [{ id: 'devis', label: 'Mes devis', icon: 'devis', badge: devis }, { id: 'factures', label: 'Mes factures', icon: 'facture', badge: fact },
        { id: 'documents', label: 'Mes documents', icon: 'doc' }] },
      { title: 'Compte', items: [{ id: 'entreprise', label: 'Mon entreprise', icon: 'entreprise' }, { id: 'parametres', label: 'Paramètres', icon: 'reglages' }] }];
  }

  function render(top) {
    var id = location.hash.slice(1);
    if (!CLIENT[id]) id = 'tableau-de-bord';
    if (id === 'messages') markSeen();
    var v = CLIENT[id]();
    root.replaceChildren(shell({ label: 'Espace client', who: S.p.prenom + ' ' + S.p.nom, whoSub: S.p.societe, nav: clientNav(), active: id,
      kicker: 'Espace client · ' + (S.p.societe || ''), title: v.title, body: v.body, logout: logout }));
    if (top) window.scrollTo(0, 0);
  }

  function page(p, body) {
    return h('div', { class: 'ec-page' }, [
      h('header', { class: 'ec-head' }, [h('div', {}, [h('p', { class: 'label', text: 'Espace client' + (p.societe ? ' · ' + p.societe : '') }),
        h('h1', { class: 'ec-title sm', text: 'Votre compte professionnel' })]),
        h('button', { class: 'btn ghost', type: 'button', text: 'Se déconnecter', onclick: logout })]),
      body]);
  }

  // ---------- aiguillage ----------
  if (!root) { document.dispatchEvent(new Event('acha-espace-pret')); return; }
  var recovery = /type=recovery/.test(location.hash);
  function route() {
    if (recovery) { recovery = false; return viewNewPassword(); }
    sb.auth.getSession().then(function (s) {
      var session = s.data.session;
      if (!session) return viewLogin();
      sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(function (r) {
        var p = r.data;
        if (!p) return show(h('div', { class: 'ec-card ec-narrow' }, [alertBox('Profil introuvable.' + (CONTACT ? ' Écrivez-nous à ' + CONTACT + '.' : ''))]));
        if (p.statut === 'valide') return app(p);
        if (p.statut === 'en_attente') return show(viewPending(p));
        return show(viewKbis(p));
      });
    });
  }
  window.addEventListener('hashchange', function () { if (S) render(true); });
  sb.auth.onAuthStateChange(function (ev) { if (ev === 'PASSWORD_RECOVERY') { recovery = false; viewNewPassword(); } });
  route();
})();
